#!/usr/bin/env python3
"""Real-socket + real-lock regression tests for server.py's Section 11
(admission control) fixes: bounded concurrency (ModelOverloaded -> 503,
not an unbounded wait queue), a context-length ceiling checked before
generation (ContextTooLong -> 400), and a bounded socket read timeout
(slowloris protection).

No airllm/torch dependency: MODEL is a fake object providing just the
.tokenizer()/.generate()/.tokenizer.decode() surface generate() actually
calls, and HTTP-level tests monkeypatch the module-level generate()
function directly -- do_POST looks it up by name at call time, so this
correctly redirects it without needing the real model pipeline.

Run: python3 tools/airllm-bridge/test_server.py
"""

import http.client
import json
import socket
import sys
import threading
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import server as bridge  # noqa: E402


class FakeTensor:
    def __init__(self, n_tokens: int):
        self._n = n_tokens

    @property
    def shape(self):
        return (1, self._n)

    def __getitem__(self, key):
        # full_ids[prompt_token_count:] -- return a tensor of a few
        # "completion" tokens, independent of prompt length.
        return FakeTensor(3)

    def cuda(self):
        return self


class FakeOutput:
    def __init__(self, prompt_tokens: int):
        self.sequences = [FakeTensor(prompt_tokens + 3)]


class FakeTokenizer:
    def __init__(self, prompt_tokens: int):
        self._prompt_tokens = prompt_tokens

    def apply_chat_template(self, messages, tokenize, add_generation_prompt):
        return "<fake prompt>"

    def __call__(self, prompt, return_tensors, return_attention_mask):
        return {"input_ids": FakeTensor(self._prompt_tokens)}

    def decode(self, ids, skip_special_tokens):
        return "fake completion text"


class FakeModel:
    def __init__(self, prompt_tokens: int = 10):
        self.tokenizer = FakeTokenizer(prompt_tokens)

    def generate(self, input_ids, max_new_tokens, use_cache, return_dict_in_generate):
        return FakeOutput(self.tokenizer._prompt_tokens)


class GenerateUnitTests(unittest.TestCase):
    """Calls the real generate() directly (not through HTTP) with a fake
    MODEL -- exercises the actual lock/ceiling logic, not a re-implementation
    of it."""

    def setUp(self):
        self._orig_model = bridge.MODEL
        self._orig_max_ctx = bridge.MAX_CONTEXT_TOKENS
        self._orig_max_new = bridge.MAX_NEW_TOKENS
        bridge.MAX_CONTEXT_TOKENS = 100
        # Controlled explicitly rather than left at the real production
        # value (1024): this test class's whole point is exercising the
        # prompt_tokens + MAX_NEW_TOKENS <= MAX_CONTEXT_TOKENS invariant
        # with numbers small enough to reason about, not incidentally
        # depending on whatever the production reservation happens to be.
        bridge.MAX_NEW_TOKENS = 20

    def tearDown(self):
        bridge.MODEL = self._orig_model
        bridge.MAX_CONTEXT_TOKENS = self._orig_max_ctx
        bridge.MAX_NEW_TOKENS = self._orig_max_new
        if bridge.GENERATE_LOCK.locked():
            bridge.GENERATE_LOCK.release()

    def test_generate_succeeds_under_the_context_ceiling(self):
        bridge.MODEL = FakeModel(prompt_tokens=50)  # 50 + 20 reserved = 70 <= 100
        text, prompt_tokens, completion_tokens = bridge.generate([{"role": "user", "content": "hi"}])
        self.assertEqual(text, "fake completion text")
        self.assertEqual(prompt_tokens, 50)
        self.assertEqual(completion_tokens, 3)

    def test_generate_rejects_a_prompt_that_alone_fits_but_overflows_with_the_reservation(self):
        """REPRODUCTION + regression (Workstream A correction pass): the
        original check only compared prompt_token_count against
        MAX_CONTEXT_TOKENS, ignoring that MODEL.generate() always reserves
        MAX_NEW_TOKENS more on top. A prompt of 90 tokens is UNDER the
        100-token ceiling by itself, but 90 + 20 reserved = 110 > 100 --
        this must still be rejected, which the pre-fix `prompt_token_count
        > MAX_CONTEXT_TOKENS` check alone would have wrongly allowed
        through (90 is not > 100)."""
        bridge.MODEL = FakeModel(prompt_tokens=90)
        with self.assertRaises(bridge.ContextTooLong) as ctx:
            bridge.generate([{"role": "user", "content": "hi"}])
        self.assertEqual(ctx.exception.prompt_tokens, 90)
        self.assertEqual(ctx.exception.max_tokens, 100)

    def test_generate_raises_context_too_long_before_calling_model_generate(self):
        bridge.MODEL = FakeModel(prompt_tokens=500)  # over the 100-token test ceiling

        called = {"generate": False}
        real_model_generate = bridge.MODEL.generate

        def spy_generate(*args, **kwargs):
            called["generate"] = True
            return real_model_generate(*args, **kwargs)

        bridge.MODEL.generate = spy_generate

        with self.assertRaises(bridge.ContextTooLong) as ctx:
            bridge.generate([{"role": "user", "content": "very long..."}])
        self.assertEqual(ctx.exception.prompt_tokens, 500)
        self.assertEqual(ctx.exception.max_tokens, 100)
        self.assertFalse(
            called["generate"],
            "the expensive GPU-bound MODEL.generate() must never run once "
            "the ceiling check has already failed",
        )
        # And the lock must be released even though we raised mid-call.
        self.assertFalse(bridge.GENERATE_LOCK.locked())

    def test_generate_raises_model_overloaded_without_blocking_when_lock_held(self):
        bridge.MODEL = FakeModel(prompt_tokens=10)
        bridge.GENERATE_LOCK.acquire()
        try:
            start = time.monotonic()
            with self.assertRaises(bridge.ModelOverloaded):
                bridge.generate([{"role": "user", "content": "hi"}])
            elapsed = time.monotonic() - start
            self.assertLess(
                elapsed,
                1.0,
                "generate() must fail immediately when the lock is held, "
                "not block waiting for it -- that's the entire point of "
                "the non-blocking acquire",
            )
        finally:
            bridge.GENERATE_LOCK.release()


