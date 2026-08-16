#!/usr/bin/env python3
"""
AirLLM bridge — OpenAI-compatible /v1/chat/completions in front of the
AirLLM library (https://github.com/lyogavin/airllm), which has no HTTP
server of its own. Loads exactly one model at startup; restart with a
different --model to switch (AirLLM has no fast model-swap, matching how
llama.cpp's own `server` binary also pins one model per process).

Yana's terminal chat (yana-rt chat --provider airllm) talks to this the
same way it already talks to Ollama/LM Studio/llama.cpp/TurboFieldfare:
a loopback HTTP server this script runs, that Yana's Rust side never
launches or manages itself.

Known limitation, not hidden: AirLLM's documented API has no per-token
streaming callback, so every response is generated in full, then sent as
ONE SSE delta event (not a real token-by-token stream). The chat UI will
show the full answer appear at once rather than streaming in.

Usage:
  pip install airllm
  python3 tools/airllm-bridge/server.py --model <hf-model-id>
  python3 tools/airllm-bridge/server.py --model Qwen/Qwen3-32B --port 8100

Binds 127.0.0.1 only — never 0.0.0.0 (see core/rules/66-client-secret-
encryption-law.md's server rules and every other local provider's own
loopback-only design in src/chat/openai_compat.rs).
"""

import argparse
import json
import sys
import threading
import time
import traceback
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MODEL = None
MODEL_ID = None

# A generous bound on a chat request body (long conversation history is
# legitimate; an attacker-controlled or garbled Content-Length is not) —
# see do_POST's validation below.
MAX_REQUEST_BODY_BYTES = 10 * 1024 * 1024

# BUG FIX (Workstream A stabilization doc, Section 11 — Admission):
# explicit, documented default rather than a silently-guessed one. AirLLM
# itself doesn't report a model's context window through a stable public
# API, so this cannot be derived automatically; --max-context-tokens lets
# a caller override it for a model actually rated higher. Checked in
# generate() below, before the (expensive, GPU-bound) .generate() call —
# a too-long prompt is rejected with a clear 400, not left to whatever
# CUDA/tensor-shape error the model happens to raise once it notices on
# its own.
DEFAULT_MAX_CONTEXT_TOKENS = 4096
MAX_CONTEXT_TOKENS = DEFAULT_MAX_CONTEXT_TOKENS

# BUG FIX (Workstream A correction pass, follow-up to the Section 11 fix
# below): MAX_CONTEXT_TOKENS is named and documented as the model's
# context window, but the original check only compared it against
# prompt_token_count -- MODEL.generate() below always reserves this many
# ADDITIONAL tokens for the response on top of the prompt. A prompt just
# under the ceiling (e.g. 4000 tokens against a 4096 ceiling) passed
# admission and then generation requested up to 4000 + 1024 = 5024 total
# tokens, silently exceeding the real context window the ceiling was
# supposed to represent. generate()'s check now compares
# prompt_token_count + MAX_NEW_TOKENS against MAX_CONTEXT_TOKENS, so the
# name and the enforced invariant actually agree. A named constant
# (rather than the bare 1024 previously inlined only at the .generate()
# call site) so the check and the actual reservation can never drift
# apart from each other again.
MAX_NEW_TOKENS = 1024

# BUG FIX (Workstream A stabilization doc, Section 11 — Admission):
# BaseHTTPRequestHandler sets no socket timeout by default, so a client
# that opens a connection and then stalls (a valid Content-Length header
# followed by a slow/absent body, i.e. slowloris) leaves do_POST's
# self.rfile.read(length) blocked indefinitely. Handler.timeout (set on
# the class below) bounds every blocking socket operation for a
# connection, header read included, so a stalled peer is dropped instead
# of holding a thread forever.
SOCKET_READ_TIMEOUT_SECS = 30

