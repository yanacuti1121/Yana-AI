'use strict';
// Nhiều hội thoại, lưu theo workspace (thay cho store.cjs chats của app Studio cũ). Danh sách hiện ở view
// Conversations bên trái; panel chat bên phải luôn hiển thị hội thoại đang chọn.
// Project Memory được chụp một lần khi tạo hội thoại và giữ nguyên suốt hội thoại, để không đổi system
// prompt giữa chừng (giữ prompt cache của provider, theo nguyên tắc của Hermes Agent).

const vscode = require('vscode');
const crypto = require('node:crypto');
const { YanaTree, infoItem } = require('./tree');

const STATE_KEY = 'yana.conversations.v1';
const MAX_CONVERSATIONS = 100; // giống giới hạn chats của store.cjs
const MAX_MESSAGES = 400; // 200 lượt hỏi đáp mỗi hội thoại
const TITLE_LENGTH = 45; // tiêu đề tạm lấy từ tin nhắn đầu, như app cũ
// Mỗi lượt ghi lại cả danh sách vào workspaceState; giới hạn mỗi tin để một câu trả lời khổng lồ không
// làm mỗi lần ghi nặng hàng chục MB.
const MAX_MESSAGE_CHARS = 64 * 1024;
const EMPTY = { activeId: '', list: [] };
// Diễn biến công cụ của mỗi lượt được lưu cùng hội thoại để mở lại được như lúc nó chạy (lệnh, diff, quyết định
// duyệt). Chỉ lưu phần cần để vẽ lại; chữ của câu trả lời nằm trong `content`, token nằm trong `tokens`.
const MAX_EVENTS_PER_TURN = 200;
const MAX_EVENT_FIELD_CHARS = 8 * 1024; // một diff khổng lồ không được làm phình kho workspaceState
const STORED_RUNTIME_KINDS_EXCLUDED = new Set(['turn_completed']);
const STORED_EVENT_TYPES = new Set(['runtime_event', 'authority_denied', 'error']);

let context;
let tree;
const changed = new vscode.EventEmitter();

function load() {
	const value = context.workspaceState.get(STATE_KEY, EMPTY);
	return value && Array.isArray(value.list) ? value : EMPTY;
}

async function save(state) {
	const list = [...state.list].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_CONVERSATIONS);
	const activeId = list.some(c => c.id === state.activeId) ? state.activeId : '';
	await context.workspaceState.update(STATE_KEY, { activeId, list });
	tree?.refresh();
	changed.fire(active());
}

function active() {
	const state = load();
	return state.list.find(c => c.id === state.activeId);
}

async function create(system) {
	const now = Date.now();
	const conversation = { id: crypto.randomUUID(), title: 'New conversation', titleSet: false, createdAt: now, updatedAt: now, system: system || '', messages: [] };
	const state = load();
	await save({ activeId: conversation.id, list: [conversation, ...state.list] });
	return conversation;
}

async function ensureActive(systemFactory) {
	return active() || create(systemFactory());
}

async function select(id) {
	const state = load();
	if (!state.list.some(c => c.id === id)) return;
	await save({ ...state, activeId: id });
}

function capFields(event) {
	const copy = {};
	for (const [key, value] of Object.entries(event)) {
		copy[key] = typeof value === 'string' && value.length > MAX_EVENT_FIELD_CHARS ? value.slice(0, MAX_EVENT_FIELD_CHARS) : value;
	}
	return copy;
}

// Giữ các sự kiện đủ để phát lại phiên; bỏ text_delta, metrics và lời xin duyệt đang chờ (nút duyệt của phiên cũ
// không được phép còn bấm được).
function storableEvents(events) {
	const kept = (Array.isArray(events) ? events : [])
		.filter(event => event && STORED_EVENT_TYPES.has(event.type) && !(event.type === 'runtime_event' && STORED_RUNTIME_KINDS_EXCLUDED.has(event.kind)));
	return { events: kept.slice(0, MAX_EVENTS_PER_TURN).map(capFields), truncated: kept.length > MAX_EVENTS_PER_TURN };
}

// `details`: { events, status ('done' | 'cancelled' | 'error'), tokens }. Một lượt chỉ dùng công cụ, bị huỷ hoặc
// báo lỗi cũng được lưu (trước đây mất vì không có chữ trả lời); lượt không có gì để xem lại thì bỏ.
async function appendTurn(id, userText, assistantText, details = {}) {
	const { events, truncated } = storableEvents(details.events);
	if (!assistantText && events.length === 0) return;
	const state = load();
	const list = state.list.map(c => {
		if (c.id !== id) return c;
		const reply = {
			role: 'assistant',
			content: assistantText.slice(0, MAX_MESSAGE_CHARS),
			...(details.status ? { status: details.status } : {}),
			...(details.tokens ? { tokens: { input: details.tokens.input || 0, output: details.tokens.output || 0 } } : {}),
			...(events.length ? { events } : {}),
			...(truncated ? { eventsTruncated: true } : {}),
		};
		const messages = [...c.messages, { role: 'user', content: userText.slice(0, MAX_MESSAGE_CHARS) }, reply].slice(-MAX_MESSAGES);
		const title = c.titleSet ? c.title : userText.replace(/\s+/g, ' ').trim().slice(0, TITLE_LENGTH) || c.title;
		return { ...c, messages, title, titleSet: true, updatedAt: Date.now() };
	});
	await save({ ...state, list });
}

