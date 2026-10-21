// Assistant Profiles Manager (Section L of ASSISTANT-FEATURES.md)
// Strict rule: textContent only, English UI only, disabled controls indicate "Not available yet"
(function () {
	'use strict';

	let capabilities = {
		modes: false,
		reasoningEffort: false,
		temperature: false,
		maxTokens: false,
		toolAllowlist: false,
		voice: { input: false, output: false }
	};

	let assistantList = [];
	let selectedAssistantId = '';
	let currentProviderCatalog = [];
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

	function updateCapabilities(caps) {
		if (!caps) return;
		capabilities = Object.assign({}, capabilities, caps);
	}

	function setAssistantsData(items, selectedId) {
		if (Array.isArray(items)) {
			assistantList = items;
		}
		if (selectedId !== undefined) {
			selectedAssistantId = selectedId;
		}
		updateSelectorUI();
		if (activeModal) {
			renderProfileList();
		}
	}

	function getSelectedAssistant() {
		return assistantList.find(a => a.id === selectedAssistantId) || null;
	}

	// Assistant selector chip in composer / header
	let selectorNode = null;
	function createSelectorElement() {
		selectorNode = el('div', 'assistant-chip');
		selectorNode.title = 'Current Assistant Profile (Click to manage)';
		selectorNode.addEventListener('click', () => openAssistantManager());
		updateSelectorUI();
		return selectorNode;
	}

	function updateSelectorUI() {
		if (!selectorNode) return;
		const cur = getSelectedAssistant();
		const name = cur ? cur.name : 'Default Assistant';
		selectorNode.replaceChildren();
		selectorNode.append(
			el('span', 'assistant-chip-icon', '🤖'),
			el('span', 'assistant-chip-name', name)
		);
	}

	// Open the Assistant Management Modal
	function openAssistantManager() {
		if (activeModal) {
			activeModal.remove();
		}

		const overlay = el('div', 'assistants-overlay');
		const modal = el('div', 'assistants-modal');

		const header = el('div', 'assistants-header');
		const titleCol = el('div', 'assistants-title-col');
		titleCol.append(
			el('h2', 'assistants-title', 'Assistant Profiles'),
			el('p', 'assistants-subtitle', 'Configure custom agent personalities, system instructions, and provider defaults.')
		);

		const closeBtn = button('close-btn', '✕', () => closeModal(), 'Close (Esc)');
		header.append(titleCol, closeBtn);

		const body = el('div', 'assistants-body');
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

		renderProfileList();
	}

	function closeModal() {
		if (activeModal) {
			activeModal.remove();
			activeModal = null;
		}
	}

	function renderProfileList() {
		if (!activeModal) return;
		const body = activeModal.querySelector('.assistants-body');
		body.replaceChildren();

		const topBar = el('div', 'assistants-top-bar');
		const countLabel = el('span', 'assistants-count muted', `${assistantList.length} of 30 profiles`);
		const newBtn = button('btn primary', '+ Create Assistant', () => renderProfileForm(null), 'Create a new assistant profile');
		topBar.append(countLabel, newBtn);
		body.append(topBar);

		if (assistantList.length === 0) {
			const emptyBox = el('div', 'assistants-empty');
			emptyBox.append(
				el('div', 'empty-icon', '🤖'),
				el('h3', 'empty-heading', 'No custom assistant profiles'),
				el('p', 'muted', 'Create a profile to customize model instructions, behavior, and provider settings.')
			);
			body.append(emptyBox);
			return;
		}

		const grid = el('div', 'assistants-grid');
		assistantList.forEach(item => {
			const card = el('div', `assistant-card ${item.id === selectedAssistantId ? 'active' : ''}`);

			const cardHead = el('div', 'assistant-card-head');
			const titleWrap = el('div', 'assistant-card-title-wrap');
			const nameRow = el('div', 'assistant-card-name-row');
			nameRow.append(el('strong', 'assistant-card-name', item.name));
			if (item.id === selectedAssistantId) {
				nameRow.append(el('span', 'badge ok mono', 'Active'));
			}
			titleWrap.append(nameRow);
			if (item.description) {
				titleWrap.append(el('p', 'assistant-card-desc muted', item.description));
			}

			const metaRow = el('div', 'assistant-card-meta mono');
			metaRow.append(
				el('span', 'model-chip', `${item.provider || 'default'} · ${item.model || 'auto'}`)
			);
			if (item.mode && capabilities.modes) {
				metaRow.append(el('span', 'mode-chip', item.mode));
			}
			cardHead.append(titleWrap, metaRow);

			if (item.instructions) {
				const instrPreview = el('div', 'assistant-instr-preview muted', item.instructions.slice(0, 140) + (item.instructions.length > 140 ? '…' : ''));
				card.append(cardHead, instrPreview);
			} else {
				card.append(cardHead);
			}

			const actions = el('div', 'assistant-card-actions');
			if (item.id !== selectedAssistantId) {
				actions.append(button('btn btn-sm primary', 'Select', () => {
					window.vscode?.postMessage({ type: 'assistants.select', id: item.id });
					selectedAssistantId = item.id;
					updateSelectorUI();
					renderProfileList();
				}, 'Use this assistant in the chat'));
			}

			actions.append(
				button('btn btn-sm', 'Edit', () => renderProfileForm(item), 'Edit configuration'),
				button('btn btn-sm', 'Duplicate', () => duplicateProfile(item), 'Duplicate this profile'),
				button('btn btn-sm danger', 'Delete', () => deleteProfile(item.id), 'Delete profile')
			);

			card.append(actions);
			grid.append(card);
		});

		body.append(grid);
	}

	function duplicateProfile(item) {
		const copy = Object.assign({}, item, {
			id: 'ast_' + Math.random().toString(36).substring(2, 10),
			name: `${item.name} (Copy)`
		});
		window.vscode?.postMessage({ type: 'assistants.save', assistant: copy });
	}

	function deleteProfile(id) {
		if (confirm('Are you sure you want to delete this assistant profile?')) {
			window.vscode?.postMessage({ type: 'assistants.delete', id });
		}
	}

	function renderProfileForm(editingItem) {
		if (!activeModal) return;
		const body = activeModal.querySelector('.assistants-body');
		body.replaceChildren();

		const isNew = !editingItem;
		const draft = Object.assign({
			id: editingItem?.id || ('ast_' + Math.random().toString(36).substring(2, 10)),
			name: '',
			description: '',
			provider: 'anthropic',
			model: 'claude-3-5-sonnet-20241022',
			mode: 'act',
			params: { reasoningEffort: null, temperature: null, maxTokens: null },
			instructions: '',
			tools: { write: true, run: true },
			voice: { input: 'off', output: 'off' }
		}, editingItem || {});

		const form = el('div', 'assistant-form');

		// Header
		const formTitle = el('h3', 'form-title', isNew ? 'Create New Assistant Profile' : `Edit: ${draft.name}`);
		form.append(formTitle);

		// Name & Description
		const nameGroup = el('div', 'form-group');
		nameGroup.append(el('label', 'form-label', 'Profile Name *'));
		const nameInput = el('input', 'form-input');
		nameInput.placeholder = 'e.g. Senior Security Reviewer';
		nameInput.maxLength = 60;
		nameInput.value = draft.name;
		nameGroup.append(nameInput);
		form.append(nameGroup);

		const descGroup = el('div', 'form-group');
		descGroup.append(el('label', 'form-label', 'Description'));
		const descInput = el('input', 'form-input');
		descInput.placeholder = 'Brief summary of persona or purpose';
		descInput.maxLength = 120;
		descInput.value = draft.description;
		descGroup.append(descInput);
		form.append(descGroup);

		// Provider & Model
		const modelRow = el('div', 'form-row');
		const provCol = el('div', 'form-col');
		provCol.append(el('label', 'form-label', 'Provider'));
		const provSelect = el('select', 'form-select');
		['anthropic', 'openai', 'ollama', 'gemini', 'openrouter', 'custom'].forEach(p => {
			const opt = el('option', '', p);
			opt.value = p;
			if (draft.provider === p) opt.selected = true;
			provSelect.append(opt);
		});
		provCol.append(provSelect);

		const modCol = el('div', 'form-col');
		modCol.append(el('label', 'form-label', 'Model ID'));
		const modInput = el('input', 'form-input mono');
		modInput.value = draft.model;
		modInput.placeholder = 'e.g. claude-3-5-sonnet-20241022';
		modCol.append(modInput);
		modelRow.append(provCol, modCol);
		form.append(modelRow);

		// System Instructions (Appended to AGENTS.md / system prompt)
		const instrGroup = el('div', 'form-group');
		const instrHeader = el('div', 'form-label-row');
		instrHeader.append(
			el('label', 'form-label', 'Custom Instructions (Appended to System Prompt)'),
			el('span', 'char-count muted mono', `${draft.instructions.length}/8000`)
		);
		const instrArea = el('textarea', 'form-textarea mono');
		instrArea.rows = 5;
		instrArea.maxLength = 8000;
		instrArea.value = draft.instructions;
		instrArea.placeholder = 'Specific persona constraints, tone, or project instructions appended to system prompt...';
		instrArea.addEventListener('input', () => {
			instrHeader.querySelector('.char-count').textContent = `${instrArea.value.length}/8000`;
		});
		const cacheNotice = el('div', 'notice-banner muted', 'Note: Instructions take effect when starting a new conversation to maintain prompt caching.');
		instrGroup.append(instrHeader, instrArea, cacheNotice);
		form.append(instrGroup);

		// Advanced Parameters (Governed by capabilities flag)
		const advSection = el('div', 'form-advanced-section');
		advSection.append(el('h4', 'form-section-title', 'Runtime Controls & Execution Modes'));

		// Mode (Plan / Act / Careful)
		const modeRow = el('div', 'form-group');
		modeRow.append(
			el('label', 'form-label', 'Execution Mode'),
			el('span', 'muted small', 'Plan = read-only analysis; Act = standard supervised; Careful = step-by-step confirmation')
		);
		const modeSelect = el('select', 'form-select');
		['act', 'plan', 'careful'].forEach(m => {
			const opt = el('option', '', m);
			opt.value = m;
			if (draft.mode === m) opt.selected = true;
			modeSelect.append(opt);
		});
		if (!capabilities.modes) {
			modeSelect.disabled = true;
			modeRow.append(modeSelect, el('span', 'badge warn mono', 'Not available yet (requires yana-rt mode flag)'));
		} else {
			modeRow.append(modeSelect);
		}
		advSection.append(modeRow);

		// Reasoning Effort & Max Tokens
		const paramRow = el('div', 'form-row');

		const reasonCol = el('div', 'form-col');
		reasonCol.append(el('label', 'form-label', 'Reasoning Effort'));
		const reasonSelect = el('select', 'form-select');
		['default', 'low', 'medium', 'high'].forEach(r => {
			const opt = el('option', '', r);
			opt.value = r;
			reasonSelect.append(opt);
		});
		if (!capabilities.reasoningEffort) {
			reasonSelect.disabled = true;
			reasonCol.append(reasonSelect, el('span', 'badge warn mono', 'Not available yet'));
		} else {
			reasonCol.append(reasonSelect);
		}

		const tokensCol = el('div', 'form-col');
		tokensCol.append(el('label', 'form-label', 'Max Tokens Output'));
		const tokensInput = el('input', 'form-input');
		tokensInput.type = 'number';
		tokensInput.value = '4096';
		if (!capabilities.maxTokens) {
			tokensInput.disabled = true;
			tokensCol.append(tokensInput, el('span', 'badge warn mono', 'Not available yet (fixed at 4,096 in Claude runtime)'));
		} else {
			tokensCol.append(tokensInput);
		}

		paramRow.append(reasonCol, tokensCol);
		advSection.append(paramRow);

		// Tools Allowlist
		const toolsGroup = el('div', 'form-group');
		toolsGroup.append(el('label', 'form-label', 'Tool Permissions'));
		const toolsRow = el('div', 'checkbox-row');
		const writeCheck = el('input');
		writeCheck.type = 'checkbox';
		writeCheck.checked = true;
		const runCheck = el('input');
		runCheck.type = 'checkbox';
		runCheck.checked = true;
		if (!capabilities.toolAllowlist) {
			writeCheck.disabled = true;
			runCheck.disabled = true;
			toolsRow.append(
				el('label', 'muted', 'Write Files: Enabled (Supervised)'),
				el('label', 'muted', 'Run Commands: Enabled (Supervised)'),
				el('span', 'badge warn mono', 'Per-turn tool filters not available yet')
			);
		}
		toolsGroup.append(toolsRow);
		advSection.append(toolsGroup);

		form.append(advSection);

		// Action Buttons
		const btnRow = el('div', 'form-actions-row');
		const saveBtn = button('btn primary', 'Save Profile', () => {
			const nameVal = nameInput.value.trim();
			if (!nameVal) {
				alert('Please enter an assistant name.');
				nameInput.focus();
				return;
			}
			draft.name = nameVal;
			draft.description = descInput.value.trim();
			draft.provider = provSelect.value;
			draft.model = modInput.value.trim();
			draft.instructions = instrArea.value;
			if (capabilities.modes) draft.mode = modeSelect.value;

			window.vscode?.postMessage({
				type: 'assistants.save',
				assistant: draft
			});

			// If it was editing the active one, update chip immediately
			if (draft.id === selectedAssistantId) {
				updateSelectorUI();
			}

			renderProfileList();
		}, 'Save this assistant profile');

		const cancelBtn = button('btn', 'Cancel', () => renderProfileList(), 'Discard changes');
		btnRow.append(saveBtn, cancelBtn);
		form.append(btnRow);

		body.append(form);
	}

	window.YanaAssistants = {
		createSelectorElement,
		openAssistantManager,
		updateCapabilities,
		setAssistantsData,
		getSelectedAssistant
	};
})();
