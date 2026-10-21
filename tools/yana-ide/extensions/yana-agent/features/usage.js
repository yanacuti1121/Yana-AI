'use strict';
// Ghi nhận token mà provider báo về qua sự kiện `metrics` của yana-rt, mỗi lượt chat một bản ghi.
// Không phải hạn mức hay hoá đơn của nhà cung cấp. Logic gộp lấy từ app Studio cũ (host/token-usage.cjs).

const changes = require('./changes');
const { appendUsageRecords, summarizeTokenUsage } = require('../host/token-usage.cjs');

const STATE_KEY = 'yana.usage.v1';

function records(context) {
	const stored = context.globalState.get(STATE_KEY, []);
	return Array.isArray(stored) ? stored : [];
}

async function record(context, { root, provider, model, input, output }) {
	const entry = { root: root || '', provider, model: model || 'default', input, output, recordedAt: new Date().toISOString() };
	const normalized = appendUsageRecords([], [entry]);
	if (!normalized.length) return;
	const next = [...records(context), { ...normalized[0], root: entry.root }].slice(-2000);
	await context.globalState.update(STATE_KEY, next);
	changes.fire('usage');
}

// summarizeTokenUsage nhận danh sách "chat"; mỗi thư mục dự án được coi là một chat chứa usageHistory của nó.
function summary(context, root) {
	const byRoot = new Map();
	for (const entry of records(context)) {
		const list = byRoot.get(entry.root) || [];
		list.push(entry);
		byRoot.set(entry.root, list);
	}
	const chats = [...byRoot.entries()].map(([chatRoot, usageHistory]) => ({ root: chatRoot, usageHistory }));
	return summarizeTokenUsage(chats, root);
}

function count(context) {
	return records(context).length;
}

module.exports = { record, summary, count };
