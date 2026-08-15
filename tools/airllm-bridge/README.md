# AirLLM bridge

[AirLLM](https://github.com/lyogavin/airllm) runs very large models
(70B+) on consumer GPUs with as little as 4GB VRAM by streaming one
layer into memory at a time, no quantization required. It ships as a
pure Python library with no HTTP server of its own — this bridge exposes
it as an OpenAI-compatible `/v1/chat/completions` endpoint so Yana's
terminal chat (`yana-rt chat --provider airllm`) can talk to it the same
way it already talks to Ollama, LM Studio, and llama.cpp.

## Setup

```bash
pip install airllm
python3 tools/airllm-bridge/server.py --model Qwen/Qwen3-32B
```

`--model` accepts any Hugging Face model id AirLLM supports (Llama,
Qwen, DeepSeek, Mistral, and other major families — see AirLLM's own
README for the full compatibility list). The first run downloads the
model from the Hugging Face Hub, which for a 30B+ model can take a
while and needs disk space; subsequent runs load from the local cache.

Default port is `8100`. Override with `--port`:

```bash
python3 tools/airllm-bridge/server.py --model Qwen/Qwen3-32B --port 8123
```

If you use a non-default port, tell Yana with `/model airllm <model-id>`
after adjusting `openai_compat::airllm()`'s URL, or point `yana-rt chat`
at it via the usual provider-config path.

## Known limitations

- **No real token streaming.** AirLLM's `generate()` call is blocking and
  has no per-token callback, so the bridge waits for the complete
  response and sends it as a single chunk. In Yana's chat UI, the answer
  appears all at once rather than streaming in — this is a property of
  AirLLM itself, not a bug in the bridge.
- **One model per process.** AirLLM has no fast model-swap. To use a
  different model, stop the bridge and restart it with a different
  `--model`.
- **No tool-calling.** The bridge never emits `tool_calls` — plain-text
  conversation only.
- Requires a working `torch`/CUDA (or Apple Silicon MPS, per AirLLM's own
  docs) setup. This bridge does not install or configure that for you.

## Security

Binds `127.0.0.1` only. Do not expose this port to the network — it has
no authentication of its own, matching Yana's other local providers
(Ollama, LM Studio, llama.cpp), which are the same trust model.
