// Tab "Mô hình & Điều phối": model đang dùng, Local AI trên máy, Yana runtime, thư viện provider, luồng phụ trợ.
// Đa ngôn ngữ (Tiếng Việt, English, 한국어). DOM chỉ dựng bằng textContent/createElementNS.
(function () {
	const { el, button, badge, card, notice, request, load } = window.YanaUI;
	window.YanaSettingsTabs = window.YanaSettingsTabs || {};
	let localBox;
	let library;

	const M_I18N = {
		vi: {
			activeTitle: 'Mô hình đang hoạt động',
			activeSub: 'Đồng bộ danh mục với yana-rt; mỗi nhà cung cấp lưu khóa an toàn trong Keychain.',
			provider: 'Nhà cung cấp AI',
			endpoint: 'Điểm cuối (Endpoint)',
			endpointHint: 'Nhà cung cấp chính thức dùng endpoint cố định. Custom chấp nhận HTTPS hoặc HTTP loopback.',
			modelId: 'Mã mô hình (Model ID)',
			modelIdHint: 'Để trống để dùng mô hình mặc định của nhà cung cấp.',
			save: 'Lưu thay đổi',
			savedNotice: 'Đã lưu. Lượt trò chuyện tiếp theo sẽ sử dụng mô hình này.',
			fetchLive: 'Lấy danh mục mới',
			apiKey: 'Khóa API',
			needsKeyNotice: '{0} cần có khóa API trước khi bạn có thể chat hoặc lấy danh mục mô hình.',
			localTitle: 'AI cục bộ trên máy này',
			localSub: 'Tìm kiếm 9Router, Ollama, LM Studio, llama.cpp, TurboFieldfare trên loopback.',
			scanLocal: 'Quét AI cục bộ',
			scanning: 'Đang quét…',
			runtimeTitle: 'Yana Runtime',
			runtimeSub: 'IDE gọi trực tiếp file thực thi yana-rt nhị phân, không qua gateway trung gian.',
			chooseRuntime: 'Chọn yana-rt',
			runtimeNotFound: 'Không tìm thấy yana-rt',
			missing: 'Thiếu',
			runtimeDesc: 'Ranh giới thẩm quyền: Chat → TurnEngine → RuntimeAuthority → Giám thị (Supervisor). Terminal luôn là shell riêng của bạn, không bao giờ là lối tắt thực thi ngầm của AI.',
			providerLib: 'Thư viện nhà cung cấp',
			providerLibSub: '41 nhà cung cấp chính thức từ catalog Rust yana-rt • Cloud, Local & Specialized Gateway.',
			filterPlaceholder: 'Lọc theo tên catalog, model hoặc khả năng (vision, reasoning, cheap…)',
			use: 'Dùng',
			changeKey: 'Đổi khóa',
			addKey: 'Thêm khóa',
			removeKey: 'Xóa khóa',
			tokenTelemetry: 'Đo lường mức dùng Token',
			tokenSub: 'Token thực tế được ghi nhận sau mỗi lượt chat qua yana-rt.',
			totalTokens: '{0} Tổng số token đã ghi nhận',
			tokenDetails: '{0} đầu vào · {1} đầu ra · {2} lượt chat',
			viewBreakdown: 'Xem chi tiết mức dùng',
			noTelemetry: 'Chưa ghi nhận dữ liệu sử dụng token',
			telemetryExplain: 'Yana ghi nhận lượng token thực tế từ các nhà cung cấp sau mỗi lượt phản hồi.',
			openChat: 'Mở khung Chat',
			keySaved: 'Đã lưu khóa',
			needsKey: 'Cần khóa',
			noKeyNeeded: 'Không cần khóa',
			catAll: 'Tất cả (41)',
			catCloud: 'Cloud LLM (18)',
			catLocal: 'Local / On-device (7)',
			catRouter: 'Open-source Router (10)',
			catEnterprise: 'Doanh nghiệp (6)',
		},
		ko: {
			activeTitle: '활성 모델',
			activeSub: 'yana-rt와 동일한 카탈로그. 각 공급자는 자체 키를 키체인에 안전하게 보관합니다.',
			provider: 'AI 공급자',
			endpoint: '엔드포인트 (Endpoint)',
			endpointHint: '공식 공급자는 고정 엔드포인트를 사용합니다. Custom은 HTTPS 또는 루프백 HTTP만 허용됩니다.',
			modelId: '모델 ID (Model ID)',
			modelIdHint: '공급자 기본값을 사용하려면 비워 두십시오.',
			save: '저장',
			savedNotice: '저장되었습니다. 다음 채팅에서 이 모델이 사용됩니다.',
			fetchLive: '실시간 목록 가져오기',
			apiKey: 'API 키',
			needsKeyNotice: '{0} 모델과 대화하거나 목록을 가져오려면 API 키가 필요합니다.',
			localTitle: '이 컴퓨터의 로컬 AI',
			localSub: '루프백에서 9Router, Ollama, LM Studio, llama.cpp, TurboFieldfare 등을 검색합니다.',
			scanLocal: '로컬 검색',
			scanning: '검색 중…',
			runtimeTitle: 'Yana 런타임',
			runtimeSub: 'IDE는 게이트웨이 없이 yana-rt 바이너리를 직접 호출합니다.',
			chooseRuntime: 'yana-rt 선택',
			runtimeNotFound: 'yana-rt를 찾을 수 없음',
			missing: '누락됨',
			runtimeDesc: '권한 경계: Chat → TurnEngine → RuntimeAuthority → Supervisor (giamthi). 터미널은 자체 셸로 유지되며 AI의 실행 경로가 아닙니다.',
			providerLib: '공급자 라이브러리',
			providerLibSub: 'Rust yana-rt 카탈로그의 41개 공식 공급자 • Cloud, Local & Specialized Gateway.',
			filterPlaceholder: '카탈로그 이름, 모델 또는 기능(vision, reasoning, cheap…)으로 필터링',
			use: '사용',
			changeKey: '키 변경',
			addKey: '키 추가',
			removeKey: '키 삭제',
			tokenTelemetry: '토큰 원격 측정',
			tokenSub: 'yana-rt를 통해 IDE에서 활성 공급자 라운드에서 기록된 토큰.',
			totalTokens: '총 {0}개 토큰 기록됨',
			tokenDetails: '{0} 입력 · {1} 출력 · {2} 모델 라운드',
			viewBreakdown: '사용량 내역 보기',
			noTelemetry: '아직 기록된 토큰 원격 측정이 없습니다',
			telemetryExplain: 'Yana는 각 채팅 턴 후 모델 공급자가 반환한 실제 토큰을 기록합니다.',
			openChat: '채팅 열기',
			keySaved: '키 저장됨',
			needsKey: '키 필요',
			noKeyNeeded: '키 불필요',
			catAll: '전체 (41)',
			catCloud: 'Cloud LLM (18)',
			catLocal: 'Local / 온디바이스 (7)',
			catRouter: '오픈소스 라우터 (10)',
			catEnterprise: '엔터프라이즈 (6)',
		},
		en: {
			activeTitle: 'Active model',
			activeSub: 'Same catalog as yana-rt; each provider keeps its own key in the Keychain.',
			provider: 'AI Provider',
			endpoint: 'Endpoint',
			endpointHint: 'Official providers use a fixed endpoint. Custom accepts HTTPS, or HTTP on loopback only.',
			modelId: 'Model ID',
			modelIdHint: 'Leave empty to use the provider default.',
			save: 'Save',
			savedNotice: 'Saved. The next chat turn uses this model.',
			fetchLive: 'Fetch live list',
			apiKey: 'API key',
			needsKeyNotice: '{0} needs an API key before you can chat or fetch its models.',
			localTitle: 'Local AI on this machine',
			localSub: 'Looks for 9Router, Ollama, LM Studio, llama.cpp, TurboFieldfare and AirLLM on loopback.',
			scanLocal: 'Scan local',
			scanning: 'Scanning…',
			runtimeTitle: 'Yana runtime',
			runtimeSub: 'The IDE calls the yana-rt binary directly, with no gateway.',
			chooseRuntime: 'Choose yana-rt',
			runtimeNotFound: 'yana-rt not found',
			missing: 'Missing',
			runtimeDesc: 'Authority boundary: Chat → TurnEngine → RuntimeAuthority → Supervisor (giamthi). The terminal stays your own shell and is never an AI execution path. API keys live in the Keychain through the IDE SecretStorage.',
			providerLib: 'Provider library',
			providerLibSub: '41 official providers from Rust yana-rt catalog • Cloud, Local & Specialized Gateway.',
			filterPlaceholder: 'Filter by catalog name, model or capabilities (vision, reasoning, cheap…)',
			use: 'Use',
			changeKey: 'Change key',
			addKey: 'Add key',
			removeKey: 'Remove key',
			tokenTelemetry: 'Token Telemetry',
			tokenSub: 'Tokens recorded from active provider rounds in the IDE through yana-rt.',
			totalTokens: '{0} Total Tokens Recorded',
			tokenDetails: '{0} input · {1} output · {2} model turns recorded',
			viewBreakdown: 'View Usage Breakdown',
			noTelemetry: 'No token telemetry recorded yet',
			telemetryExplain: 'Yana records actual tokens returned by model providers after each chat turn.',
			openChat: 'Open Chat',
			keySaved: 'Key saved',
			needsKey: 'Needs key',
			noKeyNeeded: 'No key needed',
			catAll: 'All (41)',
			catCloud: 'Cloud LLM (18)',
			catLocal: 'Local / On-device (7)',
			catRouter: 'Open-source Router (10)',
			catEnterprise: 'Enterprise (6)',
		}
	};

	function tm(key, ...args) {
		const lang = window.YanaUI.currentLang || 'en';
		const dict = M_I18N[lang] || M_I18N.en;
		let val = dict[key] || M_I18N.en[key] || key;
		for (let i = 0; i < args.length; i++) {
			val = val.replace(`{${i}}`, args[i]);
		}
		return val;
	}

	function keyBadge(provider) {
		if (!provider.requiresKey && provider.id !== 'custom') return badge(tm('noKeyNeeded'), 'info');
		return provider.keyed ? badge(tm('keySaved'), 'ok') : badge(tm('needsKey'));
	}

	function activeCard(data) {
		const { active, providers } = data;
		const current = providers.find(p => p.id === active.provider) || providers[0];
		const node = card(tm('activeTitle'), tm('activeSub'),
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
			status.replaceChildren(p.requiresKey && !p.keyed ? notice(tm('needsKeyNotice', p.label)) : el('span'));
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
			button(tm('save'), 'primary', async () => {
				if (select.value === 'custom') {
					const saved = await request('setBaseUrl', { value: endpoint.value });
					if (!saved.ok) return status.replaceChildren(notice(saved.error, true));
				}
				const result = await request('setActive', { provider: select.value, model: modelInput.value });
				status.replaceChildren(result.ok ? notice(tm('savedNotice')) : notice(result.error, true));
			}),
			button(tm('fetchLive'), '', async () => {
				const result = await request('syncModels', { provider: select.value });
				if (!result.ok) return status.replaceChildren(notice(result.error, true));
				synced.replaceChildren(...(result.result || []).map(id => {
					const chip = el('button', 'chip', id);
					chip.type = 'button';
					chip.addEventListener('click', () => { modelInput.value = id; });
					return chip;
				}));
			}),
			button(tm('apiKey'), '', () => request('setKey', { provider: select.value })),
		);
		node.append(field(tm('provider'), select), field(tm('endpoint'), endpoint, tm('endpointHint')),
			field(tm('modelId'), modelInput, tm('modelIdHint')), suggestions, synced, actions, status);
		return node;
	}

	function localCard() {
		const node = card(tm('localTitle'), tm('localSub'),
			button(tm('scanLocal'), '', async () => { localBox.replaceChildren(el('div', 'loading', tm('scanning'))); load('local'); }));
		localBox = el('div', 'list');
		localBox.append(el('div', 'loading', tm('scanning')));
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
		const node = card(tm('runtimeTitle'), tm('runtimeSub'), button(tm('chooseRuntime'), '', () => request('pickRuntime', {})));
		const path = el('div', 'box spread');
		path.append(el('span', 'mono', runtime.path || tm('runtimeNotFound')), runtime.path ? badge(`v${runtime.version || '?'}`, 'ok') : badge(tm('missing'), 'bad'));
		node.append(path, el('p', 'sub', tm('runtimeDesc')));
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
		actions.append(button(tm('use'), '', () => request('setActive', { provider: p.id, model: '' })));
		if (p.requiresKey || p.id === 'custom') {
			actions.append(button(p.keyed ? tm('changeKey') : tm('addKey'), '', () => request('setKey', { provider: p.id })));
			if (p.keyed) actions.append(button(tm('removeKey'), 'danger', () => request('removeKey', { provider: p.id })));
		}
		node.append(head, foot, actions);
		node.dataset.search = `${p.id} ${p.label} ${p.company} ${p.models.map(m => `${m.id} ${m.tags.join(' ')}`).join(' ')} ${p.category || ''}`.toLowerCase();
		node.dataset.kind = p.kind;
		node.dataset.category = p.category || (p.kind === 'local' ? 'local' : p.kind === 'cloud' ? 'cloud' : 'enterprise');
		return node;
	}

	function libraryCard(providers) {
		const kinds = [
			['all', tm('catAll')],
			['cloud', tm('catCloud')],
			['local', tm('catLocal')],
			['router', tm('catRouter')],
			['enterprise', tm('catEnterprise')]
		];
		const node = el('section', 'section');
		const head = el('div', 'spread');
		const titles = el('div');
		const countHeader = badge(`${providers.length} TOTAL PROVIDERS`, 'info');
		titles.append(el('h2', '', tm('providerLib')), el('p', 'sub', tm('providerLibSub')));
		head.append(titles, countHeader);
		const search = el('input');
		search.type = 'search';
		search.placeholder = tm('filterPlaceholder');
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

	function tokenUsageCard(usage) {
		const node = card(tm('tokenTelemetry'), tm('tokenSub'));
		const row = el('div', 'spread');
		const left = el('div');
		if (usage?.all?.rounds) {
			const num = window.YanaUI.number;
			const title = el('div', '', tm('totalTokens', num(usage.all.total)));
			title.style.fontWeight = '600';
			title.style.fontSize = '14px';
			left.append(
				title,
				el('div', 'muted', tm('tokenDetails', num(usage.all.input), num(usage.all.output), num(usage.all.rounds)))
			);
			const btn = button(tm('viewBreakdown'), 'primary', () => window.YanaUI.select('usage'));
			row.append(left, btn);
		} else {
			left.append(
				el('div', '', tm('noTelemetry')),
				el('div', 'muted', tm('telemetryExplain'))
			);
			const btn = button(tm('openChat'), '', () => request('openChat', {}));
			row.append(left, btn);
		}
		node.append(row);
		return node;
	}

	window.YanaSettingsTabs.models = data => {
		const cards = [];
		cards.push(tokenUsageCard(data.tokenUsage));

		const top = el('div', 'grid2');
		top.append(activeCard(data), localCard());
		cards.push(top, runtimeCard(data.runtime), libraryCard(data.providers));
		return cards;
	};
})();