// Ngữ cảnh gửi cho model: chỉ các cặp hỏi–đáp có chữ trả lời, chỉ role và content (không lộ events/status).
function contextMessages(conversation) {
	const messages = conversation?.messages || [];
	const out = [];
	for (let i = 0; i + 1 < messages.length; i += 2) {
		const [question, answer] = [messages[i], messages[i + 1]];
		if (question.role === 'user' && answer.role === 'assistant' && answer.content) {
			out.push({ role: question.role, content: question.content }, { role: answer.role, content: answer.content });
		}
	}
	return out;
}

const PREVIEW_LENGTH = 140; // một dòng xem trước trong màn hình Lịch sử

function previewOf(messages) {
	for (let i = messages.length - 1; i >= 0; i--) {
		const text = String(messages[i].content || '').replace(/\s+/g, ' ').trim();
		if (text) return text.slice(0, PREVIEW_LENGTH);
	}
	return '';
}

// Danh sách gọn cho màn hình Lịch sử trong panel: không gửi nguyên nội dung hội thoại sang webview.
// Hội thoại ghim đứng đầu, còn lại mới nhất trước.
function summaries() {
	const state = load();
	return state.list
		.map(c => ({
			id: c.id,
			title: c.title,
			updatedAt: c.updatedAt,
			turns: Math.floor(c.messages.length / 2),
			preview: previewOf(c.messages),
			pinned: Boolean(c.pinned),
			active: c.id === state.activeId,
		}))
		.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
}

async function pin(id, pinned) {
	const state = load();
	if (!state.list.some(c => c.id === id)) return;
	await save({ ...state, list: state.list.map(c => (c.id === id ? { ...c, pinned: Boolean(pinned) } : c)) });
}

// Panel đăng ký cách mở Lịch sử ngay trong khung chat; khi chưa có panel thì lệnh dùng Quick Pick.
let historyOpener;
function setHistoryOpener(opener) {
	historyOpener = opener;
}

async function rename(id, title) {
	const clean = String(title || '').replace(/\s+/g, ' ').trim().slice(0, 120);
	if (!clean) return;
	const state = load();
	await save({ ...state, list: state.list.map(c => (c.id === id ? { ...c, title: clean, titleSet: true } : c)) });
}

async function remove(id) {
	const state = load();
	await save({ activeId: state.activeId === id ? '' : state.activeId, list: state.list.filter(c => c.id !== id) });
}

function conversationItem(conversation, activeId) {
	const item = infoItem(conversation.title, conversation.id === activeId ? 'comment-discussion' : 'comment', conversation.title);
	item.description = `${conversation.messages.length / 2} turns · ${new Date(conversation.updatedAt).toLocaleDateString()}`;
	item.contextValue = 'yana.conversation';
	item.conversationId = conversation.id;
	item.command = { command: 'yana.chat.open', title: 'Open conversation', arguments: [conversation.id] };
	return item;
}

async function pickConversation() {
	if (historyOpener) return historyOpener();
	const state = load();
	const picked = await vscode.window.showQuickPick(
		state.list.map(c => ({ label: c.title, description: `${c.messages.length / 2} turns`, detail: new Date(c.updatedAt).toLocaleString(), id: c.id })),
		{ placeHolder: state.list.length ? 'Open a conversation' : 'No conversations yet' });
	if (picked) await openInPanel(picked.id);
}

async function openInPanel(id) {
	await select(id);
	await vscode.commands.executeCommand('yana.focus');
}

async function renameCommand(item) {
	const id = item?.conversationId || active()?.id;
	const current = load().list.find(c => c.id === id);
	if (!current) return;
	const title = await vscode.window.showInputBox({ prompt: 'Conversation title', value: current.title });
	if (title !== undefined) await rename(id, title);
}

async function removeCommand(item) {
	const id = item?.conversationId || active()?.id;
	const current = load().list.find(c => c.id === id);
	if (!current) return;
	const answer = await vscode.window.showWarningMessage(`Delete "${current.title}" and its ${current.messages.length / 2} turns?`, { modal: true }, 'Delete');
	if (answer === 'Delete') await remove(id);
}

function activate(extensionContext) {
	context = extensionContext;
	tree = new YanaTree(async () => {
		const state = load();
		return state.list.map(c => conversationItem(c, state.activeId));
	}, 'No conversations yet. Send a message in the Yana AI panel.');
	context.subscriptions.push(
		changed,
		vscode.window.createTreeView('yana.conversations', { treeDataProvider: tree }),
		vscode.commands.registerCommand('yana.chat.open', id => openInPanel(typeof id === 'string' ? id : id?.conversationId)),
		vscode.commands.registerCommand('yana.chat.history', pickConversation),
		vscode.commands.registerCommand('yana.chat.rename', renameCommand),
		vscode.commands.registerCommand('yana.chat.delete', removeCommand),
	);
}

module.exports = {
	id: 'conversations', activate, active, create, ensureActive, appendTurn, contextMessages,
	summaries, select, pin, rename, remove, setHistoryOpener, onDidChange: changed.event,
};