# AirLLM/transformers model objects are not documented as safe for
# concurrent .generate() calls from multiple threads — ThreadingHTTPServer
# hands each request its own thread, so without this lock two simultaneous
# requests (two open chat tabs, a client retry racing the first attempt)
# could corrupt shared model/cache state instead of just running slower.
# Serializing here trades concurrency for correctness, matching the
# already-blocking, one-request-at-a-time nature of AirLLM's own API.
#
# BUG FIX (Workstream A stabilization doc, Section 11 — Admission): this
# lock alone doesn't bound anything — `with GENERATE_LOCK:` blocks
# forever, so any number of concurrent requests each spawn a
# ThreadingHTTPServer thread and queue up indefinitely waiting to
# acquire it, with no limit and no 429/503 ever returned. AirLLM only
# supports one generation at a time regardless (that's the reason this
# lock exists), so queueing a second request behind the first is never
# useful work — generate() now uses a non-blocking acquire and the
# caller (do_POST) turns "already busy" into an immediate 503 instead of
# growing an unbounded wait queue.
GENERATE_LOCK = threading.Lock()


class ModelOverloaded(Exception):
    """Raised when GENERATE_LOCK is already held — the model is mid-generation
    for another request. Distinct from a real generation failure so do_POST
    can return 503 (retry-able) instead of 500 (something is actually
    broken)."""


class ContextTooLong(Exception):
    """Raised when a prompt's token count exceeds MAX_CONTEXT_TOKENS,
    checked BEFORE the GPU-bound .generate() call. Carries the counts so
    the HTTP response can be specific."""

    def __init__(self, prompt_tokens: int, max_tokens: int):
        self.prompt_tokens = prompt_tokens
        self.max_tokens = max_tokens
        super().__init__(
            f"prompt has {prompt_tokens} tokens, exceeds max_context_tokens={max_tokens}"
        )


def load_model(model_id: str) -> None:
    global MODEL, MODEL_ID
    try:
        from airllm import AutoModel
    except ImportError:
        sys.exit(
            "airllm is not installed — run: pip install airllm\n"
            "(AirLLM also requires a working torch/CUDA setup; see "
            "https://github.com/lyogavin/airllm for details)"
        )
    print(f"[airllm-bridge] loading {model_id} — this can take a while...")
    try:
        MODEL = AutoModel.from_pretrained(model_id)
    except Exception as error:
        sys.exit(
            f"[airllm-bridge] failed to load {model_id}: {error}\n"
            "Check the model id, disk space, and your torch/CUDA setup."
        )
    MODEL_ID = model_id
    print(f"[airllm-bridge] {model_id} ready")


def build_prompt(messages: list) -> str:
    """Model-agnostic chat formatting via the tokenizer's own chat
    template, not a hand-rolled format that would only work for one
    model family."""
    return MODEL.tokenizer.apply_chat_template(
        messages, tokenize=False, add_generation_prompt=True
    )


def generate(messages: list) -> tuple:
    """Returns (text, prompt_tokens, completion_tokens). Blocking — AirLLM
    has no streaming generation hook to report progress mid-call.

    Raises ModelOverloaded (without blocking) if another request is
    already generating, and ContextTooLong if the prompt exceeds
    MAX_CONTEXT_TOKENS — both checked before any GPU work, so do_POST can
    turn them into a specific 503/400 instead of either hanging or
    surfacing an opaque downstream failure."""
    if not GENERATE_LOCK.acquire(blocking=False):
        raise ModelOverloaded()
    try:
        prompt = build_prompt(messages)
        input_tokens = MODEL.tokenizer(
            prompt, return_tensors="pt", return_attention_mask=False
        )
        prompt_token_count = input_tokens["input_ids"].shape[-1]
        if prompt_token_count + MAX_NEW_TOKENS > MAX_CONTEXT_TOKENS:
            raise ContextTooLong(prompt_token_count, MAX_CONTEXT_TOKENS)
        output = MODEL.generate(
            input_tokens["input_ids"].cuda(),
            max_new_tokens=MAX_NEW_TOKENS,
            use_cache=True,
            return_dict_in_generate=True,
        )
        full_ids = output.sequences[0]
        completion_ids = full_ids[prompt_token_count:]
        text = MODEL.tokenizer.decode(completion_ids, skip_special_tokens=True)
        return text, prompt_token_count, int(completion_ids.shape[-1])
    finally:
        GENERATE_LOCK.release()


def sse_event(payload: dict) -> bytes:
    return f"data: {json.dumps(payload)}\n\n".encode("utf-8")


