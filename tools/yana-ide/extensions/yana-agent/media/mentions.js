// Mentions (@) Autocomplete Controller (Section E1 & P.4 of ASSISTANT-FEATURES.md)
// Strict rule: textContent only, keyboard navigatable, queries extension
(function () {
	'use strict';

	let targetInput = null;
	let popupNode = null;
	let currentItems = [];
	let selectedIndex = 0;
	let activeQuery = '';
	let atPosition = -1;
	let isEnabled = true;

	function el(tag, className, text) {
		const node = document.createElement(tag);
		if (className) node.className = className;
		if (text !== undefined && text !== null) node.textContent = String(text);
		return node;
	}

	function init(inputElement) {
		targetInput = inputElement;
		popupNode = el('div', 'mentions-popup');
		popupNode.style.display = 'none';
		document.body.append(popupNode);

		targetInput.addEventListener('input', handleInput);
		targetInput.addEventListener('keydown', handleKeyDown);
		document.addEventListener('click', e => {
			if (!popupNode.contains(e.target) && e.target !== targetInput) {
				hidePopup();
			}
		});
	}

	function updateCapabilities(caps) {
		if (caps && caps.mentions !== undefined) {
			isEnabled = Boolean(caps.mentions);
		}
	}

	function handleInput() {
		if (!isEnabled || !targetInput) return;
		const val = targetInput.value;
		const cursor = targetInput.selectionStart;

		// Look backwards from cursor for '@'
		const textBefore = val.slice(0, cursor);
		const lastAt = textBefore.lastIndexOf('@');

		if (lastAt >= 0 && (lastAt === 0 || /\s/.test(textBefore[lastAt - 1]))) {
			const query = textBefore.slice(lastAt + 1);
			if (!query.includes(' ') && !query.includes('\n')) {
				atPosition = lastAt;
				activeQuery = query;
				window.vscode?.postMessage({ type: 'mention.query', text: query });
				return;
			}
		}
		hidePopup();
	}

	function handleKeyDown(e) {
		if (popupNode.style.display === 'none' || currentItems.length === 0) return;

		if (e.key === 'ArrowDown') {
			e.preventDefault();
			selectedIndex = (selectedIndex + 1) % currentItems.length;
			renderList();
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			selectedIndex = (selectedIndex - 1 + currentItems.length) % currentItems.length;
			renderList();
		} else if (e.key === 'Enter' || e.key === 'Tab') {
			e.preventDefault();
			selectItem(currentItems[selectedIndex]);
		} else if (e.key === 'Escape') {
			hidePopup();
		}
	}

	function setSuggestions(data) {
		if (!data || !Array.isArray(data.items) || atPosition < 0) {
			hidePopup();
			return;
		}

		currentItems = data.items;
		selectedIndex = 0;
		if (currentItems.length === 0) {
			hidePopup();
			return;
		}

		positionPopup();
		renderList();
		popupNode.style.display = 'block';
	}

	function positionPopup() {
		if (!targetInput) return;
		const rect = targetInput.getBoundingClientRect();
		popupNode.style.bottom = `${window.innerHeight - rect.top + 6}px`;
		popupNode.style.left = `${Math.max(12, rect.left)}px`;
		popupNode.style.width = `${Math.min(340, rect.width)}px`;
	}

	function renderList() {
		popupNode.replaceChildren();

		const head = el('div', 'mentions-header');
		head.append(el('span', 'mentions-title mono', `@${activeQuery || 'files'}`), el('span', 'muted small', '↑↓ to navigate, ↵ to pick'));
		popupNode.append(head);

		const list = el('div', 'mentions-list');
		currentItems.forEach((item, idx) => {
			const row = el('div', `mentions-item ${idx === selectedIndex ? 'selected' : ''}`);

			const iconSpan = el('span', 'mentions-icon');
			if (item.kind === 'folder') iconSpan.textContent = '📁';
			else if (item.kind === 'diff') iconSpan.textContent = '🔀';
			else iconSpan.textContent = '📄';

			const textCol = el('div', 'mentions-text-col');
			textCol.append(
				el('div', 'mentions-label ellipsis', item.label || item.path),
				el('div', 'mentions-path muted ellipsis mono', item.path)
			);

			row.append(iconSpan, textCol);
			row.addEventListener('click', () => selectItem(item));
			list.append(row);
		});

		popupNode.append(list);
	}

	function selectItem(item) {
		if (!targetInput || atPosition < 0 || !item) return;
		const val = targetInput.value;
		const cursor = targetInput.selectionStart;

		const before = val.slice(0, atPosition);
		const after = val.slice(cursor);
		const insertText = `@${item.path} `;

		targetInput.value = before + insertText + after;
		const newPos = before.length + insertText.length;
		targetInput.setSelectionRange(newPos, newPos);
		targetInput.focus();
		hidePopup();
	}

	function hidePopup() {
		atPosition = -1;
		currentItems = [];
		if (popupNode) popupNode.style.display = 'none';
	}

	window.YanaMentions = {
		init,
		updateCapabilities,
		setSuggestions
	};
})();
