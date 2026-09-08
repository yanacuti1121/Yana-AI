const http = require("node:http");
const crypto = require("node:crypto");

function pkce() {
  const verifier = crypto.randomBytes(32).toString("base64url");
  return {
    verifier,
    challenge: crypto.createHash("sha256").update(verifier).digest("base64url"),
  };
}
async function callbackFlow({ timeout = 120000, port = 0 } = {}) {
  const state = crypto.randomBytes(32).toString("base64url");
  const proof = pkce();
  let settled = false;
  let resolve;
  let reject;
  let timer;
  const result = new Promise((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  result.catch(() => {});
  const finish = (error, code) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    server.close();
    if (error) reject(new Error(error));
    else resolve(code);
  };
  const server = http.createServer((request, response) => {
    response.setHeader("Content-Type", "text/plain; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Content-Security-Policy", "default-src 'none'");
    if (
      request.method !== "GET" ||
      (request.url || "").length > 8192 ||
      request.headers.host !== `127.0.0.1:${server.address()?.port}` ||
      !request.url.startsWith("/")
    ) {
      response.writeHead(400);
      response.end("Invalid callback");
      return;
    }
    const url = new URL(request.url, "http://127.0.0.1");
    if (url.pathname !== "/oauth/callback") {
      response.writeHead(404);
      response.end();
      return;
    }
    const received = url.searchParams.get("state") || "";
    if (
      url.searchParams.getAll("state").length !== 1 ||
      !/^[A-Za-z0-9_-]{43}$/.test(received) ||
      !crypto.timingSafeEqual(Buffer.from(received), Buffer.from(state))
    ) {
      response.writeHead(400);
      response.end("State mismatch");
      return;
    }
    if (settled) {
      response.writeHead(409);
      response.end("Already handled");
      return;
    }
    const code = url.searchParams.get("code");
    const error = url.searchParams.has("error")
      ? "authorization_denied"
      : !code || url.searchParams.getAll("code").length !== 1
        ? "invalid_callback"
        : null;
    response.writeHead(error ? 400 : 200);
    response.end(
      error
        ? "Authorization not completed. Return to Yana Studio."
        : "Authorization received. Return to Yana Studio.",
    );
    finish(error, code);
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  server.on("error", () => finish("callback_unavailable"));
  await new Promise((accept, fail) => {
    server.once("error", () => fail(new Error("callback_unavailable")));
    server.listen(port, "127.0.0.1", accept);
  });
  timer = setTimeout(() => finish("callback_timeout"), timeout);
  return {
    state,
    ...proof,
    result,
    redirectUri: `http://127.0.0.1:${server.address().port}/oauth/callback`,
    cancel: () => finish("user_cancelled"),
  };
}
module.exports = { callbackFlow, pkce };
