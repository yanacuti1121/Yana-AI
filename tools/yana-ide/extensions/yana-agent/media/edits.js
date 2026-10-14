'use strict';
// Thẻ "đề xuất sửa file" trong khung chat. Dùng lại kiểu của thẻ thay đổi (diff-card) và nút Approve/Deny sẵn có của panel.
// Chỉ dựng DOM bằng textContent. Nút chỉ gửi id đề xuất cho extension; extension mới là nơi kiểm tra và ghi file.
(function () {
	function create({ el, button, append, post }) {
		const cards = new Map(); // id → vùng nút và dòng trạng thái của thẻ

		function setStatus(id, ok, text) {
			const card = cards.get(id);
			if (!card) return;
			card.actions.replaceChildren(el('span', ok ? 'ok mono' : 'bad mono', text));
			if (ok) cards.delete(id);
		}

		function renderCard(item) {
			const card = el('div', 'diff-card mono');
			const head = el('div', 'diff-head');
			head.append(el('span', 'diff-file', `${item.isNew ? 'new file' : 'edit'}: ${item.path}`), el('span', 'diff-stats', `+${item.additions} `));
			head.querySelector('.diff-stats').append(el('span', 'del', `-${item.deletions}`));
			const body = el('div', 'diff-body');
			for (const line of item.lines) {
				const cls = line.startsWith('+') ? 'diff-line-add' : line.startsWith('-') ? 'diff-line-del' : 'diff-line-ctx';
				body.append(el('div', cls, line));
			}
			const actions = el('div', 'approval-actions');
			if (item.ok) {
				actions.append(
					button('approve mono', 'Apply', () => post({ type: 'editApply', id: item.id })),
					button('deny mono', 'Reject', () => { setStatus(item.id, false, 'Rejected'); post({ type: 'editReject', id: item.id }); }),
					button('mono', 'Review diff', () => post({ type: 'editPreview', id: item.id }), 'Open the side-by-side diff in the editor'),
				);
				cards.set(item.id, { actions });
			} else {
				actions.append(el('span', 'bad mono', `Cannot apply: ${item.error}`));
			}
			card.append(head, body, actions);
			append(card);
		}

		return {
			render(items) { (items || []).forEach(renderCard); },
			status(data) { setStatus(data.id, data.ok, data.ok ? 'Applied' : data.error || 'Failed'); },
		};
	}

	window.yanaEdits = { create };
})();
