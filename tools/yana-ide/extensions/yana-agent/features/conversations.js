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

async function appendTurn(id, userText, assistantText) {
	const state = load();
	const list = state.list.map(c => {
		if (c.id !== id) return c;
		const messages = [...c.messages,
			{ role: 'user', content: userText.slice(0, MAX_MESSAGE_CHARS) },
			{ role: 'assistant', content: assistantText.slice(0, MAX_MESSAGE_CHARS) }].slice(-MAX_MESSAGES);
		const title = c.titleSet ? c.title : userText.replace(/\s+/g, ' ').trim().slice(0, TITLE_LENGTH) || c.title;
		return { ...c, messages, title, titleSet: true, updatedAt: Date.now() };
	});
	await save({ ...state, list });
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

module.exports = { id: 'conversations', activate, active, create, ensureActive, appendTurn, onDidChange: changed.event };
