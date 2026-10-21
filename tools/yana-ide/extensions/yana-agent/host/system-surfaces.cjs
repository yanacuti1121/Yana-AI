const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");
const execFile = promisify(require("node:child_process").execFile);

const CAPABILITIES = Object.freeze([
  [
    "repo.tree",
    "Bounded repository tree; ignores generated directories and denies path escape.",
    "ReadOnly",
    "Low",
    "None",
  ],
  [
    "repo.read",
    "Read one bounded UTF-8 repository file; denies path and symlink escape.",
    "ReadOnly",
    "Low",
    "None",
  ],
  [
    "repo.search",
    "Literal case-insensitive search across bounded UTF-8 repository files.",
    "ReadOnly",
    "Low",
    "None",
  ],
  [
    "git.status",
    "Read Git branch and working-tree status with fixed argv.",
    "ReadOnly",
    "Low",
    "None",
  ],
  [
    "git.diff",
    "Read bounded staged or unstaged Git diff with fixed argv.",
    "ReadOnly",
    "Low",
    "None",
  ],
  [
    "host.summary",
    "Read local OS, CPU, memory, load and disk summary.",
    "ReadOnly",
    "Low",
    "None",
  ],
  [
    "process.list",
    "List bounded local processes sorted by cpu or memory; read-only.",
    "ReadOnly",
    "Medium",
    "None",
  ],
  [
    "process.inspect",
    "Inspect one process by PID; read-only.",
    "ReadOnly",
    "Medium",
    "None",
  ],
  [
    "command.validate",
    "Parse a shell command into argv and judge it through Yana guard; dry-run only.",
    "ReadOnly",
    "Low",
    "None",
  ],
  [
    "command.execute",
    "Execute a validated, guard-approved command. Human approval is required per call.",
    "Mutating",
    "High",
    "HumanApprovalPerCall",
  ],
  [
    "file.write",
    "Create or overwrite one bounded UTF-8 repository file; diff shown, backed up, verified after write. Human approval required per call.",
    "Mutating",
    "High",
    "HumanApprovalPerCall",
  ],
  [
    "config.write",
    "Create or overwrite one core/config/*.json file; confined to that directory, JSON-validated, core-lock.json excluded. Human approval required per call.",
    "Mutating",
    "High",
    "HumanApprovalPerCall",
  ],
]);

const EXTERNAL_TOOLS = Object.freeze([
  ["claude", "Claude Code"],
  ["codex", "Codex"],
  ["cursor", "Cursor"],
  ["antigravity", "Antigravity"],
  ["gemini", "Gemini CLI"],
]);

function executable(command, env = process.env, platform = process.platform) {
  const extensions =
    platform === "win32"
      ? (env.PATHEXT || ".EXE;.CMD;.BAT;.COM").split(";")
      : [""];
  const home = env.HOME || env.USERPROFILE || os.homedir();
  const directories = new Set(
    String(env.PATH || "")
      .split(path.delimiter)
      .filter(Boolean),
  );
  for (const directory of platform === "win32"
    ? [
        env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, "Programs"),
        env.APPDATA && path.join(env.APPDATA, "npm"),
      ]
    : [
        path.join(home, ".local", "bin"),
        path.join(home, ".cargo", "bin"),
        path.join(home, ".bun", "bin"),
        path.join(home, ".npm-global", "bin"),
        "/opt/homebrew/bin",
        "/usr/local/bin",
      ]) {
    if (directory) directories.add(directory);
  }
  for (const directory of directories) {
    if (!directory) continue;
    for (const extension of extensions) {
      const candidate = path.join(directory, `${command}${extension}`);
      try {
        if (fs.statSync(candidate).isFile()) {
          if (platform === "win32" || fs.statSync(candidate).mode & 0o111)
            return candidate;
        }
      } catch {}
    }
  }
  return "";
}

