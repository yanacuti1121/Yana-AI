const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const argument = process.argv[2];
if (!argument)
  throw new Error("Usage: npm run stage:runtime -- /absolute/path/to/yana-rt");
const source = fs.realpathSync(argument);
if (!fs.statSync(source).isFile() || /\.(js|sh|cmd|bat)$/i.test(source))
  throw new Error("A native yana-rt binary is required");
const probe = spawnSync(
  source,
  ["chat", "--headless", "--provider", "ollama"],
  {
    input: "{}",
    encoding: "utf8",
    timeout: 5000,
    windowsHide: true,
    maxBuffer: 100000,
  },
);
let event;
try {
  event = JSON.parse(probe.stdout.trim());
} catch {}
if (event?.type !== "error" || !/headless.*JSON/i.test(event.message))
  throw new Error(
    "Runtime does not expose the expected headless JSON protocol",
  );
const directory = path.join(__dirname, "../runtime");
fs.mkdirSync(directory, { recursive: true });
const destination = path.join(
  directory,
  process.platform === "win32" ? "yana-rt.exe" : "yana-rt",
);
if (source !== destination) fs.copyFileSync(source, destination);
fs.chmodSync(destination, 0o755);
const sha256 = crypto
  .createHash("sha256")
  .update(fs.readFileSync(destination))
  .digest("hex");
fs.writeFileSync(
  path.join(directory, "manifest.json"),
  JSON.stringify(
    {
      sha256,
      platform: process.platform,
      arch: process.arch,
      stagedAt: new Date().toISOString(),
      protocolProbe: "headless-invalid-input-error",
    },
    null,
    2,
  ),
);
console.log(
  `Staged native runtime: ${process.platform}/${process.arch}; sha256 ${sha256}`,
);
