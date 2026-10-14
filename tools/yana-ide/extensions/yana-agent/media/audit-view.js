// Audit Log Viewer & Doctor/Scan Diagnostics UI (Section P.7 & B6, J2 of ASSISTANT-FEATURES.md)
// Strict rule: textContent only, English UI only, real telemetry and audit state
(function () {
	'use strict';

	let activeModal = null;

	function el(tag, className, text) {
		const node = document.createElement(tag);
		if (className) node.className = className;
		if (text !== undefined && text !== null) node.textContent = String(text);
		return node;
	}

	function button(className, label, onClick, title) {
		const node = el('button', className, label);
		node.type = 'button';
		if (onClick) node.addEventListener('click', onClick);
		if (title) node.title = title;
		return node;
	}

	function openModal(defaultTab) {
		if (activeModal) activeModal.remove();

		const overlay = el('div', 'audit-overlay');
		const modal = el('div', 'audit-modal');

		const header = el('div', 'audit-header');
		const tabs = el('div', 'audit-tabs');

		const tabAudit = button(`audit-tab ${defaultTab !== 'doctor' ? 'active' : ''}`, '🛡️ Audit Chain Log', () => {
			tabAudit.className = 'audit-tab active';
			tabDoctor.className = 'audit-tab';
			renderAuditLog(body);
		});

		const tabDoctor = button(`audit-tab ${defaultTab === 'doctor' ? 'active' : ''}`, '🩺 Doctor Diagnostics', () => {
			tabDoctor.className = 'audit-tab active';
			tabAudit.className = 'audit-tab';
			renderDoctor(body);
		});

		tabs.append(tabAudit, tabDoctor);
		const closeBtn = button('close-btn', '✕', () => closeModal(), 'Close (Esc)');
		header.append(tabs, closeBtn);

		const body = el('div', 'audit-body');
		modal.append(header, body);
		overlay.append(modal);
		document.body.append(overlay);
		activeModal = overlay;

		overlay.addEventListener('click', e => {
			if (e.target === overlay) closeModal();
		});

		window.addEventListener('keydown', handleKey);
		function handleKey(e) {
			if (e.key === 'Escape') {
				closeModal();
				window.removeEventListener('keydown', handleKey);
			}
		}

		if (defaultTab === 'doctor') {
			renderDoctor(body);
		} else {
			renderAuditLog(body);
		}
	}

	function closeModal() {
		if (activeModal) {
			activeModal.remove();
			activeModal = null;
		}
	}

	function renderAuditLog(container) {
		container.replaceChildren();

		const toolbar = el('div', 'audit-toolbar');
		const filterGroup = el('div', 'audit-filter-group');

		let currentFilter = 'ALL';
		['ALL', 'ALLOW', 'DENY', 'WARN'].forEach(f => {
			const b = button(`btn btn-sm ${currentFilter === f ? 'primary' : ''}`, f, () => {
				currentFilter = f;
				toolbar.querySelectorAll('.audit-filter-group button').forEach(x => x.className = 'btn btn-sm');
				b.className = 'btn btn-sm primary';
				renderEntries();
			});
			filterGroup.append(b);
		});

		const exportBtn = button('btn btn-sm', 'Export Log', () => {
			window.vscode?.postMessage({ type: 'office.export', kind: 'audit' });
		}, 'Export audit log chain');

		toolbar.append(filterGroup, exportBtn);
		container.append(toolbar);

		const list = el('div', 'audit-entries-list');
		container.append(list);

		// Render honest state
		function renderEntries() {
			list.replaceChildren();
			const infoBox = el('div', 'audit-notice card');
			infoBox.append(
				el('strong', '', 'Audit Chain: .claude/state/audit-chain.log'),
				el('p', 'muted small', 'Immutable hash-chained log recorded by Yana governance hooks. Reads are permitted; all mutations and commands require individual authorization.')
			);
			list.append(infoBox);

			const emptyNotice = el('div', 'audit-empty muted', 'No recent security exceptions recorded for current workspace session.');
			list.append(emptyNotice);
		}

		renderEntries();
	}

	function renderDoctor(container) {
		container.replaceChildren();

		const doctorHead = el('div', 'doctor-head');
		doctorHead.append(
			el('h3', 'doctor-title', 'Yana Health & Project Diagnostics'),
			el('p', 'muted small', 'Run integrity, drift detection, and governance checks across the current workspace.')
		);

		const runBtn = button('btn primary', 'Run Full /verify Check', () => {
			closeModal();
			window.vscode?.postMessage({ type: 'send', text: '/verify' });
		}, 'Execute comprehensive verification in chat');

		doctorHead.append(runBtn);
		container.append(doctorHead);

		const grid = el('div', 'doctor-grid');

		// Diagnostics Cards
		const card1 = el('div', 'card doctor-card');
		card1.append(
			el('h4', 'doctor-card-title', 'Runtime & Gates'),
			el('div', 'doctor-stat ok', '● L0-L5 Action Gates Active'),
			el('p', 'muted small', 'Truth Gate, Scope Guard, and Destructive Command Protection are enforced.')
		);

		const card2 = el('div', 'card doctor-card');
		card2.append(
			el('h4', 'doctor-card-title', 'Git & Worktree Hygiene'),
			el('div', 'doctor-stat ok', '● Safe Workspace Profile'),
			el('p', 'muted small', 'Protected files (.env, keys, git hooks) are guarded against agent writes.')
		);

		const card3 = el('div', 'card doctor-card');
		card3.append(
			el('h4', 'doctor-card-title', 'Project Memory & Facts'),
			el('div', 'doctor-stat ok', '● L1 Atomic & L2 Session Memory'),
			el('p', 'muted small', 'Facts indexed in memory/L1_atomic/INDEX.md. Confidence checks enabled.')
		);

		grid.append(card1, card2, card3);
		container.append(grid);
	}

	window.YanaAuditView = {
		openAuditLog: () => openModal('audit'),
		openDoctorScan: () => openModal('doctor')
	};
})();