// Async on purpose — every other subprocess call in this codebase (git in
// projects.cjs, `yana-rt task` in tasks.cjs, model discovery) is async;
// this was the one exception, and being synchronous meant a slow or
// unresponsive runtime binary blocked the *entire* Electron main process
// (all IPC, including live terminal PTY data) for up to the 3s timeout,
// every time Settings/Permissions opened or the project changed.
async function runtimeFeatures(runtime) {
  if (!runtime)
    return {
      available: false,
      mcp: false,
      discord: false,
      error: "Runtime not configured",
    };
  try {
    const { stdout } = await execFile(runtime, ["--help"], {
      encoding: "utf8",
      timeout: 3000,
      maxBuffer: 128 * 1024,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return {
      available: true,
      mcp: /^\s*mcp\b/im.test(stdout),
      discord: /^\s*remote\b/im.test(stdout),
      error: "",
    };
  } catch {
    return {
      available: false,
      mcp: false,
      discord: false,
      error: "Runtime unavailable",
    };
  }
}

function discordStatus(root, env = process.env) {
  const configPath = root
    ? path.join(root, ".yana-ai", "os", "discord-config.json")
    : "";
  let channels = 0;
  let users = 0;
  let warning = "";
  if (configPath) {
    try {
      const stat = fs.lstatSync(configPath);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 128 * 1024)
        throw new Error("unsafe config");
      const value = JSON.parse(fs.readFileSync(configPath, "utf8"));
      channels = Array.isArray(value.allowed_channel_ids)
        ? value.allowed_channel_ids.length
        : 0;
      users = Array.isArray(value.allowed_user_ids)
        ? value.allowed_user_ids.length
        : 0;
    } catch (error) {
      if (error.code !== "ENOENT")
        warning = "Discord allowlist could not be read";
    }
  }
  return {
    configured: Boolean(String(env.DISCORD_BOT_TOKEN || "").trim()),
    channels,
    users,
    configPath,
    warning,
  };
}

function splitRow(line) {
  const cells = [];
  let value = "";
  for (let index = 1; index < line.length - 1; index++) {
    const character = line[index];
    if (character === "|" && line[index - 1] !== "\\") {
      cells.push(value.trim());
      value = "";
    } else value += character;
  }
  cells.push(value.trim());
  return cells.map((cell) => cell.replace(/\\\|/g, "|").replace(/`/g, ""));
}

function parseCommands(markdown) {
  const entries = [];
  let category = "Other";
  for (const line of markdown.split(/\r?\n/)) {
    if (line.startsWith("## ")) category = line.slice(3).trim();
    if (
      !line.startsWith("|") ||
      /^\|[- :|]+\|$/.test(line) ||
      /^\| Command \|/.test(line)
    )
      continue;
    const [command, description] = splitRow(line);
    if (command && description)
      entries.push({ category, command, description });
  }
  return entries.slice(0, 300);
}

function commandReference(resourcesPath = "") {
  const candidates = [
    path.join(__dirname, "../../../COMMANDS.md"),
    resourcesPath && path.join(resourcesPath, "COMMANDS.md"),
  ].filter(Boolean);
  for (const file of candidates) {
    try {
      const stat = fs.lstatSync(file);
      if (
        !stat.isFile() ||
        stat.isSymbolicLink() ||
        stat.size > 2 * 1024 * 1024
      )
        continue;
      const commands = parseCommands(fs.readFileSync(file, "utf8"));
      if (commands.length) return { source: file, commands, error: "" };
    } catch {}
  }
  return { source: "", commands: [], error: "COMMANDS.md is not packaged" };
}

async function systemOverview({
  runtime = "",
  projectRoot = "",
  resourcesPath = "",
  env = process.env,
} = {}) {
  const runtimeState = await runtimeFeatures(runtime);
  return {
    capabilities: CAPABILITIES.map(
      ([name, description, accessMode, riskTier, approval]) => ({
        name,
        description,
        accessMode,
        riskTier,
        approval,
        available:
          runtimeState.available &&
          (!name.startsWith("process.") || process.platform !== "win32"),
      }),
    ),
    runtime: runtimeState,
    discord: discordStatus(projectRoot, env),
    externalTools: EXTERNAL_TOOLS.map(([command, label]) => {
      const resolved = executable(command, env);
      return { command, label, available: Boolean(resolved), path: resolved };
    }),
    commands: commandReference(resourcesPath),
    host: `${os.platform()} · ${os.arch()}`,
  };
}

module.exports = {
  CAPABILITIES,
  commandReference,
  discordStatus,
  executable,
  parseCommands,
  runtimeFeatures,
  systemOverview,
};
