'use strict';
// Hướng dẫn riêng của trợ lý đang chọn (mục L trong ASSISTANT-FEATURES.md) đi vào system prompt của hội thoại MỚI,
// cùng chỗ với Project Memory. System prompt được chụp một lần lúc tạo hội thoại để giữ prompt cache, nên đổi trợ lý
// giữa chừng chỉ có hiệu lực từ hội thoại sau. Module này không dùng `vscode`, để test được.

const MAX_INSTRUCTIONS_CHARS = 8000; // giới hạn đã ghi ở mục L của tài liệu
const MAX_SYSTEM_CHARS = 64 * 1024; // bằng giới hạn của Project Memory (features/project.js)
const MAX_NAME_CHARS = 80;
const LINE_BREAKS = new RegExp('[\\r\\n\\u2028\\u2029]+', 'g');

function oneLine(value) {
	return String(value ?? '').replace(LINE_BREAKS, ' ').trim().slice(0, MAX_NAME_CHARS);
}

/** @returns {{ name: string, text: string } | null} */
function instructionsOf(assistants, selectedId) {
	if (!Array.isArray(assistants) || !selectedId) return null;
	const assistant = assistants.find(item => item && item.id === selectedId);
	if (!assistant || typeof assistant.instructions !== 'string') return null;
	const text = assistant.instructions.trim().slice(0, MAX_INSTRUCTIONS_CHARS);
	return text ? { name: oneLine(assistant.name) || 'assistant', text } : null;
}

function instructionsBlock(instructions) {
	return `YANA ASSISTANT: ${instructions.name}\nThe user wrote these instructions for this assistant. Follow them unless they conflict with the approval rules.\n\n${instructions.text}`;
}

function composeSystem(memory, instructions) {
	const base = typeof memory === 'string' ? memory : '';
	if (!instructions) return base;
	const block = instructionsBlock(instructions);
	if (!base) return block.slice(0, MAX_SYSTEM_CHARS);
	// Khi quá dài thì cắt phần memory, giữ nguyên phần hướng dẫn của trợ lý.
	const room = Math.max(0, MAX_SYSTEM_CHARS - block.length - 2);
	return `${base.slice(0, room)}\n\n${block}`.slice(0, MAX_SYSTEM_CHARS);
}

module.exports = { instructionsOf, composeSystem, MAX_INSTRUCTIONS_CHARS, MAX_SYSTEM_CHARS };
