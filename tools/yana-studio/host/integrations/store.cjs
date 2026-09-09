const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

class SecureTokenStore {
  constructor(directory, secureStorage, platform = process.platform) {
    this.directory = directory;
    this.secureStorage = secureStorage;
    this.platform = platform;
  }
  available() {
    return (
      this.secureStorage.isEncryptionAvailable() &&
      (this.platform !== "linux" ||
        this.secureStorage.getSelectedStorageBackend() !== "basic_text")
    );
  }
  location(key) {
    if (!/^[a-z][a-z0-9_-]{0,31}:[a-z][a-z0-9_-]{0,31}$/.test(key))
      throw new Error("invalid_connection");
    return path.join(
      this.directory,
      crypto.createHash("sha256").update(key).digest("hex") + ".enc",
    );
  }
  read(key) {
    if (!this.available()) throw new Error("secure_storage_unavailable");
    const file = this.location(key);
    if (!fs.existsSync(file)) return null;
    try {
      if (fs.lstatSync(file).isSymbolicLink() || fs.statSync(file).size > 65536)
        throw new Error();
      const value = JSON.parse(
        this.secureStorage.decryptString(fs.readFileSync(file)),
      );
      if (value.key !== key || !value.tokens || !value.connection)
        throw new Error();
      return value;
    } catch {
      throw new Error("credential_store_unreadable");
    }
  }
  write(key, value) {
    if (!this.available()) throw new Error("secure_storage_unavailable");
    const file = this.location(key);
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    const encrypted = this.secureStorage.encryptString(
      JSON.stringify({ ...value, key }),
    );
    const temporary = file + "." + crypto.randomUUID();
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
  }
  delete(key) {
    const file = this.location(key);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
}
module.exports = { SecureTokenStore };
