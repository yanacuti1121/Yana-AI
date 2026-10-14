// Tab "Mô hình & Điều phối": model đang dùng, Local AI trên máy, Yana runtime, thư viện provider, luồng phụ trợ.
(function () {
	const { el, button, badge, card, notice, request, load } = window.YanaUI;
	window.YanaSettingsTabs = window.YanaSettingsTabs || {};
	let localBox;
	let library;

	function keyBadge(provider) {
		if (!provider.requiresKey && provider.id !== 'custom') return badge('No key needed', 'info');
		return provider.keyed ? badge('Key saved', 'ok') : badge('Needs key');
	}

	function activeCard(data) {
		const { active, providers } = data;
		const current = providers.find(p => p.id === active.provider) || providers[0];
		const node = card('Active model', 'Same catalog as yana-rt; each provider keeps its own key in the Keychain.',
			badge(current.kind === 'cloud' ? 'Cloud' : current.kind === 'custom' ? 'Custom' : 'Local', 'info'));
		const select = el('select');
		for (const p of providers) {
			const option = el('option', '', `${p.label} · ${p.kind === 'cloud' ? p.company : 'On-device'}`);
			option.value = p.id;
			option.selected = p.id === current.id;
			select.append(option);
		}
		const endpoint = el('input');
		endpoint.type = 'text';
		const modelInput = el('input');
		modelInput.type = 'text';
		modelInput.value = active.provider === current.id ? active.model : '';
		const suggestions = el('div', 'chips');
		const status = el('div');
		const fill = () => {
			const p = providers.find(entry => entry.id === select.value);
			endpoint.value = p.id === 'custom' ? active.baseUrl : p.baseUrl || '(fixed provider endpoint)';
			endpoint.disabled = p.id !== 'custom';
			modelInput.placeholder = p.defaultModel || 'model ID';
			suggestions.replaceChildren(...p.models.map(m => {
				const chip = el('button', 'chip', `${m.label} · ${m.context}`);
				chip.type = 'button';
				chip.title = m.id;
				chip.addEventListener('click', () => { modelInput.value = m.id; });
				return chip;
			}));
			status.replaceChildren(p.requiresKey && !p.keyed ? notice(`${p.label} needs an API key before you can chat or fetch its models.`) : el('span'));
		};
		select.addEventListener('change', () => { modelInput.value = ''; fill(); });
		fill();
		const field = (label, input, hint) => {
			const wrap = el('label', 'field', label);
			wrap.append(input);
			if (hint) wrap.append(el('span', 'muted', hint));
			return wrap;
		};
		const synced = el('div', 'chips');
		const actions = el('div', 'row');
		actions.append(
			button('Save', 'primary', async () => {
				if (select.value === 'custom') {
					const saved = await request('setBaseUrl', { value: endpoint.value });
					if (!saved.ok) return status.replaceChildren(notice(saved.error, true));
				}
				const result = await request('setActive', { provider: select.value, model: modelInput.value });
				status.replaceChildren(result.ok ? notice('Saved. The next chat turn uses this model.') : notice(result.error, true));
			}),
			button('Fetch live list', '', async () => {
				const result = await request('syncModels', { provider: select.value });
				if (!result.ok) return status.replaceChildren(notice(result.error, true));
				synced.replaceChildren(...(result.result || []).map(id => {
					const chip = el('button', 'chip', id);
					chip.type = 'button';
					chip.addEventListener('click', () => { modelInput.value = id; });
					return chip;
				}));
			}),
			button('API key', '', () => request('setKey', { provider: select.value })),
		);
		node.append(field('Provider', select), field('Endpoint', endpoint, 'Official providers use a fixed endpoint. Custom accepts HTTPS, or HTTP on loopback only.'),
			field('Model ID', modelInput, 'Leave empty to use the provider default.'), suggestions, synced, actions, status);
		return node;
	}

	function localCard() {
		const node = card('Local AI on this machine', 'Looks for 9Router, Ollama, LM Studio, llama.cpp, TurboFieldfare and AirLLM on loopback.',
			button('Scan local', '', async () => { localBox.replaceChildren(el('div', 'loading', 'Scanning…')); load('local'); }));
		localBox = el('div', 'list');
		localBox.append(el('div', 'loading', 'Scanning…'));
		node.append(localBox);
		load('local');
		return node;
	}

	window.YanaSettingsTabs.renderLocal = payload => {
		if (!localBox) return;
		const entries = payload?.local || [];
		localBox.replaceChildren(...entries.map(entry => {
			const item = el('div', 'item');
			const text = el('div');
			text.append(el('div', '', entry.name),
				el('div', 'mono muted', entry.status === 'ready' ? `${entry.endpoint} · ${entry.models.length} models · ${entry.latencyMs} ms` : `${entry.endpoint} · not responding`));
			item.append(text, entry.status === 'ready' ? badge('Running', 'ok') : badge('Offline'));
			return item;
		}));
	};

	function runtimeCard(runtime) {
		const node = card('Yana runtime', 'The IDE calls the yana-rt binary directly, with no gateway.', button('Choose yana-rt', '', () => request('pickRuntime', {})));
		const path = el('div', 'box spread');
		path.append(el('span', 'mono', runtime.path || 'yana-rt not found'), runtime.path ? badge(`v${runtime.version || '?'}`, 'ok') : badge('Missing', 'bad'));
		node.append(path, el('p', 'sub', 'Authority boundary: Chat → TurnEngine → RuntimeAuthority → Supervisor (giamthi). The terminal stays your own shell and is never an AI execution path. API keys live in the Keychain through the IDE SecretStorage.'));
		return node;
	}

	function providerCard(p) {
		const node = el('div', p.keyed ? 'card active' : 'card');
		const head = el('div', 'card-head');
		const titles = el('div');
		titles.append(el('h3', '', p.label), el('div', 'muted', p.company));
		head.append(titles, keyBadge(p));
		const foot = el('div', 'provider-foot mono');
		const tagsText = (p.models[0]?.tags || []).slice(0, 2).join(' · ') || p.badge || p.defaultModel || 'any model';
		const modelsCountText = p.modelsSummary || `${p.models.length} models`;
		foot.append(el('span', '', tagsText), el('span', '', modelsCountText));
		const actions = el('div', 'row');
		actions.append(button('Use', '', () => request('setActive', { provider: p.id, model: '' })));
		if (p.requiresKey || p.id === 'custom') {
			actions.append(button(p.keyed ? 'Change key' : 'Add key', '', () => request('setKey', { provider: p.id })));
			if (p.keyed) actions.append(button('Remove key', 'danger', () => request('removeKey', { provider: p.id })));
		}
		node.append(head, foot, actions);
		node.dataset.search = `${p.id} ${p.label} ${p.company} ${p.models.map(m => `${m.id} ${m.tags.join(' ')}`).join(' ')} ${p.category || ''}`.toLowerCase();
		node.dataset.kind = p.kind;
		node.dataset.category = p.category || (p.kind === 'local' ? 'local' : p.kind === 'cloud' ? 'cloud' : 'enterprise');
		return node;
	}

	function libraryCard(providers) {
		const kinds = [
			['all', 'Tất cả (41)'],
			['cloud', 'Cloud LLM (18)'],
			['local', 'Local / On-device (7)'],
			['router', 'Open-source Hosting & Router (10)'],
			['enterprise', 'Specialized / Enterprise (6)']
		];
		const node = el('section', 'section');
		const head = el('div', 'spread');
		const titles = el('div');
		const countHeader = badge(`${providers.length} TOTAL PROVIDERS LOADED (Cloud, Local & Inference Gateways)`, 'info');
		titles.append(el('h2', '', 'Provider library'), el('p', 'sub', '41 provider chính thức từ catalog Rust yana-rt • Cloud, Local & Specialized Gateway.'));
		head.append(titles, countHeader);
		const search = el('input');
		search.type = 'search';
		search.placeholder = 'Lọc theo tên catalog, model hoặc khả năng (vision, reasoning, cheap…)';
		const chips = el('div', 'chips');
		library = el('div', 'grid3');
		library.append(...providers.map(providerCard));
		let currentCat = 'all';
		const apply = () => {
			const query = search.value.trim().toLowerCase();
			for (const cardNode of library.children) {
				const matchesCat = currentCat === 'all' || cardNode.dataset.category === currentCat || (currentCat === 'cloud' && cardNode.dataset.kind === 'cloud') || (currentCat === 'local' && cardNode.dataset.kind === 'local');
				const matchesSearch = !query || cardNode.dataset.search.includes(query);
				cardNode.hidden = !(matchesCat && matchesSearch);
			}
		};
		for (const [id, label] of kinds) {
			const chip = el('button', id === currentCat ? 'chip active' : 'chip', label);
			chip.type = 'button';
			chip.addEventListener('click', () => {
				currentCat = id;
				for (const other of chips.children) other.classList.toggle('active', other === chip);
				apply();
			});
			chips.append(chip);
		}
		search.addEventListener('input', apply);
		node.append(head, search, chips, library);
		return node;
	}

	function auxiliaryCard(flows) {
		const node = card('Auxiliary models', `Nothing in Yana calls these ${flows.length} flows yet. Shown as a roadmap, with no placeholder settings.`);
		const list = el('div', 'list');
		list.append(...flows.map(flow => {
			const item = el('div', 'item');
			const text = el('div');
			text.append(el('div', '', flow.name), el('div', 'muted', `Not implemented: ${flow.reason}`));
			item.append(text, badge('Unavailable'));
			return item;
		}));
		node.append(list);
		return node;
	}

	window.YanaSettingsTabs.models = data => {
		const top = el('div', 'grid2');
		top.append(activeCard(data), localCard());
		return [top, runtimeCard(data.runtime), libraryCard(data.providers)];
	};
})();
