const { spawn } = require("node:child_process");
const {
  endpoint,
  adapterFor,
  discoverLocalModels,
} = require("./local-models.cjs");
const { providerById } = require("./model-catalog.cjs");

function profileInput(input) {
  if (!input || typeof input.provider !== "string")
    throw new Error("Unsupported provider");
  const provider = providerById(input.provider);
  if (
    typeof input.model !== "string" ||
    input.model.length > 200 ||
    /[\r\n\0]/.test(input.model)
  )
    throw new Error("Invalid model ID");
  if (
    provider.canonical !== false &&
    provider.baseUrl &&
    input.baseUrl &&
    endpoint(input.baseUrl) !== provider.baseUrl
  )
    throw new Error(
      `The canonical ${provider.label} provider uses ${provider.baseUrl}. Choose OpenAI-compatible for a different endpoint.`,
    );
  return {
    provider: input.provider,
    model: input.model.trim(),
    baseUrl: provider.discoverable
      ? adapterFor(input.provider, input.baseUrl).baseUrl
      : "",
  };
}
async function discover(profile, key = "") {
  const parsed = profileInput(profile);
  const provider = providerById(parsed.provider);
  if (!provider.discoverable)
    throw new Error(
      "Enter the model ID for this provider; automatic discovery is available for local runtimes",
    );
  return (await discoverLocalModels(parsed.provider, parsed.baseUrl, key))
    .models;
}

function startRuntime(
  binary,
  root,
  profile,
  input,
  onEvent,
  onFinish,
  resume = false,
  spawnProcess = spawn,
) {
  if (!binary)
    throw new Error(
      "Choose a compatible yana-rt binary in Models & Runtime first",
    );
  const args = [
    "chat",
    resume ? "--resume-approval" : "--headless",
    "--provider",
    profile.provider,
  ];
  if (!resume && profile.model) args.push("--model", profile.model);
  const child = spawnProcess(binary, args, {
    cwd: root,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
    detached: process.platform !== "win32",
    env: process.env,
  });
  let buffer = "";
  let stderr = "";
  let stopped = false;
  let failure = "";
  let terminalEvent = false;
  let timer;
  const watchdog = setTimeout(
    () => {
      failure = "Runtime exceeded the 10-minute turn limit";
      kill();
    },
    10 * 60 * 1000,
  );
  watchdog.unref();
  const redact = (text) =>
    input.api_key ? text.split(input.api_key).join("[redacted]") : text;
  const publish = (event) => {
    if (
      ["completed", "awaiting_approval", "cancelled", "error"].includes(
        event.type,
      )
    )
      terminalEvent = true;
    onEvent(JSON.parse(redact(JSON.stringify(event))));
  };
  const accept = (line) => {
    if (!line.trim()) return;
    if (line.length > 1024 * 1024)
      throw new Error("Runtime protocol line exceeds 1 MiB");
    const event = JSON.parse(line);
    if (typeof event?.type !== "string")
      throw new Error("Runtime emitted invalid event");
    publish(event);
  };
  const kill = () => {
    if (process.platform === "win32") {
      if (child.pid)
        spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
          windowsHide: true,
          stdio: "ignore",
        }).on("error", () => child.kill());
      else child.kill();
      return;
    }
    const signal = (name) => {
      try {
        if (child.pid) process.kill(-child.pid, name);
        else child.kill(name);
      } catch {
        child.kill(name);
      }
    };
    signal("SIGTERM");
    clearTimeout(timer);
    timer = setTimeout(() => signal("SIGKILL"), 1500);
    timer.unref();
  };
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    if (failure || stopped) return;
    try {
      buffer += chunk;
      let boundary;
      while ((boundary = buffer.indexOf("\n")) !== -1) {
        accept(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 1);
      }
      if (buffer.length > 1024 * 1024)
        throw new Error("Runtime protocol exceeded buffer limit");
    } catch (error) {
      failure = error.message;
      kill();
    }
  });
  child.stderr.on("data", (chunk) => {
    stderr = (stderr + chunk).slice(-4000);
  });
  child.stdin.on("error", (error) => {
    if (!stopped) failure ||= error.message;
  });
  child.on("error", (error) => {
    failure = error.message;
  });
  child.on("close", (code) => {
    clearTimeout(timer);
    clearTimeout(watchdog);
    if (!stopped && !failure) {
      try {
        accept(buffer);
      } catch (error) {
        failure = error.message;
      }
    }
    if (stopped) publish({ type: "cancelled", partial: "" });
    else if (failure || !terminalEvent || code !== 0)
      publish({
        type: "error",
        message: redact(
          failure || stderr || `Runtime exited without completion (${code})`,
        ).slice(0, 1500),
      });
    onFinish();
  });
  child.stdin.end(JSON.stringify(input));
  return {
    stop() {
      if (!stopped) {
        stopped = true;
        kill();
      }
    },
  };
}
module.exports = { endpoint, profileInput, discover, startRuntime };
