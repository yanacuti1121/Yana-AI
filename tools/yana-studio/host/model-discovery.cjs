const { discoverLocalModels } = require("./local-models.cjs");

const openAiList = (body) => body.data?.map((model) => model.id);
const NON_CHAT_MODEL =
  /(?:^|[-_/])(embedding|embed|rerank|moderation|whisper|transcri|tts|speech|audio|image|dall-e)(?:[-_/]|$)/i;

const CLOUD_ADAPTERS = Object.freeze({
  anthropic: {
    url: "https://api.anthropic.com/v1/models?limit=1000",
    headers: (key) => ({
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    }),
    parse: openAiList,
  },
  openai: { url: "https://api.openai.com/v1/models", parse: openAiList },
  gemini: {
    url: "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000",
    headers: (key) => ({ "x-goog-api-key": key }),
    parse: (body) =>
      body.models
        ?.filter((model) =>
          model.supportedGenerationMethods?.includes("generateContent"),
        )
        .map((model) => model.name?.replace(/^models\//, "")),
  },
  groq: {
    url: "https://api.groq.com/openai/v1/models",
    parse: openAiList,
  },
  deepseek: { url: "https://api.deepseek.com/models", parse: openAiList },
  openrouter: {
    url: "https://openrouter.ai/api/v1/models",
    parse: openAiList,
  },
  xai: {
    url: "https://api.x.ai/v1/language-models",
    parse: (body) => body.models?.map((model) => model.id),
  },
  novita: {
    url: "https://api.novita.ai/openai/v1/models",
    parse: openAiList,
  },
  nvidia: {
    url: "https://integrate.api.nvidia.com/v1/models",
    parse: openAiList,
  },
  minimax: { url: "https://api.minimaxi.com/v1/models", parse: openAiList },
  glm: {
    url: "https://open.bigmodel.cn/api/paas/v4/models",
    parse: openAiList,
  },
  huggingface: {
    url: "https://router.huggingface.co/v1/models",
    parse: openAiList,
  },
  kimi: { url: "https://api.moonshot.ai/v1/models", parse: openAiList },
});

async function readJson(response) {
  let text = "";
  for await (const chunk of response.body) {
    text += Buffer.from(chunk).toString("utf8");
    if (text.length > 8 * 1024 * 1024)
      throw new Error("Model discovery response too large");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Provider returned an invalid model list");
  }
}

function cleanModels(models) {
  if (!Array.isArray(models))
    throw new Error("Provider returned an unsupported model list");
  return Array.from(
    new Set(
      models
        .filter((model) => typeof model === "string")
        .map((model) => model.trim())
        .filter(
          (model) =>
            model &&
            model.length < 200 &&
            !/[\r\n\0]/.test(model) &&
            !NON_CHAT_MODEL.test(model),
        ),
    ),
  ).sort((left, right) => left.localeCompare(right));
}

async function discoverCloudModels(provider, key, fetcher = fetch) {
  const adapter = CLOUD_ADAPTERS[provider];
  if (!adapter) throw new Error("Provider does not support model discovery");
  if (!key)
    throw new Error("Add this provider's API key before syncing models");
  let response;
  try {
    response = await fetcher(adapter.url, {
      signal: AbortSignal.timeout(10000),
      redirect: "error",
      headers: {
        Accept: "application/json",
        ...(adapter.headers
          ? adapter.headers(key)
          : { Authorization: `Bearer ${key}` }),
      },
    });
  } catch {
    throw new Error("Could not reach the provider's model endpoint");
  }
  if (!response.ok)
    throw new Error(`Model discovery returned HTTP ${response.status}`);
  const models = cleanModels(adapter.parse(await readJson(response)));
  if (!models.length) throw new Error("Provider returned no chat models");
  return models;
}

async function discoverModels(provider, baseUrl, key, fetcher = fetch) {
  if (CLOUD_ADAPTERS[provider])
    return discoverCloudModels(provider, key, fetcher);
  return (await discoverLocalModels(provider, baseUrl, key, fetcher)).models;
}

module.exports = {
  CLOUD_ADAPTERS,
  cleanModels,
  discoverCloudModels,
  discoverModels,
};
