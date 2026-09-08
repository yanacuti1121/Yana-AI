const fs = require("node:fs");
const path = require("node:path");

function filesAt(directory, accept = () => true) {
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && accept(entry.name))
    .map((entry) => path.join(directory, entry.name));
}

function measure(files) {
  let bytes = 0;
  let count = 0;
  for (const file of files) {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) continue;
    bytes += stat.size;
    count += 1;
  }
  return { files: count, bytes };
}

class DataOverview {
  constructor(directory) {
    this.directory = path.resolve(directory);
  }

  inspect() {
    const workspace = measure(
      filesAt(
        this.directory,
        (name) =>
          name === "workspace-v1.json" ||
          name.startsWith("workspace-v1.json.recovery-"),
      ),
    );
    const credentials = measure([
      ...filesAt(path.join(this.directory, "oauth-v1")),
      ...filesAt(path.join(this.directory, "model-credentials-v1")),
    ]);
    return {
      total_bytes: workspace.bytes + credentials.bytes,
      workspace,
      credentials,
      memory: { status: "runtime_contract_required", files: 0, bytes: 0 },
      cache: { status: "not_configured", files: 0, bytes: 0 },
    };
  }
}

module.exports = { DataOverview, measure };
