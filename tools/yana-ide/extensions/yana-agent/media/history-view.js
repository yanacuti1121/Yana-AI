// Màn hình Lịch sử trong panel: tìm, gom theo ngày, ghim, đổi tên, xoá và mở lại hội thoại cũ.
// Chỉ dùng textContent. Danh sách do extension gửi (conversations.summaries), không chứa nội dung tin nhắn đầy đủ.
(function () {
	'use strict';

	const DAY_MS = 24 * 60 * 60 * 1000;
	const MAX_TITLE = 120; // khớp giới hạn của conversations.rename

	function el(tag, className, text) {
		const node = document.createElement(tag);
		if (className) node.className = className;
		if (text !== undefined && text !== null) node.textContent = String(text);
		return node;
	}

	function iconButton(className, label, title, onClick) {
		const node = el('button', `hv-icon ${className}`, label);
		node.type = 'button';
		node.title = title;
		node.setAttribute('aria-label', title);
		node.addEventListener('click', event => { event.stopPropagation(); onClick(); });
		return node;
	}

	// So khớp không phân biệt hoa thường và dấu: "lich su" tìm ra "Lịch sử".
	function fold(text) {
		return String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
	}

	function bucketOf(item, now) {
		if (item.pinned) return 'Pinned';
		const midnight = new Date(now);
		midnight.setHours(0, 0, 0, 0);
		const start = midnight.getTime();
		if (item.updatedAt >= start) return 'Today';
		if (item.updatedAt >= start - DAY_MS) return 'Yesterday';
		if (item.updatedAt >= start - 6 * DAY_MS) return 'Previous 7 days';
		return 'Older';
	}
	const BUCKETS = ['Pinned', 'Today', 'Yesterday', 'Previous 7 days', 'Older'];

	function whenLabel(updatedAt, now) {
		const date = new Date(updatedAt);
		const sameDay = new Date(now).toDateString() === date.toDateString();
		return sameDay
			? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
			: date.toLocaleDateString([], { day: 'numeric', month: 'short', year: date.getFullYear() === new Date(now).getFullYear() ? undefined : 'numeric' });
	}

	function create({ host, post }) {
		let items = [];
		let query = '';
		let renamingId = '';

		const root = el('div', 'hv');
		root.hidden = true;
		root.setAttribute('role', 'dialog');
		root.setAttribute('aria-label', 'Conversation history');

		const head = el('div', 'hv-head');
		const back = el('button', 'hv-back', '←');
		back.type = 'button';
		back.title = 'Back to chat (Esc)';
		back.setAttribute('aria-label', 'Back to chat');
		back.addEventListener('click', () => close());
		head.append(back, el('div', 'hv-title', 'History'));

		const search = el('input', 'hv-search');
		search.type = 'search';
		search.placeholder = 'Search conversations';
		search.setAttribute('aria-label', 'Search conversations');
		search.addEventListener('input', () => { query = search.value; render(); });

		const list = el('div', 'hv-list');
		list.setAttribute('role', 'listbox');
		root.append(head, search, list);
		host.append(root);

		root.addEventListener('keydown', event => {
			if (event.key === 'Escape' && !renamingId) { event.preventDefault(); close(); return; }
			if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
			const rows = [...list.querySelectorAll('.hv-row')];
			if (rows.length === 0) return;
			event.preventDefault();
			const at = rows.indexOf(document.activeElement);
			const next = event.key === 'ArrowDown' ? Math.min(rows.length - 1, at + 1) : Math.max(0, at - 1);
			rows[at === -1 ? 0 : next].focus();
		});

		function visibleItems() {
			const needle = fold(query.trim());
			return needle ? items.filter(item => fold(`${item.title} ${item.preview}`).includes(needle)) : items;
		}

		function startRename(item, titleNode) {
			renamingId = item.id;
			const input = el('input', 'hv-rename');
			input.value = item.title;
			input.maxLength = MAX_TITLE;
			input.setAttribute('aria-label', 'Conversation title');
			let finished = false;
			const finish = save => {
				if (finished) return;
				finished = true;
				renamingId = '';
				const title = input.value.replace(/\s+/g, ' ').trim();
				if (save && title && title !== item.title) post({ type: 'history.rename', id: item.id, title });
				render();
			};
			input.addEventListener('click', event => event.stopPropagation());
			input.addEventListener('keydown', event => {
				event.stopPropagation();
				if (event.key === 'Enter') finish(true);
				else if (event.key === 'Escape') finish(false);
			});
			input.addEventListener('blur', () => finish(true));
			titleNode.replaceWith(input);
			input.focus();
			input.select();
		}

		function row(item, now) {
			const node = el('div', `hv-row${item.active ? ' is-active' : ''}${item.pinned ? ' is-pinned' : ''}`);
			node.tabIndex = 0;
			node.setAttribute('role', 'option');
			node.setAttribute('aria-selected', String(item.active));
			const open = () => {
				if (renamingId) return;
				post({ type: 'history.open', id: item.id });
				close(); // mở lại hội thoại đang mở thì extension không gửi gì, nên tự đóng ở đây
			};
			node.addEventListener('click', open);
			node.addEventListener('keydown', event => {
				if (event.target !== node) return;
				if (event.key === 'Enter') { event.preventDefault(); open(); }
				else if (event.key === 'F2') { event.preventDefault(); startRename(item, title); }
				else if (event.key === 'Delete' || (event.key === 'Backspace' && event.metaKey)) { event.preventDefault(); post({ type: 'history.delete', id: item.id }); }
			});

			const top = el('div', 'hv-top');
			const title = el('span', 'hv-name', item.title || 'New conversation');
			top.append(title);
			if (item.active) top.append(el('span', 'hv-badge', 'Current'));
			const actions = el('span', 'hv-actions');
			actions.append(
				iconButton(item.pinned ? 'is-on' : '', item.pinned ? '★' : '☆', item.pinned ? 'Unpin' : 'Pin to top', () => post({ type: 'history.pin', id: item.id, pinned: !item.pinned })),
				iconButton('', '✎', 'Rename (F2)', () => startRename(item, title)),
				iconButton('hv-del', '🗑', 'Delete', () => post({ type: 'history.delete', id: item.id })),
			);
			top.append(actions);

			const meta = el('div', 'hv-meta', `${item.turns} ${item.turns === 1 ? 'turn' : 'turns'} · ${whenLabel(item.updatedAt, now)}`);
			node.append(top);
			if (item.preview) node.append(el('div', 'hv-preview', item.preview));
			node.append(meta);
			return node;
		}

		function render() {
			if (renamingId) return; // không vẽ lại khi đang gõ tên mới
			const now = Date.now();
			const shown = visibleItems();
			list.replaceChildren();
			if (items.length === 0) {
				list.append(el('div', 'hv-empty', 'No conversations yet. Send a message to start one.'));
				return;
			}
			if (shown.length === 0) {
				list.append(el('div', 'hv-empty', `No conversations match "${query.trim()}".`));
				return;
			}
			const groups = new Map(BUCKETS.map(name => [name, []]));
			shown.forEach(item => groups.get(bucketOf(item, now)).push(item));
			for (const [name, members] of groups) {
				if (members.length === 0) continue;
				list.append(el('div', 'hv-group', name));
				members.forEach(item => list.append(row(item, now)));
			}
		}

		function open() {
			root.hidden = false;
			render();
			search.focus();
		}

		function close() {
			renamingId = '';
			root.hidden = true;
		}

		function update(nextItems, shouldOpen) {
			items = Array.isArray(nextItems) ? nextItems.filter(item => item && typeof item.id === 'string') : [];
			if (shouldOpen) open();
			else if (!root.hidden) render();
		}

		return { update, open, close, isOpen: () => !root.hidden };
	}

	window.yanaHistory = { create, fold, bucketOf };
})();
