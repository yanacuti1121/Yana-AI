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

# AirLLM/transformers model objects are not documented as safe for
# concurrent .generate() calls from multiple threads — ThreadingHTTPServer
# hands each request its own thread, so without this lock two simultaneous
# requests (two open chat tabs, a client retry racing the first attempt)
# could corrupt shared model/cache state instead of just running slower.
# Serializing here trades concurrency for correctness, matching the
# already-blocking, one-request-at-a-time nature of AirLLM's own API.
GENERATE_LOCK = threading.Lock()


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
    has no streaming generation hook to report progress mid-call. Holds
    GENERATE_LOCK for the whole call — see that lock's own comment for why
    concurrent .generate() calls are not safe to allow."""
    with GENERATE_LOCK:
        prompt = build_prompt(messages)
        input_tokens = MODEL.tokenizer(
            prompt, return_tensors="pt", return_attention_mask=False
        )
        prompt_token_count = input_tokens["input_ids"].shape[-1]
        output = MODEL.generate(
            input_tokens["input_ids"].cuda(),
            max_new_tokens=1024,
            use_cache=True,
            return_dict_in_generate=True,
        )
        full_ids = output.sequences[0]
        completion_ids = full_ids[prompt_token_count:]
        text = MODEL.tokenizer.decode(completion_ids, skip_special_tokens=True)
        return text, prompt_token_count, int(completion_ids.shape[-1])


def sse_event(payload: dict) -> bytes:
    return f"data: {json.dumps(payload)}\n\n".encode("utf-8")


class Handler(BaseHTTPRequestHandler):
    server_version = "airllm-bridge/1"

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
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", required=True, help="Hugging Face model id, e.g. Qwen/Qwen3-32B")
    parser.add_argument("--port", type=int, default=8100)
    args = parser.parse_args()

    load_model(args.model)

    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"[airllm-bridge] listening on http://127.0.0.1:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[airllm-bridge] shutting down")


if __name__ == "__main__":
    main()