class Handler(BaseHTTPRequestHandler):
    server_version = "airllm-bridge/1"
    # See SOCKET_READ_TIMEOUT_SECS's own comment above — bounds every
    # blocking socket read for a connection (header line, headers, and
    # do_POST's body read), so a stalled/slowloris peer is dropped instead
    # of holding a thread forever.
    timeout = SOCKET_READ_TIMEOUT_SECS

    def log_message(self, fmt, *args):
        print(f"[airllm-bridge] {self.address_string()} - {fmt % args}")

    def _json(self, status: int, body: dict) -> None:
        payload = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        if self.path.rstrip("/") == "/v1/models":
            self._json(200, {"data": [{"id": MODEL_ID}]})
            return
        self._json(404, {"error": "not found"})

    def do_POST(self):
        if self.path.rstrip("/") != "/v1/chat/completions":
            self._json(404, {"error": "not found"})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self._json(400, {"error": "invalid Content-Length header"})
            return
        if length < 0 or length > MAX_REQUEST_BODY_BYTES:
            self._json(413, {"error": "request body too large or malformed"})
            return
        raw = self.rfile.read(length) if length else b"{}"
        try:
            request = json.loads(raw)
        except json.JSONDecodeError as error:
            self._json(400, {"error": f"invalid JSON body: {error}"})
            return

        messages = request.get("messages", [])
        if not messages:
            self._json(400, {"error": "messages must be a non-empty array"})
            return

        try:
            text, prompt_tokens, completion_tokens = generate(messages)
        except ModelOverloaded:
            # Fail fast, not queue: AirLLM only supports one generation at
            # a time regardless, so a caller retrying after a 503 gets the
            # same outcome as waiting, without tying up a server thread
            # indefinitely in the meantime. Retry-After is a hint, not a
            # guarantee — a real generation can run well past it.
            self.send_response(503)
            self.send_header("Retry-After", "5")
            body = json.dumps(
                {"error": "model is busy generating another response, retry shortly"}
            ).encode("utf-8")
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        except ContextTooLong as error:
            self._json(
                400,
                {
                    "error": str(error),
                    "prompt_tokens": error.prompt_tokens,
                    "max_context_tokens": error.max_tokens,
                },
            )
            return
        except Exception as error:  # noqa: BLE001 - report to the caller, don't crash the server
            # Full traceback goes to the server's own log, not the HTTP
            # response — an internal generation failure (bad tensor shape,
            # CUDA OOM, tokenizer template error) shouldn't leak stack
            # frames to whatever is talking to this loopback-only server,
            # but should be diagnosable from the terminal running it.
            print(f"[airllm-bridge] generation error:\n{traceback.format_exc()}")
            self._json(500, {"error": f"generation failed: {error}"})
            return

        completion_id = f"chatcmpl-{uuid.uuid4().hex[:24]}"
        created = int(time.time())

        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()

        self.wfile.write(
            sse_event(
                {
                    "id": completion_id,
                    "object": "chat.completion.chunk",
                    "created": created,
                    "model": MODEL_ID,
                    "choices": [
                        {"index": 0, "delta": {"content": text}, "finish_reason": None}
                    ],
                }
            )
        )
        self.wfile.write(
            sse_event(
                {
                    "id": completion_id,
                    "object": "chat.completion.chunk",
                    "created": created,
                    "model": MODEL_ID,
                    "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
                    "usage": {
                        "prompt_tokens": prompt_tokens,
                        "completion_tokens": completion_tokens,
                        "total_tokens": prompt_tokens + completion_tokens,
                    },
                }
            )
        )
        self.wfile.write(b"data: [DONE]\n\n")


def main() -> None:
    global MAX_CONTEXT_TOKENS
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", required=True, help="Hugging Face model id, e.g. Qwen/Qwen3-32B")
    parser.add_argument("--port", type=int, default=8100)
    parser.add_argument(
        "--max-context-tokens",
        type=int,
        default=DEFAULT_MAX_CONTEXT_TOKENS,
        help=(
            "Reject prompts longer than this (in tokens) before generating, "
            f"rather than letting the model discover it mid-generation. "
            f"Default {DEFAULT_MAX_CONTEXT_TOKENS} is a conservative guess, "
            "not derived from the model — raise it for a model actually "
            "rated for a longer context."
        ),
    )
    args = parser.parse_args()
    MAX_CONTEXT_TOKENS = args.max_context_tokens

    load_model(args.model)

    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"[airllm-bridge] listening on http://127.0.0.1:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[airllm-bridge] shutting down")


if __name__ == "__main__":
    main()
