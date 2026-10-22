const LOCAL_ADAPTERS = Object.freeze({
  "9router": {
    name: "9Router",
    baseUrl: "http://127.0.0.1:20128/v1",
    modelsPath: "/models",
    parse: (body) => body.data?.map((model) => model.id),
  },
  ollama: {
    name: "Ollama",
    baseUrl: "http://127.0.0.1:11434",
    modelsPath: "/api/tags",
    parse: (body) => body.models?.map((model) => model.name),
  },
  lmstudio: {
    name: "LM Studio",
    baseUrl: "http://127.0.0.1:1234/v1",
    modelsPath: "/models",
    parse: (body) => body.data?.map((model) => model.id),
  },
  llamacpp: {
    name: "llama.cpp",
    baseUrl: "http://127.0.0.1:8080/v1",
    modelsPath: "/models",
    parse: (body) => body.data?.map((model) => model.id),
  },
  turbofieldfare: {
    name: "TurboFieldfare",
    baseUrl: "http://127.0.0.1:8091/v1",
    modelsPath: "/models",
    parse: (body) => body.data?.map((model) => model.id),
  },
  airllm: {
    name: "AirLLM",
    baseUrl: "http://127.0.0.1:8100/v1",
    modelsPath: "/models",
    parse: (body) => body.data?.map((model) => model.id),
  },
  custom: {
    name: "OpenAI-compatible",
    baseUrl: "",
    modelsPath: "/models",
    parse: (body) => body.data?.map((model) => model.id),
  },
});

function endpoint(value) {
  const url = new URL(value);
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !["http:", "https:"].includes(url.protocol) ||
    (url.protocol === "http:" && !loopback)
  )
    throw new Error(
      "Use HTTPS for cloud, or HTTP on loopback for local models; no URL credentials",
    );
  return url.toString().replace(/\/$/, "");
}

function adapterFor(provider, baseUrl = "") {
  const adapter = LOCAL_ADAPTERS[provider];
  if (!adapter) throw new Error("Provider does not expose local discovery");
  return {
    ...adapter,
    provider,
    baseUrl: endpoint(baseUrl || adapter.baseUrl),
  };
}

async function readJson(response) {
  let text = "";
  for await (const chunk of response.body) {
    text += Buffer.from(chunk).toString("utf8");
    if (text.length > 1024 * 1024)
      throw new Error("Model discovery response too large");
  }
  return JSON.parse(text);
}

async function discoverLocalModels(
  provider,
  baseUrl = "",
  key = "",
  fetcher = fetch,
) {
  const adapter = adapterFor(provider, baseUrl);
  const started = Date.now();
  const response = await fetcher(`${adapter.baseUrl}${adapter.modelsPath}`, {
    signal: AbortSignal.timeout(8000),
    redirect: "error",
    headers: key ? { Authorization: `Bearer ${key}` } : {},
  });
  if (!response.ok)
    throw new Error(`Model discovery returned HTTP ${response.status}`);
  const models = adapter.parse(await readJson(response));
  if (!Array.isArray(models))
    throw new Error("Endpoint returned an unsupported model list");
  return {
    provider,
    name: adapter.name,
    endpoint: adapter.baseUrl,
    latencyMs: Date.now() - started,
    models: models
      .filter((model) => typeof model === "string" && model.length < 200)
      .slice(0, 200),
  };
}

async function inspectLocalModels(fetcher = fetch, keyFor = () => "") {
  return Promise.all(
    [
      "9router",
      "ollama",
      "lmstudio",
      "llamacpp",
      "turbofieldfare",
      "airllm",
    ].map(async (provider) => {
      try {
        const result = await discoverLocalModels(
          provider,
          "",
          keyFor(provider),
          fetcher,
        );
        return { ...result, status: "ready", error: "" };
      } catch (error) {
        const adapter = adapterFor(provider);
        return {
          provider,
          name: adapter.name,
          endpoint: adapter.baseUrl,
          latencyMs: 0,
          models: [],
          status: "offline",
          error: String(error?.message || error).slice(0, 200),
        };
      }
    }),
  );
}

module.exports = {
  LOCAL_ADAPTERS,
  endpoint,
  adapterFor,
  discoverLocalModels,
  inspectLocalModels,
};
