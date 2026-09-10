const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const MAX_CONTEXT_TOKENS = 2800;
const ACTIVE = "active";
const DECISION_PATTERN =
  /\b(is|are|must|should be|no longer|will use|là|phải|không còn|sẽ dùng|được xác định là)\b/i;
const OPEN_LOOP_PATTERN =
  /\b(continue|finish|implement|design|build|fix|review|keep working|tiếp tục|làm tiếp|hoàn thành|triển khai|thiết kế|xây|sửa|kiểm tra)\b/i;
const CORRECTION_PATTERN =
  /\b(no longer|instead|not using|không còn|thay vì|không dùng|đổi sang)\b/i;
const HEDGE_PATTERN =
  /\b(i think|maybe|perhaps|possibly|tentative|tôi nghĩ|có thể|hình như|tạm thời|chưa chắc)\b/i;
const PREFERENCE_PATTERN =
  /\b(i prefer|i like|i want|always use|prefer|tôi thích|tôi muốn|anh muốn|ưu tiên|luôn dùng)\b/i;

function timestamp() {
  return new Date().toISOString();
}

function identifier(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalized(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value) {
  return [
    ...new Set(
      normalized(value)
        .toLocaleLowerCase("vi")
        .match(/[\p{L}\p{N}][\p{L}\p{N}._-]*/gu) || [],
    ),
  ].filter((token) => token.length > 1);
}

function overlap(left, right) {
  const first = new Set(tokens(left));
  const second = new Set(tokens(right));
  if (!first.size || !second.size) return 0;
  let matches = 0;
  for (const token of first) if (second.has(token)) matches += 1;
  return matches / Math.max(first.size, second.size);
}

function estimatedTokens(value) {
  return Math.max(1, Math.ceil(normalized(value).length / 4));
}

function composeTurnSystem(memory, retrieval, sharingEnabled) {
  const existingMemory = normalized(memory?.text ?? memory);
  const content =
    sharingEnabled && retrieval?.sources?.length
      ? retrieval.context
      : existingMemory;
  if (!content) return "";
  return `YANA CONTINUITY CONTEXT\nUse only when relevant. Never claim a source that is not present.\n\n${content}`.slice(
    0,
    64 * 1024,
  );
}

function conversationSummary(chat) {
  const firstUser = chat.messages.find((message) => message.role === "user");
  const lastAssistant = [...chat.messages]
    .reverse()
    .find((message) => message.role === "assistant" && message.content.trim());
  return [
    firstUser && (firstUser.userInput || firstUser.content),
    lastAssistant?.content,
  ]
    .filter(Boolean)
    .map((value) => normalized(value).slice(0, 320))
    .join(" — ")
    .slice(0, 700);
}

function conversationTopics(chat) {
  const ignored = new Set([
    "the",
    "and",
    "for",
    "with",
    "this",
    "that",
    "của",
    "cho",
    "với",
    "này",
    "là",
    "một",
    "anh",
    "em",
  ]);
  const frequencies = new Map();
  for (const message of chat.messages) {
    for (const token of tokens(message.userInput || message.content)) {
      if (ignored.has(token) || token.length < 3) continue;
      frequencies.set(token, (frequencies.get(token) || 0) + 1);
    }
  }
  return [...frequencies.entries()]
    .sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
    )
    .slice(0, 10)
    .map(([token]) => token);
}

function sentences(value) {
  return String(value || "")
    .split(/(?<=[.!?])\s+|\n+/u)
    .map(normalized)
    .filter((sentence) => sentence.length >= 8 && sentence.length <= 800);
}

function subjectFor(content) {
  const beforeCopula = content.split(DECISION_PATTERN)[0];
  const useful = tokens(beforeCopula).filter(
    (token) => !["i", "we", "tôi", "mình", "anh", "em"].includes(token),
  );
  const fallback = tokens(content).filter(
    (token) =>
      ![
        "i",
        "we",
        "tôi",
        "mình",
        "anh",
        "em",
        "are",
        "is",
        "using",
        "là",
        "không",
        "còn",
        "dùng",
      ].includes(token),
  );
  return (useful.length ? useful : fallback).slice(0, 6).join(" ");
}

function publicSource(candidate) {
  return {
    kind: candidate.kind,
    id: candidate.refId,
    label: candidate.label,
    content: candidate.content,
    source: candidate.source,
    conversationId: candidate.conversationId || "",
    score: Number(candidate.score.toFixed(3)),
    reason: candidate.reason,
  };
}

function sourceLabel(item) {
  return item.source_conversation_id
    ? `Conversation ${item.source_conversation_id}`
    : item.source_ref;
}

class ContinuityEngine {
  constructor(directory, options = {}) {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.file = path.join(directory, "continuity-v1.sqlite");
    this.db = new (options.DatabaseSync || DatabaseSync)(this.file);
    this.db.exec("PRAGMA foreign_keys = ON");
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA busy_timeout = 3000");
    this.migrate();
  }

  migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        project_root TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT NOT NULL DEFAULT '',
        topics_json TEXT NOT NULL DEFAULT '[]',
        provider_history_json TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS conversations_project_updated
        ON conversations(project_root, updated_at DESC);
      CREATE TABLE IF NOT EXISTS conversation_messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        visible_content TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        UNIQUE(conversation_id, position)
      );
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        project_root TEXT NOT NULL,
        scope TEXT NOT NULL,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        importance REAL NOT NULL DEFAULT 0.5,
        confidence REAL NOT NULL DEFAULT 0.5,
        status TEXT NOT NULL DEFAULT 'active',
        pinned INTEGER NOT NULL DEFAULT 0,
        source_kind TEXT NOT NULL,
        source_ref TEXT NOT NULL,
        source_conversation_id TEXT,
        content_hash TEXT NOT NULL,
        supersedes TEXT,
        expires_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS memories_source_hash
        ON memories(project_root, source_kind, source_ref, content_hash);
      CREATE INDEX IF NOT EXISTS memories_project_status
        ON memories(project_root, status, pinned DESC, importance DESC);
      CREATE TABLE IF NOT EXISTS decisions (
        id TEXT PRIMARY KEY,
        project_root TEXT NOT NULL,
        scope TEXT NOT NULL,
        subject TEXT NOT NULL,
        content TEXT NOT NULL,
        importance REAL NOT NULL DEFAULT 0.85,
        confidence REAL NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'active',
        source_kind TEXT NOT NULL,
        source_ref TEXT NOT NULL,
        source_conversation_id TEXT,
        content_hash TEXT NOT NULL,
        supersedes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS decisions_source_hash
        ON decisions(project_root, source_ref, content_hash);
      CREATE INDEX IF NOT EXISTS decisions_project_status
        ON decisions(project_root, status, updated_at DESC);
      CREATE TABLE IF NOT EXISTS open_loops (
        id TEXT PRIMARY KEY,
        project_root TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'open',
        priority REAL NOT NULL DEFAULT 0.5,
        source_kind TEXT NOT NULL,
        source_ref TEXT NOT NULL,
        source_conversation_id TEXT,
        related_task_id TEXT,
        content_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS open_loops_source_hash
        ON open_loops(project_root, source_ref, content_hash);
      CREATE INDEX IF NOT EXISTS open_loops_project_status
        ON open_loops(project_root, status, priority DESC, updated_at DESC);
      CREATE TABLE IF NOT EXISTS continuity_links (
        id TEXT PRIMARY KEY,
        project_root TEXT NOT NULL,
        from_kind TEXT NOT NULL,
        from_id TEXT NOT NULL,
        relation TEXT NOT NULL,
        to_kind TEXT NOT NULL,
        to_id TEXT NOT NULL,
        weight REAL NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS project_states (
        project_root TEXT PRIMARY KEY,
        summary TEXT NOT NULL,
        active_decisions_json TEXT NOT NULL,
        open_loops_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS topics (
        id TEXT PRIMARY KEY,
        project_root TEXT NOT NULL,
        name TEXT NOT NULL,
        normalized_name TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(project_root, normalized_name)
      );
      CREATE TABLE IF NOT EXISTS topic_memberships (
        topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
        member_kind TEXT NOT NULL,
        member_id TEXT NOT NULL,
        weight REAL NOT NULL DEFAULT 1,
        PRIMARY KEY(topic_id, member_kind, member_id)
      );
      CREATE TABLE IF NOT EXISTS user_model (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        source_kind TEXT NOT NULL,
        source_ref TEXT NOT NULL,
        confidence REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS observations (
        source_ref TEXT NOT NULL,
        kind TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY(source_ref, kind)
      );
      CREATE TABLE IF NOT EXISTS retrieval_runs (
        id TEXT PRIMARY KEY,
        project_root TEXT NOT NULL,
        conversation_id TEXT,
        query TEXT NOT NULL,
        selected_context TEXT NOT NULL,
        estimated_tokens INTEGER NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS retrieval_candidates (
        run_id TEXT NOT NULL REFERENCES retrieval_runs(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        ref_id TEXT NOT NULL,
        score REAL NOT NULL,
        selected INTEGER NOT NULL,
        reason TEXT NOT NULL,
        PRIMARY KEY(run_id, kind, ref_id)
      );
      CREATE TABLE IF NOT EXISTS project_settings (
        project_root TEXT PRIMARY KEY,
        sharing_enabled INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS continuity_fts USING fts5(
        kind UNINDEXED,
        ref_id UNINDEXED,
        project_root UNINDEXED,
        label,
        content,
        source UNINDEXED,
        conversation_id UNINDEXED,
        tokenize='unicode61 remove_diacritics 2'
      );
    `);
    this.db
      .prepare(
        "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(1, ?)",
      )
      .run(timestamp());
  }

  transaction(action) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = action();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  indexItem({
    kind,
    refId,
    projectRoot,
    label,
    content,
    source,
    conversationId,
  }) {
    this.db
      .prepare("DELETE FROM continuity_fts WHERE kind = ? AND ref_id = ?")
      .run(kind, refId);
    this.db
      .prepare(
        `INSERT INTO continuity_fts
          (kind, ref_id, project_root, label, content, source, conversation_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        kind,
        refId,
        projectRoot,
        label,
        content,
        source,
        conversationId || "",
      );
  }

  syncConversation(chat, observe = false) {
    const now = timestamp();
    const summary = conversationSummary(chat);
    const topics = conversationTopics(chat);
    this.transaction(() => {
      const existing = this.db
        .prepare(
          "SELECT created_at, provider_history_json FROM conversations WHERE id = ?",
        )
        .get(chat.id);
      const providerHistory = existing?.provider_history_json
        ? JSON.parse(existing.provider_history_json)
        : [];
      if (
        chat.profile &&
        !providerHistory.some(
          (item) =>
            item.provider === chat.profile.provider &&
            item.model === chat.profile.model,
        )
      )
        providerHistory.push(chat.profile);
      this.db
        .prepare(
          `INSERT INTO conversations
            (id, project_root, title, summary, topics_json,
             provider_history_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             project_root = excluded.project_root,
             title = excluded.title,
             summary = excluded.summary,
             topics_json = excluded.topics_json,
             provider_history_json = excluded.provider_history_json,
             updated_at = excluded.updated_at`,
        )
        .run(
          chat.id,
          chat.root,
          chat.title || "New conversation",
          summary,
          JSON.stringify(topics),
          JSON.stringify(providerHistory),
          existing?.created_at || now,
          now,
        );
      const insert = this.db.prepare(
        `INSERT INTO conversation_messages
          (id, conversation_id, position, role, content, visible_content, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(conversation_id, position) DO UPDATE SET
           role = excluded.role,
           content = excluded.content,
           visible_content = excluded.visible_content`,
      );
      this.db
        .prepare("DELETE FROM continuity_fts WHERE conversation_id = ?")
        .run(chat.id);
      this.db
        .prepare(
          "DELETE FROM conversation_messages WHERE conversation_id = ? AND position >= ?",
        )
        .run(chat.id, chat.messages.length);
      chat.messages.forEach((message, position) => {
        const refId = `${chat.id}:${position}`;
        const visible = message.userInput || message.content;
        insert.run(
          refId,
          chat.id,
          position,
          message.role,
          message.content,
          visible,
          now,
        );
        if (visible.trim())
          this.indexItem({
            kind: "conversation",
            refId,
            projectRoot: chat.root,
            label: chat.title || "Conversation",
            content: visible,
            source: `Conversation ${chat.id}`,
            conversationId: chat.id,
          });
      });
      for (const topic of topics) {
        const existingTopic = this.db
          .prepare(
            "SELECT id FROM topics WHERE project_root = ? AND normalized_name = ?",
          )
          .get(chat.root, topic);
        const topicId = existingTopic?.id || identifier("topic");
        this.db
          .prepare(
            `INSERT INTO topics(id, project_root, name, normalized_name, updated_at)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(project_root, normalized_name) DO UPDATE SET
               name = excluded.name, updated_at = excluded.updated_at`,
          )
          .run(topicId, chat.root, topic, topic, now);
        this.db
          .prepare(
            `INSERT OR REPLACE INTO topic_memberships
              (topic_id, member_kind, member_id, weight)
             VALUES (?, 'conversation', ?, 1)`,
          )
          .run(topicId, chat.id);
      }
    });
    if (observe) {
      this.observeConversation(chat);
      this.refreshProjectState(chat.root);
    }
  }

  importLegacy(chats) {
    for (const chat of chats || []) this.syncConversation(chat, true);
  }

  removeConversation(id) {
    const conversation = this.db
      .prepare("SELECT project_root FROM conversations WHERE id = ?")
      .get(id);
    if (!conversation) return false;
    this.transaction(() => {
      const derivedIds = [];
      for (const table of ["memories", "decisions", "open_loops"]) {
        derivedIds.push(
          ...this.db
            .prepare(`SELECT id FROM ${table} WHERE source_conversation_id = ?`)
            .all(id)
            .map((item) => item.id),
        );
        this.db
          .prepare(`DELETE FROM ${table} WHERE source_conversation_id = ?`)
          .run(id);
      }
      for (const derivedId of derivedIds) {
        this.db
          .prepare(
            "DELETE FROM continuity_fts WHERE ref_id = ? AND kind != 'conversation'",
          )
          .run(derivedId);
        this.db
          .prepare(
            "DELETE FROM continuity_links WHERE from_id = ? OR to_id = ?",
          )
          .run(derivedId, derivedId);
      }
      this.db
        .prepare("DELETE FROM user_model WHERE substr(source_ref, 1, ?) = ?")
        .run(id.length + 1, `${id}:`);
      this.db
        .prepare("DELETE FROM observations WHERE substr(source_ref, 1, ?) = ?")
        .run(id.length + 1, `${id}:`);
      const topicIds = this.db
        .prepare(
          "SELECT topic_id FROM topic_memberships WHERE member_kind = 'conversation' AND member_id = ?",
        )
        .all(id)
        .map((item) => item.topic_id);
      this.db
        .prepare(
          "DELETE FROM topic_memberships WHERE member_kind = 'conversation' AND member_id = ?",
        )
        .run(id);
      for (const topicId of topicIds)
        this.db
          .prepare(
            "DELETE FROM topics WHERE id = ? AND NOT EXISTS (SELECT 1 FROM topic_memberships WHERE topic_id = ?)",
          )
          .run(topicId, topicId);
      this.db
        .prepare("DELETE FROM continuity_fts WHERE conversation_id = ?")
        .run(id);
      this.db.prepare("DELETE FROM conversations WHERE id = ?").run(id);
    });
    this.refreshProjectState(conversation.project_root);
    return true;
  }

  importProjectMemory(projectRoot, memory) {
    const content = normalized(memory?.text);
    if (!content) return null;
    const sourceRef = path.join(projectRoot, ".yana-ai", "project-memory.md");
    const contentHash = hash(content);
    const existing = this.db
      .prepare(
        `SELECT id, content_hash FROM memories
         WHERE project_root = ? AND source_kind = 'project_memory' AND source_ref = ?
         ORDER BY updated_at DESC LIMIT 1`,
      )
      .get(projectRoot, sourceRef);
    if (existing?.content_hash === contentHash) return existing.id;
    if (existing)
      this.db
        .prepare(
          "UPDATE memories SET status = 'superseded', updated_at = ? WHERE id = ?",
        )
        .run(timestamp(), existing.id);
    const id = identifier("mem");
    const now = timestamp();
    this.db
      .prepare(
        `INSERT INTO memories
          (id, project_root, scope, type, content, importance, confidence, status,
           pinned, source_kind, source_ref, content_hash, supersedes, created_at, updated_at)
         VALUES (?, ?, ?, 'project_fact', ?, 0.9, 1, 'active', 1,
                 'project_memory', ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        projectRoot,
        `project:${projectRoot}`,
        content,
        sourceRef,
        contentHash,
        existing?.id || null,
        now,
        now,
      );
    this.indexItem({
      kind: "memory",
      refId: id,
      projectRoot,
      label: "Project Memory",
      content,
      source: ".yana-ai/project-memory.md",
    });
    return id;
  }

  observed(sourceRef, kind) {
    return Boolean(
      this.db
        .prepare("SELECT 1 FROM observations WHERE source_ref = ? AND kind = ?")
        .get(sourceRef, kind),
    );
  }

  markObserved(sourceRef, kind) {
    this.db
      .prepare(
        "INSERT OR IGNORE INTO observations(source_ref, kind, created_at) VALUES(?, ?, ?)",
      )
      .run(sourceRef, kind, timestamp());
  }

  observeConversation(chat) {
    chat.messages.forEach((message, position) => {
      if (message.role !== "user") return;
      const sourceRef = `${chat.id}:${position}`;
      const visible = message.userInput || message.content;
      for (const sentence of sentences(visible)) {
        if (!sentence.endsWith("?") && DECISION_PATTERN.test(sentence))
          this.recordDecision(chat.root, chat.id, sourceRef, sentence);
        if (!sentence.endsWith("?") && OPEN_LOOP_PATTERN.test(sentence))
          this.recordOpenLoop(chat.root, chat.id, sourceRef, sentence);
        if (!sentence.endsWith("?") && PREFERENCE_PATTERN.test(sentence))
          this.recordPreference(chat.root, chat.id, sourceRef, sentence);
      }
    });
  }

  recordDecision(projectRoot, conversationId, sourceRef, content) {
    const observation = `${sourceRef}:${hash(content).slice(0, 16)}`;
    if (this.observed(observation, "decision")) return;
    const contentHash = hash(content);
    const duplicate = this.db
      .prepare(
        "SELECT id FROM decisions WHERE project_root = ? AND content_hash = ? LIMIT 1",
      )
      .get(projectRoot, contentHash);
    if (duplicate) {
      this.markObserved(observation, "decision");
      return;
    }
    const subject = subjectFor(content) || "project direction";
    const status = HEDGE_PATTERN.test(content) ? "review" : ACTIVE;
    const active = this.db
      .prepare(
        `SELECT id, subject, content FROM decisions
         WHERE project_root = ? AND status = 'active'
         ORDER BY updated_at DESC LIMIT 50`,
      )
      .all(projectRoot);
    let supersedes =
      status === ACTIVE
        ? active.find((item) => item.subject === subject) || null
        : null;
    if (!supersedes && status === ACTIVE && CORRECTION_PATTERN.test(content)) {
      supersedes =
        active
          .map((item) => ({
            ...item,
            relation: overlap(item.content, content),
          }))
          .filter(
            (item) =>
              item.relation >= 0.2 &&
              tokens(item.content).filter((token) =>
                tokens(content).includes(token),
              ).length >= 2,
          )
          .sort((left, right) => right.relation - left.relation)[0] || null;
    }
    const id = identifier("decision");
    const now = timestamp();
    this.transaction(() => {
      if (supersedes)
        this.db
          .prepare(
            "UPDATE decisions SET status = 'superseded', updated_at = ? WHERE id = ?",
          )
          .run(now, supersedes.id);
      this.db
        .prepare(
          `INSERT INTO decisions
            (id, project_root, scope, subject, content, source_kind, source_ref,
             source_conversation_id, content_hash, status, supersedes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'conversation', ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          projectRoot,
          `project:${projectRoot}`,
          subject,
          content,
          sourceRef,
          conversationId,
          contentHash,
          status,
          supersedes?.id || null,
          now,
          now,
        );
      if (supersedes)
        this.db
          .prepare(
            `INSERT INTO continuity_links
              (id, project_root, from_kind, from_id, relation, to_kind, to_id, weight, created_at)
             VALUES (?, ?, 'decision', ?, 'supersedes', 'decision', ?, 1, ?)`,
          )
          .run(identifier("link"), projectRoot, id, supersedes.id, now);
    });
    this.indexItem({
      kind: "decision",
      refId: id,
      projectRoot,
      label: subject,
      content,
      source: `Conversation ${conversationId}`,
      conversationId,
    });
    this.markObserved(observation, "decision");
    this.refreshProjectState(projectRoot);
  }

  recordOpenLoop(projectRoot, conversationId, sourceRef, content) {
    const observation = `${sourceRef}:${hash(content).slice(0, 16)}`;
    if (this.observed(observation, "open_loop")) return;
    const contentHash = hash(content);
    const duplicate = this.db
      .prepare(
        "SELECT id FROM open_loops WHERE project_root = ? AND content_hash = ? LIMIT 1",
      )
      .get(projectRoot, contentHash);
    if (!duplicate) {
      const id = identifier("loop");
      const now = timestamp();
      this.db
        .prepare(
          `INSERT INTO open_loops
            (id, project_root, title, description, source_kind, source_ref,
             source_conversation_id, content_hash, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'conversation', ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          projectRoot,
          content.slice(0, 180),
          content,
          sourceRef,
          conversationId,
          contentHash,
          now,
          now,
        );
      this.indexItem({
        kind: "open_loop",
        refId: id,
        projectRoot,
        label: "Open work",
        content,
        source: `Conversation ${conversationId}`,
        conversationId,
      });
    }
    this.markObserved(observation, "open_loop");
    this.refreshProjectState(projectRoot);
  }

  recordPreference(projectRoot, conversationId, sourceRef, content) {
    const contentHash = hash(content);
    const observation = `${sourceRef}:${contentHash.slice(0, 16)}`;
    if (this.observed(observation, "preference")) return;
    const key = `preference:${contentHash.slice(0, 24)}`;
    const now = timestamp();
    this.db
      .prepare(
        `INSERT INTO user_model
          (key, value, source_kind, source_ref, confidence, status, updated_at)
         VALUES (?, ?, 'conversation', ?, 1, 'active', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value,
           source_ref = excluded.source_ref, updated_at = excluded.updated_at`,
      )
      .run(key, content, sourceRef, now);
    const existing = this.db
      .prepare(
        `SELECT id FROM memories
         WHERE scope = 'global:user' AND type = 'workflow_preference'
           AND content_hash = ? LIMIT 1`,
      )
      .get(contentHash);
    if (!existing) {
      const id = identifier("mem");
      this.db
        .prepare(
          `INSERT INTO memories
            (id, project_root, scope, type, content, importance, confidence,
             source_kind, source_ref, source_conversation_id, content_hash,
             created_at, updated_at)
           VALUES (?, ?, 'global:user', 'workflow_preference', ?, 0.8, 1,
                   'conversation', ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          projectRoot,
          content,
          sourceRef,
          conversationId,
          contentHash,
          now,
          now,
        );
      this.indexItem({
        kind: "memory",
        refId: id,
        projectRoot,
        label: "Working preference",
        content,
        source: `Conversation ${conversationId}`,
        conversationId,
      });
    }
    this.markObserved(observation, "preference");
  }

  syncTasks(projectRoot, tasks) {
    const seen = new Set();
    const now = timestamp();
    for (const task of tasks || []) {
      if (!task?.id || !task?.name) continue;
      seen.add(task.id);
      const content = normalized(
        [task.name, task.scope && `Scope: ${task.scope}`]
          .filter(Boolean)
          .join(". "),
      );
      const status = task.status === "done" ? "closed" : "open";
      const existing = this.db
        .prepare(
          `SELECT id FROM open_loops
           WHERE project_root = ? AND source_kind = 'runtime_task' AND source_ref = ?`,
        )
        .get(projectRoot, task.id);
      const id = existing?.id || identifier("loop");
      this.db
        .prepare(
          `INSERT INTO open_loops
            (id, project_root, title, description, status, priority,
             source_kind, source_ref, related_task_id, content_hash,
             created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'runtime_task', ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET title = excluded.title,
             description = excluded.description, status = excluded.status,
             priority = excluded.priority, content_hash = excluded.content_hash,
             updated_at = excluded.updated_at`,
        )
        .run(
          id,
          projectRoot,
          task.name,
          content,
          status,
          task.blocked ? 0.8 : 0.6,
          task.id,
          task.id,
          hash(content),
          now,
          now,
        );
      if (status === "open")
        this.indexItem({
          kind: "open_loop",
          refId: id,
          projectRoot,
          label: "Runtime task",
          content,
          source: `yana-rt task ${task.id}`,
        });
      else
        this.db
          .prepare(
            "DELETE FROM continuity_fts WHERE kind = 'open_loop' AND ref_id = ?",
          )
          .run(id);
    }
    for (const item of this.db
      .prepare(
        `SELECT id, source_ref FROM open_loops
         WHERE project_root = ? AND source_kind = 'runtime_task' AND status = 'open'`,
      )
      .all(projectRoot)) {
      if (seen.has(item.source_ref)) continue;
      this.db
        .prepare(
          "UPDATE open_loops SET status = 'closed', updated_at = ? WHERE id = ?",
        )
        .run(now, item.id);
      this.db
        .prepare(
          "DELETE FROM continuity_fts WHERE kind = 'open_loop' AND ref_id = ?",
        )
        .run(item.id);
    }
    this.refreshProjectState(projectRoot);
  }

  refreshProjectState(projectRoot) {
    const decisions = this.db
      .prepare(
        `SELECT id, subject, content FROM decisions
         WHERE project_root = ? AND status = 'active'
         ORDER BY importance DESC, updated_at DESC LIMIT 12`,
      )
      .all(projectRoot);
    const openLoops = this.db
      .prepare(
        `SELECT id, title, description FROM open_loops
         WHERE project_root = ? AND status = 'open'
         ORDER BY priority DESC, updated_at DESC LIMIT 12`,
      )
      .all(projectRoot);
    const summary = [
      ...decisions.slice(0, 4).map((item) => item.content),
      ...openLoops.slice(0, 4).map((item) => item.description),
    ].join("\n");
    this.db
      .prepare(
        `INSERT INTO project_states
          (project_root, summary, active_decisions_json, open_loops_json, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(project_root) DO UPDATE SET
           summary = excluded.summary,
           active_decisions_json = excluded.active_decisions_json,
           open_loops_json = excluded.open_loops_json,
           updated_at = excluded.updated_at`,
      )
      .run(
        projectRoot,
        summary,
        JSON.stringify(decisions),
        JSON.stringify(openLoops),
        timestamp(),
      );
  }

  structuredCandidates(projectRoot) {
    const candidates = [];
    for (const item of this.db
      .prepare(
        `SELECT id, subject AS label, content, source_ref, source_conversation_id,
                importance, confidence, status, updated_at
         FROM decisions WHERE project_root = ?
         ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, updated_at DESC LIMIT 30`,
      )
      .all(projectRoot))
      candidates.push({
        kind: "decision",
        refId: item.id,
        label: item.label,
        content: item.content,
        source: sourceLabel(item),
        conversationId: item.source_conversation_id,
        importance: item.importance,
        confidence: item.confidence,
        status: item.status,
        updatedAt: item.updated_at,
      });
    for (const item of this.db
      .prepare(
        `SELECT id, 'Open work' AS label, description AS content, source_ref,
                source_conversation_id, priority, status, updated_at
         FROM open_loops WHERE project_root = ? AND status = 'open'
         ORDER BY priority DESC, updated_at DESC LIMIT 20`,
      )
      .all(projectRoot))
      candidates.push({
        kind: "open_loop",
        refId: item.id,
        label: item.label,
        content: item.content,
        source: sourceLabel(item),
        conversationId: item.source_conversation_id,
        importance: item.priority,
        confidence: 1,
        status: item.status,
        updatedAt: item.updated_at,
      });
    for (const item of this.db
      .prepare(
        `SELECT id, type AS label, content, source_ref, source_conversation_id,
                importance, confidence, status, updated_at, pinned
         FROM memories
         WHERE (project_root = ? OR scope = 'global:user') AND status = 'active'
         ORDER BY pinned DESC, importance DESC, updated_at DESC LIMIT 20`,
      )
      .all(projectRoot))
      candidates.push({
        kind: "memory",
        refId: item.id,
        label: item.label,
        content: item.content,
        source: sourceLabel(item),
        conversationId: item.source_conversation_id,
        importance: item.importance,
        confidence: item.confidence,
        status: item.status,
        pinned: Boolean(item.pinned),
        updatedAt: item.updated_at,
      });
    return candidates;
  }

  lexicalCandidates(projectRoot, query, currentConversationId) {
    const queryTokens = tokens(query).slice(0, 16);
    if (!queryTokens.length) return [];
    const expression = queryTokens
      .map((token) => `"${token.replaceAll('"', '""')}"`)
      .join(" OR ");
    return this.db
      .prepare(
        `SELECT kind, ref_id, label, content, source, conversation_id, bm25(continuity_fts) AS rank
         FROM continuity_fts
         WHERE continuity_fts MATCH ? AND project_root = ?
           AND (conversation_id = '' OR conversation_id != ?)
         ORDER BY rank LIMIT 40`,
      )
      .all(expression, projectRoot, currentConversationId || "")
      .map((item) => ({
        kind: item.kind,
        refId: item.ref_id,
        label: item.label,
        content: item.content,
        source: item.source,
        conversationId: item.conversation_id,
        importance: 0.5,
        confidence: 0.75,
        status: ACTIVE,
        lexicalRank: item.rank,
      }));
  }

  retrieve(projectRoot, query, currentConversationId = "") {
    const runId = identifier("retrieval");
    const supersededEvidence = new Set(
      this.db
        .prepare(
          `SELECT content_hash FROM decisions
           WHERE project_root = ? AND status = 'superseded'`,
        )
        .all(projectRoot)
        .map((item) => item.content_hash),
    );
    const byKey = new Map();
    for (const candidate of [
      ...this.structuredCandidates(projectRoot),
      ...this.lexicalCandidates(projectRoot, query, currentConversationId),
    ]) {
      const key = `${candidate.kind}:${candidate.refId}`;
      const merged = { ...candidate, ...byKey.get(key) };
      if (
        merged.kind === "conversation" &&
        supersededEvidence.has(hash(merged.content))
      )
        merged.status = "superseded_evidence";
      byKey.set(key, merged);
    }
    const ranked = [...byKey.values()]
      .map((candidate) => {
        const lexical = overlap(
          query,
          `${candidate.label} ${candidate.content}`,
        );
        const base =
          candidate.kind === "decision"
            ? 4
            : candidate.kind === "open_loop"
              ? 3.2
              : candidate.kind === "memory"
                ? 2.4
                : 1.4;
        const activeBonus =
          candidate.status === ACTIVE || candidate.status === "open" ? 1.4 : -5;
        const pinnedBonus = candidate.pinned ? 1.2 : 0;
        const score =
          base +
          lexical * 5 +
          activeBonus +
          pinnedBonus +
          Number(candidate.importance || 0.5) +
          Number(candidate.confidence || 0.5);
        return {
          ...candidate,
          score,
          reason:
            candidate.status !== ACTIVE && candidate.status !== "open"
              ? `Rejected: ${candidate.status}`
              : `${candidate.kind}; project match; lexical ${lexical.toFixed(2)}`,
        };
      })
      .sort((left, right) => right.score - left.score);
    const sections = new Map([
      ["decision", []],
      ["open_loop", []],
      ["memory", []],
      ["conversation", []],
    ]);
    const selected = [];
    let budget = 0;
    for (const candidate of ranked) {
      if (
        candidate.score < 2.2 ||
        !sections.has(candidate.kind) ||
        ![ACTIVE, "open"].includes(candidate.status)
      )
        continue;
      const cost = estimatedTokens(candidate.content);
      if (budget + cost > MAX_CONTEXT_TOKENS) continue;
      sections.get(candidate.kind).push(candidate);
      selected.push(candidate);
      budget += cost;
      if (selected.length >= 14) break;
    }
    const contextParts = [`CURRENT PROJECT\n${path.basename(projectRoot)}`];
    const headings = {
      decision: "ACTIVE DECISIONS",
      open_loop: "OPEN WORK",
      memory: "PROJECT MEMORY",
      conversation: "RELEVANT CONVERSATIONS",
    };
    for (const [kind, items] of sections) {
      if (!items.length) continue;
      contextParts.push(
        `${headings[kind]}\n${items
          .map((item) => `- ${item.content} [source: ${item.source}]`)
          .join("\n")}`,
      );
    }
    const context = contextParts.join("\n\n");
    const selectedKeys = new Set(
      selected.map((item) => `${item.kind}:${item.refId}`),
    );
    this.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO retrieval_runs
            (id, project_root, conversation_id, query, selected_context,
             estimated_tokens, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 'ok', ?)`,
        )
        .run(
          runId,
          projectRoot,
          currentConversationId || null,
          query,
          context,
          budget,
          timestamp(),
        );
      const insert = this.db.prepare(
        `INSERT INTO retrieval_candidates
          (run_id, kind, ref_id, score, selected, reason)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );
      for (const candidate of ranked.slice(0, 60)) {
        const chosen = selectedKeys.has(`${candidate.kind}:${candidate.refId}`);
        insert.run(
          runId,
          candidate.kind,
          candidate.refId,
          candidate.score,
          chosen ? 1 : 0,
          chosen
            ? candidate.reason
            : candidate.reason.replace("Rejected", "Not selected"),
        );
      }
    });
    return {
      status: "ok",
      runId,
      context,
      estimatedTokens: budget,
      sources: selected.map(publicSource),
      candidateCount: ranked.length,
    };
  }

  overview(projectRoot) {
    const count = (table, where, ...parameters) =>
      this.db
        .prepare(`SELECT COUNT(*) AS count FROM ${table} ${where}`)
        .get(...parameters).count;
    return {
      status: "ok",
      sharingEnabled: this.sharingEnabled(projectRoot),
      conversations: count(
        "conversations",
        "WHERE project_root = ?",
        projectRoot,
      ),
      memories: count(
        "memories",
        "WHERE project_root = ? AND status = 'active'",
        projectRoot,
      ),
      projectState: (() => {
        const state = this.db
          .prepare(
            `SELECT summary, active_decisions_json AS activeDecisions,
                    open_loops_json AS openLoops, updated_at AS updatedAt
             FROM project_states WHERE project_root = ?`,
          )
          .get(projectRoot);
        return state
          ? {
              ...state,
              activeDecisions: JSON.parse(state.activeDecisions),
              openLoops: JSON.parse(state.openLoops),
            }
          : null;
      })(),
      topics: this.db
        .prepare(
          `SELECT topics.id, topics.name, COUNT(topic_memberships.member_id) AS members
           FROM topics LEFT JOIN topic_memberships ON topic_memberships.topic_id = topics.id
           WHERE topics.project_root = ? GROUP BY topics.id
           ORDER BY members DESC, topics.name LIMIT 30`,
        )
        .all(projectRoot),
      userModel: this.db
        .prepare(
          `SELECT key, value, source_ref AS source, confidence,
                  status, updated_at AS updatedAt
           FROM user_model WHERE status = 'active'
           ORDER BY updated_at DESC LIMIT 30`,
        )
        .all(),
      decisions: this.db
        .prepare(
          `SELECT id, subject, content, status, source_ref AS source,
                  source_conversation_id AS conversationId, confidence, updated_at AS updatedAt
           FROM decisions WHERE project_root = ?
           ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, updated_at DESC LIMIT 30`,
        )
        .all(projectRoot),
      openLoops: this.db
        .prepare(
          `SELECT id, title, description, status, source_ref AS source,
                  source_conversation_id AS conversationId, priority, updated_at AS updatedAt
           FROM open_loops WHERE project_root = ?
           ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END, updated_at DESC LIMIT 30`,
        )
        .all(projectRoot),
      recentConversations: this.db
        .prepare(
          `SELECT id, title, summary, updated_at AS updatedAt
           FROM conversations WHERE project_root = ? ORDER BY updated_at DESC LIMIT 12`,
        )
        .all(projectRoot),
      recentRuns: this.db
        .prepare(
          `SELECT id, query, estimated_tokens AS estimatedTokens, status, created_at AS createdAt
           FROM retrieval_runs WHERE project_root = ? ORDER BY created_at DESC LIMIT 12`,
        )
        .all(projectRoot),
    };
  }

  sharingEnabled(projectRoot) {
    return Boolean(
      this.db
        .prepare(
          "SELECT sharing_enabled FROM project_settings WHERE project_root = ?",
        )
        .get(projectRoot)?.sharing_enabled,
    );
  }

  setSharing(projectRoot, enabled) {
    if (typeof enabled !== "boolean")
      throw new Error("Continuity sharing must be enabled or disabled");
    this.db
      .prepare(
        `INSERT INTO project_settings(project_root, sharing_enabled, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(project_root) DO UPDATE SET
           sharing_enabled = excluded.sharing_enabled,
           updated_at = excluded.updated_at`,
      )
      .run(projectRoot, enabled ? 1 : 0, timestamp());
    return this.overview(projectRoot);
  }

  close() {
    this.db.close();
  }
}

module.exports = {
  composeTurnSystem,
  ContinuityEngine,
  estimatedTokens,
  overlap,
  subjectFor,
};
