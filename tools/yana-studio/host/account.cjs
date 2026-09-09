const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function atomicJson(file, value) {
  const temp = `${file}.${crypto.randomUUID()}.tmp`;
  let descriptor;
  try {
    descriptor = fs.openSync(temp, "wx", 0o600);
    fs.writeFileSync(descriptor, JSON.stringify(value), "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temp, file);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}

class AccountStore {
  constructor(directory) {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.file = path.join(directory, "account-v1.json");
    this.value = null;
    this.locked = false;
    if (fs.existsSync(this.file)) {
      const stat = fs.lstatSync(this.file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 64 * 1024)
        throw new Error("Unsafe local account file");
      const value = JSON.parse(fs.readFileSync(this.file, "utf8"));
      if (!["local", "google"].includes(value?.mode))
        throw new Error("Invalid local account");
      this.value = value;
      this.locked = value.mode === "local";
    }
  }
  status() {
    return {
      configured: Boolean(this.value),
      locked: this.locked,
      mode: this.value?.mode || "none",
      email: this.value?.email || "",
      displayName: this.value?.displayName || "",
    };
  }
  createLocal({ email, displayName, password }) {
    if (this.value) throw new Error("Account already configured");
    if (
      typeof email !== "string" ||
      !emailPattern.test(email) ||
      email.length > 320
    )
      throw new Error("Enter a valid email address");
    if (
      typeof displayName !== "string" ||
      !displayName.trim() ||
      displayName.length > 120
    )
      throw new Error("Enter a display name");
    if (
      typeof password !== "string" ||
      password.length < 10 ||
      password.length > 1024
    )
      throw new Error("Password must contain at least 10 characters");
    const salt = crypto.randomBytes(16);
    const verifier = crypto.scryptSync(password, salt, 64);
    this.value = {
      schema: 1,
      mode: "local",
      email: email.trim().toLowerCase(),
      displayName: displayName.trim(),
      salt: salt.toString("base64"),
      verifier: verifier.toString("base64"),
      createdAt: Date.now(),
    };
    atomicJson(this.file, this.value);
    this.locked = false;
    return this.status();
  }
  useGoogle(connection) {
    if (this.value) throw new Error("Account already configured");
    if (!connection?.account_id || connection.status !== "connected")
      throw new Error("Connect Google Account first");
    this.value = {
      schema: 1,
      mode: "google",
      accountId: connection.account_id,
      email: connection.email || "",
      displayName: connection.display_name || "Google user",
      createdAt: Date.now(),
    };
    atomicJson(this.file, this.value);
    this.locked = false;
    return this.status();
  }
  unlock(password) {
    if (!this.value || this.value.mode !== "local")
      throw new Error("Local password account not configured");
    if (typeof password !== "string" || password.length > 1024)
      throw new Error("Invalid password");
    const actual = crypto.scryptSync(
      password,
      Buffer.from(this.value.salt, "base64"),
      64,
    );
    const expected = Buffer.from(this.value.verifier, "base64");
    if (
      actual.length !== expected.length ||
      !crypto.timingSafeEqual(actual, expected)
    )
      throw new Error("Incorrect password");
    this.locked = false;
    return this.status();
  }
  lock() {
    if (this.value?.mode === "local") this.locked = true;
    return this.status();
  }
  logout() {
    if (!this.value) throw new Error("No account configured");
    this.value = null;
    this.locked = false;
    if (fs.existsSync(this.file)) fs.unlinkSync(this.file);
    return this.status();
  }
}

module.exports = { AccountStore };
