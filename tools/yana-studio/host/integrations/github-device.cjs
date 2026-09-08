const { setTimeout: delay } = require("node:timers/promises");
const { GitHubOAuthProvider, requestJson } = require("./providers.cjs");

class GitHubDeviceProvider extends GitHubOAuthProvider {
  constructor(
    clientId,
    { request = requestJson, now = Date.now, sleep = delay } = {},
  ) {
    if (
      typeof clientId !== "string" ||
      !/^[A-Za-z0-9_.-]{5,128}$/.test(clientId)
    )
      throw new Error("invalid_client_id");
    super({ clientId }, request);
    this.now = now;
    this.sleep = sleep;
  }
  async authorizeDevice({ scopes, browser, announce, signal }) {
    const headers = { Accept: "application/json" };
    const request = (url, body, errors = []) =>
      this.request(
        url,
        {
          method: "POST",
          headers,
          body: new URLSearchParams(body),
          signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
        },
        errors,
      );
    const device = await request("https://github.com/login/device/code", {
      client_id: this.config.clientId,
      scope: scopes.join(" "),
    });
    if (
      device.verification_uri !== "https://github.com/login/device" ||
      typeof device.device_code !== "string" ||
      device.device_code.length > 512 ||
      !device.device_code ||
      !/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(device.user_code || "") ||
      !Number.isInteger(device.expires_in) ||
      device.expires_in <= 0 ||
      device.expires_in > 1800 ||
      (device.interval !== undefined &&
        (!Number.isInteger(device.interval) ||
          device.interval < 1 ||
          device.interval > 60))
    )
      throw new Error("invalid_device_response");
    if (signal.aborted) throw new Error("user_cancelled");
    const deadline = this.now() + device.expires_in * 1000;
    let interval = (device.interval || 5) * 1000;
    announce(device.user_code);
    await browser(device.verification_uri);
    while (this.now() < deadline) {
      await this.sleep(Math.min(interval, deadline - this.now()), undefined, {
        signal,
      });
      if (signal.aborted) throw new Error("user_cancelled");
      if (this.now() >= deadline) break;
      const token = await request(
        "https://github.com/login/oauth/access_token",
        {
          client_id: this.config.clientId,
          device_code: device.device_code,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        },
        [
          "authorization_pending",
          "slow_down",
          "access_denied",
          "expired_token",
        ],
      );
      if (signal.aborted) throw new Error("user_cancelled");
      if (token.error === "authorization_pending") continue;
      if (token.error === "slow_down") {
        interval += 5000;
        continue;
      }
      if (token.error === "access_denied")
        throw new Error("authorization_denied");
      if (token.error === "expired_token") throw new Error("callback_timeout");
      return token;
    }
    throw new Error("callback_timeout");
  }
}
module.exports = { GitHubDeviceProvider };
