'use strict';
// Thẻ "đề xuất sửa file" trong khung chat. Dùng lại kiểu của thẻ thay đổi (diff-card) và nút Approve/Deny sẵn có của panel.
// Chỉ dựng DOM bằng textContent. Nút chỉ gửi id đề xuất cho extension; extension mới là nơi kiểm tra và ghi file.
(function () {
	function create({ el, button, append, post }) {
		const cards = new Map(); // id → { actions, body, toggleBtn }

		function setStatus(id, ok, text) {
			const card = cards.get(id);
			if (!card) return;
			const badge = el('span', ok ? 'ok mono' : 'bad mono', text);
			card.actions.replaceChildren(badge);
			if (ok) cards.delete(id);
		}

		function renderCard(item) {
			const card = el('div', 'diff-card mono');
			const head = el('div', 'diff-head');

			const fileSpan = el('span', 'diff-file', `${item.isNew ? 'new file' : 'edit'}: ${item.path}`);
			fileSpan.title = 'Click to open file in editor';
			fileSpan.style.cursor = 'pointer';
			fileSpan.addEventListener('click', () => {
				post({ type: 'openFile', path: item.path });
			});

			const stats = el('span', 'diff-stats', `+${item.additions || 0} `);
			const delSpan = el('span', 'del', `-${item.deletions || 0}`);
			stats.append(delSpan);

			const headActions = el('div', 'diff-head-actions');
			const openBtn = button('diff-btn-open mono', 'Open', () => {
				post({ type: 'openFile', path: item.path });
			}, 'Open file in editor');

			const copyDiffBtn = button('diff-btn-copy mono', 'Copy Diff', () => {
				navigator.clipboard.writeText((item.lines || []).join('\n')).then(() => {
					copyDiffBtn.textContent = '✓ Copied';
					setTimeout(() => { copyDiffBtn.textContent = 'Copy Diff'; }, 2000);
				});
			}, 'Copy diff lines');

			const toggleBtn = button('diff-btn-toggle mono', '▾', () => {
				const isHidden = body.style.display === 'none';
				body.style.display = isHidden ? 'block' : 'none';
				toggleBtn.textContent = isHidden ? '▾' : '▸';
			}, 'Toggle diff visibility');

			headActions.append(openBtn, copyDiffBtn, toggleBtn);
			head.append(fileSpan, stats, headActions);

			const body = el('div', 'diff-body');
			for (const line of item.lines || []) {
				const cls = line.startsWith('+') ? 'diff-line-add' : line.startsWith('-') ? 'diff-line-del' : 'diff-line-ctx';
				body.append(el('div', cls, line));
			}

			const actions = el('div', 'approval-actions');
			if (item.ok) {
				actions.append(
					button('approve mono', 'Apply', () => {
						actions.replaceChildren(el('span', 'info mono', 'Applying…'));
						post({ type: 'editApply', id: item.id });
					}, 'Apply change to file and save'),
					button('deny mono', 'Reject', () => {
						setStatus(item.id, false, '✕ Rejected');
						post({ type: 'editReject', id: item.id });
					}, 'Discard this proposed change'),
					button('mono', 'Review diff', () => {
						post({ type: 'editPreview', id: item.id });
					}, 'Open side-by-side split diff in editor (vscode.diff)'),
				);
				cards.set(item.id, { actions, body, toggleBtn });
			} else {
				actions.append(el('span', 'bad mono', `Cannot apply: ${item.error}`));
			}

			card.append(head, body, actions);
			append(card);
		}

		return {
			render(items) { (items || []).forEach(renderCard); },
			status(data) { setStatus(data.id, data.ok, data.ok ? '✓ Applied' : `✕ ${data.error || 'Failed'}`); },
		};
	}

	window.yanaEdits = { create };
})();
