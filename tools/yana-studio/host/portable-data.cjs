const crypto = require("node:crypto");
const fs = require("node:fs");

const MAX_BACKUP = 12 * 1024 * 1024;

function createBackup(state) {
  return {
    format: "yana-studio-portable",
    version: 1,
    exportedAt: new Date().toISOString(),
    excludes: [
      "oauth tokens",
      "model API keys",
      "password verifier",
      "runtime path",
      "terminal processes",
    ],
    data: {
      schema: 1,
      projects: state.projects,
      chats: state.chats.map((chat) => ({
        ...chat,
        running: false,
        approval: null,
      })),
      profile: state.profile,
      preferences: state.preferences,
      layout: state.layout,
      designs: state.designs || {},
    },
  };
}

function readBackup(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BACKUP)
    throw new Error("Invalid backup file");
  const backup = JSON.parse(fs.readFileSync(file, "utf8"));
  if (
    backup?.format !== "yana-studio-portable" ||
    backup.version !== 1 ||
    backup.data?.schema !== 1
  )
    throw new Error("Unsupported Yana Studio backup");
  return { ...backup.data, designs: backup.data.designs || {} };
}

function writeBackup(file, state) {
  const payload = JSON.stringify(createBackup(state), null, 2);
  if (Buffer.byteLength(payload) > MAX_BACKUP)
    throw new Error("Backup is too large");
  const temp = `${file}.${crypto.randomUUID()}.tmp`;
  let descriptor;
  try {
    descriptor = fs.openSync(temp, "wx", 0o600);
    fs.writeFileSync(descriptor, payload, "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temp, file);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
  return file;
}

module.exports = { createBackup, readBackup, writeBackup };
