const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { providerById } = require("./model-catalog.cjs");

class ModelCredentialStore {
  constructor(directory, secureStorage, platform = process.platform) {
    this.directory = directory;
    this.secureStorage = secureStorage;
    this.platform = platform;
    this.memory = new Map();
  }
  available() {
    return (
      this.secureStorage.isEncryptionAvailable() &&
      (this.platform !== "linux" ||
        this.secureStorage.getSelectedStorageBackend() !== "basic_text")
    );
  }
  location(provider) {
    providerById(provider);
    return path.join(
      this.directory,
      crypto.createHash("sha256").update(`model:${provider}`).digest("hex") +
        ".enc",
    );
  }
  read(provider) {
    providerById(provider);
    if (this.memory.has(provider)) return this.memory.get(provider);
    if (!this.available()) return "";
    const file = this.location(provider);
    if (!fs.existsSync(file)) return "";
    try {
      if (fs.lstatSync(file).isSymbolicLink() || fs.statSync(file).size > 65536)
        throw new Error();
      const saved = JSON.parse(
        this.secureStorage.decryptString(fs.readFileSync(file)),
      );
      if (
        saved.provider !== provider ||
        typeof saved.secret !== "string" ||
        !saved.secret ||
        saved.secret.length > 16000
      )
        throw new Error();
      this.memory.set(provider, saved.secret);
      return saved.secret;
    } catch {
      throw new Error("model_credential_unreadable");
    }
  }
  write(provider, secret) {
    providerById(provider);
    if (
      typeof secret !== "string" ||
      !secret ||
      secret.length > 16000 ||
      /[\r\n\0]/.test(secret)
    )
      throw new Error("invalid_model_credential");
    if (!this.available()) {
      this.memory.set(provider, secret);
      return "session";
    }
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    const file = this.location(provider);
    const temporary = `${file}.${crypto.randomUUID()}`;
    const encrypted = this.secureStorage.encryptString(
      JSON.stringify({ provider, secret }),
    );
    let descriptor;
    try {
      descriptor = fs.openSync(temporary, "wx", 0o600);
      fs.writeFileSync(descriptor, encrypted);
      fs.fsyncSync(descriptor);
      fs.closeSync(descriptor);
      descriptor = undefined;
      fs.renameSync(temporary, file);
    } finally {
      if (descriptor !== undefined) fs.closeSync(descriptor);
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
    this.memory.set(provider, secret);
    return "encrypted";
  }
  delete(provider) {
    this.memory.delete(provider);
    const file = this.location(provider);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
  configured() {
    const { PROVIDERS, CUSTOM_PROVIDER } = require("./model-catalog.cjs");
    return [...PROVIDERS, CUSTOM_PROVIDER]
      .map((provider) => provider.id)
      .filter((provider) => {
        try {
          return Boolean(this.read(provider));
        } catch {
          return false;
        }
      });
  }
}

module.exports = { ModelCredentialStore };
