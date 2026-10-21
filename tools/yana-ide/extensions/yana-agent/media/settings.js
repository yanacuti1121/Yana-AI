// Khung trang Yana Settings: Bố cục 2 cột hiện đại (Sidebar trái + Canvas nội dung phải).
// DOM chỉ dựng bằng textContent/createElementNS, không innerHTML. Renderer từng tab nằm trong settings-tabs.js.
(function () {
	const vscode = acquireVsCodeApi();
	const TAB_KEYS = ['account', 'general', 'appearance', 'models', 'usage', 'customizations', 'browser', 'tab', 'editor', 'permissions', 'tools', 'commands', 'data'];

	const DICT = {
		vi: {
			'Settings': 'Cài đặt',
			'Workspaces': 'Không gian làm việc',
			'Shortcuts': 'Phím tắt bàn phím',
			'Provide Feedback': 'Gửi phản hồi',
			'Refresh': 'Làm mới',
			'Loading…': 'Đang tải…',
			'tab.account.nav': 'Tài khoản',
			'tab.account.title': 'Tài khoản & Không gian',
			'tab.account.sub': 'Quản lý danh tính cục bộ, khóa API và kết nối thư mục dự án.',
			'tab.general.nav': 'Cài đặt chung',
			'tab.general.title': 'Cài đặt chung',
			'tab.general.sub': 'Cấu hình ngôn ngữ hiển thị, hành vi biên tập, tự động lưu và đo từ xa.',
			'tab.appearance.nav': 'Giao diện',
			'tab.appearance.title': 'Giao diện & Chủ đề',
			'tab.appearance.sub': 'Chủ đề màu sắc buồng lái, độ tương phản và phông chữ.',
			'tab.models.nav': 'Mô hình & Mức sử dụng',
			'tab.models.title': 'Mô hình & Mức sử dụng',
			'tab.models.sub': 'Quản lý hạn ngạch mô hình AI, nhà cung cấp và token.',
			'tab.usage.nav': 'Mức dùng Token',
			'tab.usage.title': 'Chi tiết mức sử dụng Token',
			'tab.usage.sub': 'Thống kê lượng token do nhà cung cấp báo về qua yana-rt sau mỗi lượt trao đổi trong IDE.',
			'tab.usage.back': '← Quay lại Mô hình',
			'tab.customizations.nav': 'Tùy biến & Quy tắc',
			'tab.customizations.title': 'Tùy biến & Quy tắc',
			'tab.customizations.sub': 'Quy tắc hệ thống, kỹ năng kỹ thuật và hướng dẫn vận hành Agent.',
			'tab.browser.nav': 'Trình duyệt',
			'tab.browser.title': 'Trình duyệt tích hợp',
			'tab.browser.sub': 'Xem trước web trong trình soạn thảo và công cụ gỡ lỗi DevTools.',
			'tab.tab.nav': 'Gợi ý Tab',
			'tab.tab.title': 'Tab Gợi ý mã',
			'tab.tab.sub': 'Tự động hoàn thành mã nội dòng và gợi ý khi gõ phím.',
			'tab.editor.nav': 'Soạn thảo & Diff',
			'tab.editor.title': 'Trình soạn thảo & Diff',
			'tab.editor.sub': 'Định dạng mã khi lưu, thuật toán diff và rào chắn an toàn khi sửa mã.',
			'tab.permissions.nav': 'Quyền hạn & Leases',
			'tab.permissions.title': 'Quyền hạn & Leases',
			'tab.permissions.sub': 'Các phê duyệt thao tác đang chờ và giấy phép năng lực cấp cho Agent.',
			'tab.tools.nav': 'Công cụ ngoài & MCP',
			'tab.tools.title': 'Công cụ ngoài & MCP',
			'tab.tools.sub': 'Công cụ cục bộ trên máy, máy chủ MCP và môi trường thực thi nền.',
			'tab.commands.nav': 'Lệnh hệ thống',
			'tab.commands.title': 'Lệnh hệ thống Yana',
			'tab.commands.sub': 'Tra cứu nhanh và thực thi các lệnh hệ thống Yana trong terminal.',
			'tab.data.nav': 'Dữ liệu & Riêng tư',
			'tab.data.title': 'Quyền riêng tư & Dữ liệu',
			'tab.data.sub': 'Bộ lưu trữ cục bộ, bộ nhớ đệm phiên và kích thước bộ nhớ dự án.',
		},
		ko: {
			'Settings': '설정',
			'Workspaces': '작업 영역',
			'Shortcuts': '키보드 바로 가기',
			'Provide Feedback': '피드백 제공',
			'Refresh': '새로 고침',
			'Loading…': '로드 중…',
			'tab.account.nav': '계정',
			'tab.account.title': '계정 및 작업 영역',
			'tab.account.sub': '로컬 신원, API 키 및 작업 영역 연결을 관리합니다.',
			'tab.general.nav': '일반 설정',
			'tab.general.title': '일반 설정',
			'tab.general.sub': '표시 언어, 편집기 핵심 동작 및 자동 저장 구성.',
			'tab.appearance.nav': '모양',
			'tab.appearance.title': '모양 및 테마',
			'tab.appearance.sub': '조종석 색상 테마, 대비 팔레트 및 타이포그래피.',
			'tab.models.nav': '모델 및 사용량',
			'tab.models.title': '모델 및 사용량',
			'tab.models.sub': 'AI 모델 할당량, 제공자 및 토큰 사용량을 관리합니다.',
			'tab.usage.nav': '토큰 사용량',
			'tab.usage.title': '토큰 사용량 세부 정보',
			'tab.usage.sub': 'IDE에서 각 채팅 턴 후 yana-rt를 통해 제공자가 보고한 토큰 통계입니다.',
			'tab.usage.back': '← 모델로 돌아가기',
			'tab.customizations.nav': '사용자 지정',
			'tab.customizations.title': '사용자 지정 및 규칙',
			'tab.customizations.sub': '시스템 규칙, 엔지니어링 기술 및 Agent 운영 가이드라인.',
			'tab.browser.nav': '브라우저',
			'tab.browser.title': '통합 브라우저',
			'tab.browser.sub': '편집기 내 웹 미리보기 및 개발자 도구 디버깅.',
			'tab.tab.nav': 'Tab 완성',
			'tab.tab.title': 'Tab 인라인 제안',
			'tab.tab.sub': '인라인 코드 완성 및 타이핑 제안 트리거.',
			'tab.editor.nav': '편집기 및 Diff',
			'tab.editor.title': '편집기 및 Diff',
			'tab.editor.sub': '저장 시 서식 지정, 고급 diff 알고리즘 및 코드 편집 보호.',
			'tab.permissions.nav': '권한 및 임대',
			'tab.permissions.title': '권한 및 기능 임대',
			'tab.permissions.sub': '대기 중인 작업 승인 및 Agent에 부여된 기능 임대.',
			'tab.tools.nav': '외부 도구 & MCP',
			'tab.tools.title': '외부 도구 및 MCP',
			'tab.tools.sub': '로컬 CLI 도구, MCP 서버 및 백그라운드 런타임.',
			'tab.commands.nav': '시스템 명령',
			'tab.commands.title': '시스템 명령',
			'tab.commands.sub': '터미널에서 Yana 시스템 명령을 빠르게 조회하고 실행합니다.',
			'tab.data.nav': '개인정보 & 데이터',
			'tab.data.title': '개인정보 및 데이터',
			'tab.data.sub': '로컬 스토리지, 세션 캐시 및 프로젝트 메모리 공간.',
		},
		en: {
			'Settings': 'Settings',
			'Workspaces': 'Workspaces',
			'Shortcuts': 'Shortcuts',
			'Provide Feedback': 'Provide Feedback',
			'Refresh': 'Refresh',
			'Loading…': 'Loading…',
			'tab.account.nav': 'Account',
			'tab.account.title': 'Account & Workspace',
			'tab.account.sub': 'Manage your identity, API keys, and workspace connection.',
			'tab.general.nav': 'General',
			'tab.general.title': 'General',
			'tab.general.sub': 'Core editor behavior, workspace auto-save, and telemetry preferences.',
			'tab.appearance.nav': 'Appearance',
			'tab.appearance.title': 'Appearance',
			'tab.appearance.sub': 'Visual theme, contrast palettes, and typography.',
			'tab.models.nav': 'Models & Usage',
			'tab.models.title': 'Models & Usage',
			'tab.models.sub': 'Manage your model quota, credits, and providers.',
			'tab.usage.nav': 'Token Usage',
			'tab.usage.title': 'Token Usage Breakdown',
			'tab.usage.sub': 'Tokens reported by the provider through yana-rt, recorded after each chat turn in the IDE.',
			'tab.usage.back': '← Back to Models',
			'tab.customizations.nav': 'Customizations',
			'tab.customizations.title': 'Customizations',
			'tab.customizations.sub': 'System rules, engineering skills, and AI operational guidelines.',
			'tab.browser.nav': 'Browser',
			'tab.browser.title': 'Browser',
			'tab.browser.sub': 'In-editor web preview, developer tools, and external browsing.',
			'tab.tab.nav': 'Tab',
			'tab.tab.title': 'Tab',
			'tab.tab.sub': 'Tab inline completions, autocomplete suggestions, and triggers.',
			'tab.editor.nav': 'Editor & Diff',
			'tab.editor.title': 'Editor & Diff',
			'tab.editor.sub': 'Text editor formatting, advanced diff view, and agent code editing guardrails.',
			'tab.permissions.nav': 'Permissions',
			'tab.permissions.title': 'Permissions',
			'tab.permissions.sub': 'Pending action approvals and capability leases.',
			'tab.tools.nav': 'External Tools',
			'tab.tools.title': 'External Tools',
			'tab.tools.sub': 'External tools, MCP servers, and background runtimes.',
			'tab.commands.nav': 'Commands',
			'tab.commands.title': 'Commands',
			'tab.commands.sub': 'Quick reference and execution for Yana system commands.',
			'tab.data.nav': 'Privacy & Data',
			'tab.data.title': 'Privacy & Data',
			'tab.data.sub': 'Local storage, session cache, and project memory footprint.',
		}
	};

	let currentLang = 'en';

	function t(key, fallback) {
		const langDict = DICT[currentLang] || DICT.en;
		if (langDict && langDict[key] !== undefined) return langDict[key];
		if (DICT.en && DICT.en[key] !== undefined) return DICT.en[key];
		return fallback !== undefined ? fallback : key;
	}

	const app = document.getElementById('app');
	const pending = new Map();
	let current = 'models';
	let requestSeq = 0;
	let workspacesListEl;
	let lastWorkspaces = [];

	function el(tag, cls, text) {
		const node = document.createElement(tag);
		if (cls) node.className = cls;
		if (text !== undefined && text !== null) node.textContent = String(text);
		return node;
	}

	function button(label, cls, onClick) {
		const node = el('button', `btn ${cls || ''}`.trim(), label);
		node.type = 'button';
		node.addEventListener('click', async () => {
			node.disabled = true;
			try {
				await onClick();
			} finally {
				node.disabled = false;
			}
		});
		return node;
	}

	function badge(text, tone) {
		return el('span', `badge ${tone || ''}`.trim(), text);
	}

	function card(title, sub, extra) {
		const node = el('section', 'card');
		const head = el('div', 'card-head');
		const titles = el('div');
		titles.append(el('h3', '', title));
		if (sub) titles.append(el('p', 'sub', sub));
		head.append(titles);
		if (extra) head.append(extra);
		node.append(head);
		return node;
	}

	function notice(text, isError) {
		return el('div', isError ? 'notice error' : 'notice', text);
	}

	function number(value) {
		const loc = currentLang === 'vi' ? 'vi-VN' : currentLang === 'ko' ? 'ko-KR' : 'en-US';
		return new Intl.NumberFormat(loc).format(value || 0);
	}

	function bytes(value) {
		if (!value) return '0 B';
		const units = ['B', 'KB', 'MB', 'GB'];
		const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
		const loc = currentLang === 'vi' ? 'vi-VN' : currentLang === 'ko' ? 'ko-KR' : 'en-US';
		return `${new Intl.NumberFormat(loc, { maximumFractionDigits: 1 }).format(value / 1024 ** index)} ${units[index]}`;
	}

	function toggle(checked, onChange) {
		const label = el('label', 'toggle-switch');
		const input = el('input');
		input.type = 'checkbox';
		input.checked = Boolean(checked);
		const slider = el('span', 'toggle-slider');
		input.addEventListener('change', () => onChange(input.checked));
		label.append(input, slider);
		return label;
	}

	function gauge(percent) {
		const wrap = el('div', 'gauge-wrap');
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('viewBox', '0 0 48 48');
		svg.setAttribute('class', 'gauge-svg');

		const bg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
		bg.setAttribute('cx', '24');
		bg.setAttribute('cy', '24');
		bg.setAttribute('r', '20');
		bg.setAttribute('class', 'gauge-bg');

		const val = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
		val.setAttribute('cx', '24');
		val.setAttribute('cy', '24');
		val.setAttribute('r', '20');
		val.setAttribute('class', 'gauge-val');
		val.setAttribute('transform', 'rotate(-90 24 24)');
		const circumference = 2 * Math.PI * 20;
		const pct = Math.max(0, Math.min(100, Number(percent) || 0));
		const strokeLength = ((pct / 100) * circumference).toFixed(2);
		val.setAttribute('stroke-dasharray', `${strokeLength} ${circumference.toFixed(2)}`);
		val.setAttribute('stroke-dashoffset', '0');

		if (pct < 30) val.style.stroke = 'var(--y-bad)';
		else if (pct < 60) val.style.stroke = 'var(--y-warn)';
		else val.style.stroke = 'var(--y-ok)';

		svg.append(bg, val);
		const text = el('span', 'gauge-text', `${percent}%`);
		wrap.append(svg, text);
		return wrap;
	}

	function request(type, payload) {
		const requestId = ++requestSeq;
		vscode.postMessage({ type, requestId, ...payload });
		return new Promise(resolve => pending.set(requestId, resolve));
	}

	function load(tab) {
		vscode.postMessage({ type: 'load', tab });
	}

	const body = el('div', 'section');
	const headerTitle = el('h2', '', '');
	const headerSub = el('p', 'sub', '');
	const headerActions = el('div', 'header-actions');

	function updateWorkspaces(workspaces) {
		if (Array.isArray(workspaces)) lastWorkspaces = workspaces;
		if (!workspacesListEl) return;
		workspacesListEl.replaceChildren(...lastWorkspaces.map(ws => {
			const item = el('div', 'nav-item', ws.name || ws.path);
			item.style.fontSize = '12px';
			item.style.color = 'var(--y-muted)';
			item.title = ws.path;
			return item;
		}));
	}

	function renderShell() {
		const shell = el('div', 'settings-shell');
		const sidebar = el('aside', 'sidebar');

		// Settings Nav Group
		const group = el('div', 'sidebar-section');
		group.append(el('div', 'sidebar-title', t('Settings')));
		for (const id of TAB_KEYS) {
			const btn = el('button', `nav-item ${id === current ? 'active' : ''}`.trim(), t(`tab.${id}.nav`, id));
			btn.type = 'button';
			btn.dataset.tab = id;
			btn.addEventListener('click', () => select(id));
			group.append(btn);
		}
		sidebar.append(group);

		// Workspaces section
		const wsSection = el('div', 'sidebar-section');
		wsSection.append(el('div', 'sidebar-title', t('Workspaces')));
		workspacesListEl = el('div', 'sidebar-section');
		wsSection.append(workspacesListEl);
		sidebar.append(wsSection);
		updateWorkspaces(lastWorkspaces);

		sidebar.append(el('div', 'sidebar-spacer'));

		// Footer links
		const footer = el('div', 'sidebar-footer');
		const btnShortcuts = el('button', 'footer-link', t('Shortcuts'));
		btnShortcuts.type = 'button';
		btnShortcuts.addEventListener('click', () => request('openShortcuts', {}));

		const btnFeedback = el('button', 'footer-link', t('Provide Feedback'));
		btnFeedback.type = 'button';
		btnFeedback.addEventListener('click', () => request('provideFeedback', {}));

		footer.append(btnShortcuts, btnFeedback);
		sidebar.append(footer);

		// Main canvas
		const main = el('main', 'main-content');
		const head = el('header', 'main-head');
		const headText = el('div');
		headText.append(headerTitle, headerSub);
		head.append(headText, headerActions);

		main.append(head, body);
		shell.append(sidebar, main);
		app.replaceChildren(shell);

		updateHeader();
	}

	function updateHeader() {
		headerTitle.textContent = t(`tab.${current}.title`, current);
		headerSub.textContent = t(`tab.${current}.sub`, '');
		const refreshBtn = button(t('Refresh'), '', () => load(current));
		if (current === 'usage') {
			const backBtn = button(t('tab.usage.back', '← Back to Models'), '', () => select('models'));
			headerActions.replaceChildren(backBtn, refreshBtn);
		} else {
			headerActions.replaceChildren(refreshBtn);
		}
	}

	function select(tab) {
		current = TAB_KEYS.includes(tab) ? tab : 'models';
		updateHeader();

		const navItems = document.querySelectorAll('.nav-item[data-tab]');
		for (const node of navItems) {
			const active = node.dataset.tab === current;
			node.classList.toggle('active', active);
		}

		body.replaceChildren(el('div', 'loading', t('Loading…')));
		const main = document.querySelector('.main-content');
		if (main) main.scrollTop = 0;
		load(current);
	}

	function setLang(newLang) {
		if (['vi', 'en', 'ko'].includes(newLang) && newLang !== currentLang) {
			currentLang = newLang;
			renderShell();
			load(current);
		}
	}

	window.addEventListener('message', ({ data }) => {
		if (data?.type === 'init') {
			if (data.language) currentLang = data.language;
			renderShell();
			select(data.tab || current);
		} else if (data?.type === 'languageChanged') {
			if (data.language) setLang(data.language);
		} else if (data?.type === 'select') {
			select(data.tab);
		} else if (data?.type === 'refresh') {
			load(current);
		} else if (data?.type === 'result') {
			pending.get(data.requestId)?.(data);
			pending.delete(data.requestId);
		} else if (data?.type === 'data') {
			if (data.payload?.currentLanguage && data.payload.currentLanguage !== currentLang) {
				currentLang = data.payload.currentLanguage;
				renderShell();
			}
			if (data.payload?.workspaces) updateWorkspaces(data.payload.workspaces);
			if (data.tab === current || data.tab === 'local') {
				if (data.tab === 'local') {
					if (typeof window.YanaSettingsTabs?.renderLocal === 'function') {
						window.YanaSettingsTabs.renderLocal(data.payload);
					}
				} else if (TAB_KEYS.includes(data.tab) && Object.prototype.hasOwnProperty.call(window.YanaSettingsTabs || {}, data.tab)) {
					const renderer = window.YanaSettingsTabs[data.tab];
					if (data.payload?.error) {
						body.replaceChildren(notice(`Could not load data: ${data.payload.error}`, true));
						return;
					}
					if (typeof renderer === 'function') {
						body.replaceChildren(...[].concat(renderer(data.payload)));
					}
				}
			}
		}
	});

	window.YanaUI = {
		el, button, badge, card, notice, number, bytes, toggle, gauge, request, load, select, t,
		get currentLang() { return currentLang; },
		set currentLang(val) { setLang(val); }
	};
	renderShell();
	vscode.postMessage({ type: 'ready' });
})();
