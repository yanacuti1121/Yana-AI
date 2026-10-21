// Hàm tiện ích cho webview Design Canvas: dựng phần tử bằng textContent, khung xem trước sandbox, co giãn
// khung theo chỗ trống, tách HTML khỏi phần chữ model trả về. Không giữ trạng thái.
(function () {
	'use strict';
	const WIDTH = { desktop: 1280, phone: 390 };

	function el(tag, cls, text) {
		const node = document.createElement(tag);
		if (cls) node.className = cls;
		if (text !== undefined && text !== null) node.textContent = String(text);
		return node;
	}

	function button(label, cls, onClick, title) {
		const node = el('button', `btn ${cls || ''}`.trim(), label);
		node.type = 'button';
		if (title) node.title = title;
		node.addEventListener('click', onClick);
		return node;
	}

	const kb = text => `${(text.length / 1024).toFixed(1)} KB`;
	const time = at => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

	// Một cột xem trước: tiêu đề (tuỳ chọn) + iframe sandbox="" (không script, không mạng) trong khung thu nhỏ.
	function makeFrame(html, device, caption, onPick) {
		const column = el('div', 'column');
		if (caption) {
			const head = el('div', 'column-head');
			head.append(el('span', '', caption));
			if (onPick) head.append(button('Use this', '', onPick));
			column.append(head);
		}
		const wrap = el('div', 'frame-wrap');
		wrap.dataset.device = device || 'desktop';
		const frame = el('iframe', 'frame');
		frame.setAttribute('sandbox', '');
		frame.setAttribute('title', caption || 'Screen preview');
		frame.srcdoc = html || '';
		wrap.append(frame);
		column.append(wrap);
		return column;
	}

	// Thu nhỏ khung 1280px/390px cho vừa chỗ; gọi khi đổi kích thước hoặc đổi nội dung, không chạy theo nhịp.
	function fitFrames(stage) {
		const wraps = [...stage.querySelectorAll('.frame-wrap')];
		const columnWidth = (stage.clientWidth - 32 - (wraps.length - 1) * 12) / Math.max(1, wraps.length);
		for (const wrap of wraps) {
			const frame = wrap.firstChild;
			const width = WIDTH[wrap.dataset.device] || WIDTH.desktop;
			const scale = Math.min(1, columnWidth / width);
			const height = Math.max(360, stage.clientHeight - 64);
			frame.style.width = `${width}px`;
			frame.style.height = `${height / scale}px`;
			frame.style.transform = `scale(${scale})`;
			wrap.style.width = `${width * scale}px`;
			wrap.style.height = `${height}px`;
		}
	}

	// Giống canvas-ai.js extractHtml phía extension: lấy HTML kể cả khi khối code chưa đóng (đang stream).
	function extractHtml(text) {
		const fence = /```html\s*\n([\s\S]*?)(```|$)/i.exec(text);
		if (fence) return fence[1];
		const start = text.search(/<!doctype html|<html[\s>]/i);
		return start >= 0 ? text.slice(start) : '';
	}

	window.YanaCanvasUI = { WIDTH, el, button, kb, time, makeFrame, fitFrames, extractHtml };
})();
