const test = require("node:test");
const assert = require("node:assert/strict");
const { Readable } = require("node:stream");
const {
  cleanModels,
  discoverCloudModels,
} = require("../host/model-discovery.cjs");

function response(status, body = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    body: Readable.from([JSON.stringify(body)]),
  };
}

test("cloud discovery returns only usable chat model IDs", async () => {
  const models = await discoverCloudModels("openai", "secret", async () =>
    response(200, {
      data: [
        { id: "gpt-5.6-sol" },
        { id: "text-embedding-3-small" },
        { id: "gpt-5.6-sol" },
        { id: "gpt-5.6-luna" },
      ],
    }),
  );
  assert.deepEqual(models, ["gpt-5.6-luna", "gpt-5.6-sol"]);
});

test("cloud discovery explains credential and rate-limit failures", async () => {
  await assert.rejects(
    discoverCloudModels("groq", "bad", async () => response(401)),
    /API key is invalid or expired/,
  );
  await assert.rejects(
    discoverCloudModels("groq", "limited", async () => response(429)),
    /rate limit reached/,
  );
});

test("model cleanup rejects malformed provider output", () => {
  assert.throws(() => cleanModels({ data: [] }), /unsupported model list/);
});
