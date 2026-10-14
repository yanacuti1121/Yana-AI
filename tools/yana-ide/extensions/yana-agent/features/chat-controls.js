'use strict';
// Kiểm tra giá trị người dùng nhập cho độ dài trả lời và nhiệt độ. Cùng giới hạn với yana-rt (src/chat/gen_options.rs);
// ô trống nghĩa là "dùng mặc định của nhà cung cấp" và trả về null. Giá trị sai ném lỗi, không bị sửa ngầm.

const MAX_TOKENS_LIMIT = 32000;
const MAX_TEMPERATURE = 2;

function blank(value) {
	return value === null || value === undefined || String(value).trim() === '';
}

function parseMaxTokens(value) {
	if (blank(value)) return null;
	const text = String(value).trim();
	if (!/^\d+$/.test(text)) throw new Error(`Longest reply must be a whole number from 1 to ${MAX_TOKENS_LIMIT}.`);
	const number = Number(text);
	if (number < 1 || number > MAX_TOKENS_LIMIT) throw new Error(`Longest reply must be a whole number from 1 to ${MAX_TOKENS_LIMIT}.`);
	return number;
}

function parseTemperature(value) {
	if (blank(value)) return null;
	const text = String(value).trim();
	if (!/^\d+(\.\d+)?$/.test(text)) throw new Error(`Temperature must be a number from 0 to ${MAX_TEMPERATURE}.`);
	const number = Number(text);
	if (number > MAX_TEMPERATURE) throw new Error(`Temperature must be a number from 0 to ${MAX_TEMPERATURE}.`);
	return number;
}

module.exports = { parseMaxTokens, parseTemperature, MAX_TOKENS_LIMIT, MAX_TEMPERATURE };
