const MAX_USAGE_RECORDS = 2000;

function tokenCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function normalizeRecord(record, fallback = {}) {
  const input = tokenCount(record?.input);
  const output = tokenCount(record?.output);
  if (input + output === 0) return null;
  return {
    input,
    output,
    provider:
      typeof record?.provider === "string" && record.provider
        ? record.provider
        : fallback.provider || "unknown",
    model:
      typeof record?.model === "string" && record.model
        ? record.model
        : fallback.model || "unknown",
    recordedAt: typeof record?.recordedAt === "string" ? record.recordedAt : "",
  };
}

function recordsForChat(chat) {
  const fallback = {
    provider: chat?.profile?.provider,
    model: chat?.profile?.model,
  };
  if (Array.isArray(chat?.usageHistory) && chat.usageHistory.length) {
    return chat.usageHistory
      .map((record) => normalizeRecord(record, fallback))
      .filter(Boolean);
  }
  const legacy = normalizeRecord(chat?.usage, fallback);
  return legacy ? [legacy] : [];
}

function appendUsageRecords(existing, additions) {
  return [...existing, ...additions]
    .map((record) => normalizeRecord(record))
    .filter(Boolean)
    .slice(-MAX_USAGE_RECORDS);
}

function totals(records) {
  return records.reduce(
    (summary, record) => {
      summary.input += record.input;
      summary.output += record.output;
      summary.total += record.input + record.output;
      summary.rounds += 1;
      return summary;
    },
    { input: 0, output: 0, total: 0, rounds: 0 },
  );
}

function summarizeTokenUsage(chats, projectRoot = "") {
  const all = [];
  const workspace = [];
  const groups = new Map();
  let lastRecordedAt = "";
  for (const chat of Array.isArray(chats) ? chats : []) {
    const records = recordsForChat(chat);
    all.push(...records);
    if (projectRoot && chat.root === projectRoot) workspace.push(...records);
    for (const record of records) {
      const key = `${record.provider}\u0000${record.model}`;
      const group = groups.get(key) || {
        provider: record.provider,
        model: record.model,
        input: 0,
        output: 0,
        total: 0,
        rounds: 0,
      };
      group.input += record.input;
      group.output += record.output;
      group.total += record.input + record.output;
      group.rounds += 1;
      groups.set(key, group);
      if (record.recordedAt > lastRecordedAt)
        lastRecordedAt = record.recordedAt;
    }
  }
  return {
    all: totals(all),
    workspace: totals(workspace),
    models: [...groups.values()].sort(
      (left, right) => right.total - left.total,
    ),
    lastRecordedAt,
  };
}

module.exports = {
  MAX_USAGE_RECORDS,
  appendUsageRecords,
  recordsForChat,
  summarizeTokenUsage,
};
