const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { profileInput } = require("./runtime.cjs");
const { CANVAS_PART_KINDS } = require("./canvas-ai.cjs");

function validateState(value) {
  const text = (input) => typeof input === "string";
  const tokenCount = (input) => Number.isSafeInteger(input) && input >= 0;
  const boundedText = (input, limit = 2000) =>
    text(input) && Buffer.byteLength(input, "utf8") <= limit;
  const finite = (input, low, high) =>
    Number.isFinite(input) && input >= low && input <= high;
  const canvasPart = (part) =>
    part &&
    boundedText(part.id, 200) &&
    CANVAS_PART_KINDS.includes(part.kind) &&
    boundedText(part.label) &&
    finite(part.x, 0, 4000) &&
    finite(part.y, 0, 4000) &&
    finite(part.width, 20, 2000) &&
    finite(part.height, 8, 2000) &&
    (part.hidden === undefined || typeof part.hidden === "boolean") &&
    (part.locked === undefined || typeof part.locked === "boolean") &&
    (part.opacity === undefined || finite(part.opacity, 0, 1)) &&
    (part.fill === undefined || /^#[0-9a-f]{6}$/i.test(part.fill)) &&
    (part.radius === undefined || finite(part.radius, 0, 999));
  const canvasScreen = (screen) =>
    screen &&
    boundedText(screen.id, 200) &&
    boundedText(screen.name, 200) &&
    ["phone", "desktop"].includes(screen.device) &&
    /^#[0-9a-f]{6}$/i.test(screen.background) &&
    Array.isArray(screen.parts) &&
    screen.parts.length <= 300 &&
    screen.parts.every(canvasPart);
  const canvasDocument = (document) =>
    document &&
    document.version === 1 &&
    boundedText(document.name, 200) &&
    document.theme &&
    /^#[0-9a-f]{6}$/i.test(document.theme.accent) &&
    /^#[0-9a-f]{6}$/i.test(document.theme.surface) &&
    /^#[0-9a-f]{6}$/i.test(document.theme.foreground) &&
    ["compact", "rounded", "pill"].includes(document.theme.shape) &&
    ["system", "serif", "mono"].includes(document.theme.font) &&
    ["standard", "expressive", "reduced"].includes(document.theme.motion) &&
    Array.isArray(document.screens) &&
    document.screens.length >= 1 &&
    document.screens.length <= 20 &&
    document.screens.every(canvasScreen);
  const usage = (input) =>
    input === undefined ||
    (input && tokenCount(input.input) && tokenCount(input.output));
  const usageHistory = (input) =>
    input === undefined ||
    (Array.isArray(input) &&
      input.length <= 2000 &&
      input.every(
        (record) =>
          record &&
          tokenCount(record.input) &&
          tokenCount(record.output) &&
          text(record.provider) &&
          text(record.model) &&
          text(record.recordedAt),
      ));
  if (
    value?.schema !== 1 ||
    !Array.isArray(value.projects) ||
    value.projects.length > 20 ||
    !Array.isArray(value.chats) ||
    value.chats.length > 100
  )
    throw new Error("Invalid workspace schema");
  if (
    !value.designs ||
    Array.isArray(value.designs) ||
    Object.keys(value.designs).length > 20 ||
    !Object.entries(value.designs).every(
      ([root, document]) => path.isAbsolute(root) && canvasDocument(document),
    )
  )
    throw new Error("Invalid design canvas state");
  if (
    !value.projects.every(
      (project) =>
        project &&
        text(project.name) &&
        text(project.root) &&
        path.isAbsolute(project.root),
    )
  )
    throw new Error("Invalid saved project");
  if (
    !value.chats.every(
      (chat) =>
        chat &&
        text(chat.id) &&
        text(chat.root) &&
        text(chat.title) &&
        Array.isArray(chat.messages) &&
        chat.messages.every(
          (message) =>
            ["user", "assistant"].includes(message?.role) &&
            text(message.content) &&
            (message.userInput === undefined || text(message.userInput)),
        ) &&
        Array.isArray(chat.events) &&
        chat.events.every((event) => event && text(event.type)) &&
        typeof chat.running === "boolean" &&
        usage(chat.usage) &&
        usageHistory(chat.usageHistory),
    )
  )
    throw new Error("Invalid saved conversation");
  profileInput(value.profile);
  if (
    !value.preferences ||
    !["vi", "ko", "en"].includes(value.preferences.locale)
  )
    throw new Error("Invalid interface preferences");
  if (typeof value.onboardingCompleted !== "boolean")
    throw new Error("Invalid onboarding state");
  if (
    !value.layout ||
    !["sidebar", "inspector", "dock"].every(
      (name) =>
        Number.isFinite(value.layout[name]) &&
        value.layout[name] >= 100 &&
        value.layout[name] <= 1000,
    )
  )
    throw new Error("Invalid saved layout");
  if (
    !text(value.runtime) ||
    (value.runtime && !path.isAbsolute(value.runtime))
  )
    throw new Error("Invalid runtime path");
  if (value.encryptedKey !== undefined && !text(value.encryptedKey))
    throw new Error("Invalid encrypted credential");
}

class Store {
  constructor(directory) {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.file = path.join(directory, "workspace-v1.json");
    this.value = {
      schema: 1,
      projects: [],
      chats: [],
      profile: { provider: "ollama", model: "", baseUrl: "" },
      preferences: { locale: "vi" },
      onboardingCompleted: false,
      layout: { sidebar: 250, inspector: 330, dock: 280 },
      designs: {},
      runtime: "",
    };
    this.warning = "";
    if (fs.existsSync(this.file)) {
      try {
        if (fs.statSync(this.file).size > 12 * 1024 * 1024)
          throw new Error("state is too large");
        const parsed = JSON.parse(fs.readFileSync(this.file, "utf8"));
        const next = { ...this.value, ...parsed };
        validateState(next);
        this.value = next;
      } catch (error) {
        const recovery = `${this.file}.recovery-${Date.now()}`;
        fs.copyFileSync(this.file, recovery, fs.constants.COPYFILE_EXCL);
        this.warning = `Saved unreadable state for recovery: ${path.basename(recovery)} (${error.message})`;
      }
    }
  }
  save(patch) {
    const next = { ...this.value, ...patch, schema: 1 };
    validateState(next);
    const payload = JSON.stringify(next);
    if (Buffer.byteLength(payload) > 10 * 1024 * 1024)
      throw new Error("Conversation storage limit reached (10 MiB)");
    const temp = `${this.file}.${crypto.randomUUID()}.tmp`;
    let descriptor;
    try {
      descriptor = fs.openSync(temp, "wx", 0o600);
      fs.writeFileSync(descriptor, payload, "utf8");
      fs.fsyncSync(descriptor);
      fs.closeSync(descriptor);
      descriptor = undefined;
      fs.renameSync(temp, this.file);
      this.value = next;
    } finally {
      if (descriptor !== undefined) fs.closeSync(descriptor);
      if (fs.existsSync(temp)) fs.unlinkSync(temp);
    }
    return this.value;
  }
}
module.exports = { Store };