class HttpLevelTests(unittest.TestCase):
    """Spins up the real ThreadingHTTPServer + Handler on an ephemeral
    port, monkeypatching only the module-level generate() function --
    do_POST's status-code mapping and Handler.timeout are exercised for
    real, over a real socket."""

    def setUp(self):
        bridge.MODEL_ID = "fake-model"
        self._orig_generate = bridge.generate
        self.server = bridge.ThreadingHTTPServer(("127.0.0.1", 0), bridge.Handler)
        self.port = self.server.server_address[1]
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        bridge.generate = self._orig_generate
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)

    def _post(self, body: dict, timeout: float = 5.0) -> http.client.HTTPResponse:
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=timeout)
        payload = json.dumps(body).encode("utf-8")
        conn.request(
            "POST",
            "/v1/chat/completions",
            body=payload,
            headers={"Content-Type": "application/json", "Content-Length": str(len(payload))},
        )
        return conn.getresponse()

    def test_model_overloaded_returns_503_with_retry_after(self):
        def fake_generate(messages):
            raise bridge.ModelOverloaded()

        bridge.generate = fake_generate
        resp = self._post({"messages": [{"role": "user", "content": "hi"}]})
        self.assertEqual(resp.status, 503)
        self.assertEqual(resp.getheader("Retry-After"), "5")
        body = json.loads(resp.read())
        self.assertIn("busy", body["error"])

    def test_context_too_long_returns_400_with_token_counts(self):
        def fake_generate(messages):
            raise bridge.ContextTooLong(prompt_tokens=9000, max_tokens=4096)

        bridge.generate = fake_generate
        resp = self._post({"messages": [{"role": "user", "content": "hi"}]})
        self.assertEqual(resp.status, 400)
        body = json.loads(resp.read())
        self.assertEqual(body["prompt_tokens"], 9000)
        self.assertEqual(body["max_context_tokens"], 4096)

    def test_a_second_concurrent_request_is_rejected_not_queued(self):
        """Real concurrency, not simulated: one request holds GENERATE_LOCK
        via a real blocking fake generate(); a second request arriving
        while it's held must get 503 immediately, not wait behind it."""
        release_first = threading.Event()
        first_acquired = threading.Event()

        def slow_generate(messages):
            if not bridge.GENERATE_LOCK.acquire(blocking=False):
                raise bridge.ModelOverloaded()
            try:
                first_acquired.set()
                release_first.wait(timeout=5)
                return ("done", 1, 1)
            finally:
                bridge.GENERATE_LOCK.release()

        bridge.generate = slow_generate

        results = {}

        def do_first():
            results["first"] = self._post({"messages": [{"role": "user", "content": "hi"}]}, timeout=10)

        first_thread = threading.Thread(target=do_first)
        first_thread.start()
        self.assertTrue(first_acquired.wait(timeout=5), "first request never reached the lock")

        second_start = time.monotonic()
        second_resp = self._post({"messages": [{"role": "user", "content": "hi"}]})
        second_elapsed = time.monotonic() - second_start

        self.assertEqual(second_resp.status, 503)
        self.assertLess(
            second_elapsed,
            2.0,
            "the second request must be rejected immediately, not queued "
            "behind the first one's still-in-progress generation",
        )

        release_first.set()
        first_thread.join(timeout=5)
        self.assertEqual(results["first"].status, 200)

    def test_stalled_body_send_is_dropped_after_the_read_timeout_not_held_forever(self):
        """Raw socket: sends headers with a real Content-Length, then never
        sends the body. Handler.timeout must bound the stalled read so the
        connection is dropped rather than blocking whatever thread accepted
        it forever. Uses a short timeout override so the test itself stays
        fast."""
        original_timeout = bridge.Handler.timeout
        bridge.Handler.timeout = 1
        try:
            sock = socket.create_connection(("127.0.0.1", self.port), timeout=10)
            request = (
                "POST /v1/chat/completions HTTP/1.1\r\n"
                "Host: 127.0.0.1\r\n"
                "Content-Type: application/json\r\n"
                "Content-Length: 100\r\n"
                "\r\n"
                '{"mess'  # deliberately short of the declared 100 bytes, then stall
            )
            sock.sendall(request.encode("utf-8"))
            start = time.monotonic()
            # A dropped connection reads back as an empty bytes object
            # (EOF) once the server times out and closes -- if the read
            # timeout weren't wired, this would hang until the test's own
            # socket timeout instead, well past the assertion below.
            data = sock.recv(4096)
            elapsed = time.monotonic() - start
            self.assertEqual(data, b"", "server should close, not answer, a stalled request")
            self.assertLess(
                elapsed,
                5.0,
                "the stalled connection must be dropped close to Handler.timeout "
                "(1s here), not left open for the test's full 10s socket timeout",
            )
            sock.close()
        finally:
            bridge.Handler.timeout = original_timeout


if __name__ == "__main__":
    unittest.main()
