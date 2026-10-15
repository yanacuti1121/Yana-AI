'use strict';
// Giao diện trang chủ Yana ("Yana Home"). Chỉ dựng DOM bằng textContent (không innerHTML); mọi nút gửi id lệnh cho extension.
// Hỗ trợ đa ngôn ngữ (Tiếng Việt, English, 한국어) & màn hình giới thiệu chào mừng người dùng (First-Launch Onboarding).
(function () {
	const vscode = acquireVsCodeApi();
	const app = document.getElementById('app');

	const I18N = {
		vi: {
			welcome: 'Chào mừng bạn đến với Yana Studio',
			tagline: 'Ý tưởng, thiết kế, lập trình, kiểm thử và bàn giao sản phẩm tại một nơi. Yana thực hiện công việc; bạn phê duyệt từng lệnh hệ thống.',
			onboardingTitle: 'Hệ điều hành Agent AI chạy cục bộ · Riêng tư tuyệt đối',
			onboardingDesc: 'Không cần tài khoản đám mây · Zero telemetry · Mã nguồn và dữ liệu chỉ lưu trên máy bạn.',
			step1Title: '1. Mở thư mục dự án',
			step1Desc: 'Mở codebase của bạn để Yana tìm hiểu cấu trúc dự án.',
			step2Title: '2. Tin cậy thư mục',
			step2Desc: 'Cấp quyền tin cậy để cho phép Agent đọc mã và chạy lệnh an toàn.',
			step3Title: '3. Chọn Model AI',
			step3Desc: 'Dùng Ollama cục bộ miễn phí hoặc nhập API Key cho Claude, GPT-6 Astra, Gemini.',
			openFolder: 'Mở thư mục',
			cloneRepo: 'Clone Repository',
			openRecent: 'Mở gần đây…',
			startHere: 'Tính năng Yana',
			recentWorkspaces: 'Không gian làm việc gần đây',
			noRecent: 'Chưa có thư mục nào gần đây. Hãy mở một thư mục để bắt đầu.',
			runtimeAndLocal: 'Runtime & Mô hình AI',
			safetyPolicy: 'Chính sách an toàn & Giám sát',
			allowed: 'Được phép',
			allowedDesc: 'đọc file, quét mã, kiểm tra trạng thái',
			needsApproval: 'Cần bạn duyệt',
			needsApprovalDesc: 'thực thi bất kỳ lệnh shell/terminal nào',
			policyNote: 'Mọi thao tác can thiệp hệ thống của Yana đều dừng lại xin phép bạn trước.',
			showOnStartup: 'Mở trang này khi khởi động nếu chưa có file nào mở',
			// Cards
			canvasNewTitle: 'Design Canvas',
			canvasNewDesc: 'Mô tả giao diện và AI tự động thiết kế trực quan ngay lập tức',
			chatTitle: 'Chat với Yana AI',
			chatDesc: 'Hỏi đáp hoặc giao task ở panel bên phải. Xem diff code trực quan và duyệt lệnh',
			tasksTitle: 'Bảng công việc (Tasks)',
			tasksDesc: 'Quản lý tác vụ với biểu đồ phụ thuộc (DAG) và bằng chứng xác thực',
			permissionsTitle: 'Quyền hạn & Leases',
			permissionsDesc: 'Kiểm soát quyền hạn, các lệnh chờ duyệt và thời hạn uỷ quyền',
			canvasStudioTitle: 'Trình chỉnh sửa Component',
			canvasStudioDesc: 'Chỉnh sửa giao diện thủ công: 22 thành phần, quản lý layers',
			memoryTitle: 'Bộ nhớ dự án (Memory)',
			memoryDesc: 'Ghi chú, quy tắc và chỉ dẫn được nạp cho mỗi phiên trò chuyện mới',
			guideTitle: 'Sách hướng dẫn sử dụng',
			guideDesc: 'Cẩm nang chi tiết: thiết lập ban đầu, quy trình duyệt lệnh và sửa lỗi',
			settingsTitle: 'Cài đặt Yana Studio',
			settingsDesc: 'Quản lý Model, khóa API, runtime và dung lượng token',
			idePreferencesTitle: 'Cấu hình IDE & Preferences',
			idePreferencesDesc: 'Trợ lý mặc định, quyền hạn và hành vi làm việc',
			controlCenterTitle: 'Trung tâm kiểm soát Yana',
			controlCenterDesc: 'Trạng thái hoạt động: Giám Thị, sandbox, guards và hooks bảo vệ',
			sidebarTitle: 'Cột công cụ Yana',
			sidebarDesc: 'Mở toàn bộ cây công cụ và tính năng ở thanh điều hướng trái',
			runDoctor: 'Chạy Bác Sĩ (Doctor)',
			scanAgent: 'Quét cấu hình Agent',
			huntVulns: 'Quét lỗ hổng bảo mật',
			chooseModel: 'Chọn Model',
			addKey: 'Thêm API Key',
		},
		en: {
			welcome: 'Welcome to Yana Studio',
			tagline: 'Idea, design, code, run, track and ship in one place. Yana does the work; you approve every command.',
			onboardingTitle: 'Local-First AI Agent OS · 100% Private',
			onboardingDesc: 'No cloud account required · Zero telemetry · Your code and data never leave this machine.',
			step1Title: '1. Open Workspace',
			step1Desc: 'Open your codebase folder to let Yana analyze the architecture.',
			step2Title: '2. Trust Workspace',
			step2Desc: 'Grant workspace trust to allow safe code edits and inspected command execution.',
			step3Title: '3. Connect AI Model',
			step3Desc: 'Run free local models via Ollama or bring your own API key for Claude, GPT-6 Astra, or Gemini.',
			openFolder: 'Open Folder',
			cloneRepo: 'Clone Repository',
			openRecent: 'Open Recent…',
			startHere: 'Yana Capabilities',
			recentWorkspaces: 'Recent workspaces',
			noRecent: 'No recent folders yet. Open a folder to start.',
			runtimeAndLocal: 'Runtime and local AI',
			safetyPolicy: 'Safety policy & Supervision',
			allowed: 'Allowed',
			allowedDesc: 'reading files, scans, status checks',
			needsApproval: 'Needs your approval',
			needsApprovalDesc: 'running any command',
			policyNote: 'Anything Yana wants to run stops and asks you first.',
			showOnStartup: 'Show this page when no file is open at startup',
			// Cards
			canvasNewTitle: 'Design Canvas',
			canvasNewDesc: 'Describe a screen and watch the AI build it live, with any model',
			chatTitle: 'Chat with Yana',
			chatDesc: 'Ask or give a task in the right-hand panel. Interactive diffs & approvals',
			tasksTitle: 'Tasks board',
			tasksDesc: 'Tasks with dependencies and evidence',
			permissionsTitle: 'Permissions',
			permissionsDesc: 'Leases, grant authority, pending approvals',
			canvasStudioTitle: 'Component editor',
			canvasStudioDesc: 'Hand-edit a design: 22 components, layers',
			memoryTitle: 'Project Memory',
			memoryDesc: 'Notes and rules sent with every new conversation',
			guideTitle: 'User guide',
			guideDesc: 'Step-by-step manual: first setup, approvals, fixes',
			settingsTitle: 'Settings',
			settingsDesc: 'Models, API keys, runtime, usage',
			idePreferencesTitle: 'Yana IDE settings',
			idePreferencesDesc: 'Guide, approvals, default assistant',
			controlCenterTitle: 'Yana Control Center',
			controlCenterDesc: 'Live status: Giám Thị, guards, sandbox, hooks',
			sidebarTitle: 'All Yana tools',
			sidebarDesc: 'Open the Yana column on the left',
			runDoctor: 'Run Doctor',
			scanAgent: 'Scan agent setup',
			huntVulns: 'Hunt vulnerabilities',
			chooseModel: 'Choose model',
			addKey: 'Add API key',
		},
		ko: {
			welcome: '야나 스튜디오에 오신 것을 환영합니다',
			tagline: '아이디어, 디자인, 코딩, 실행, 추적 및 배포를 한 곳에서. 야나가 작업하고, 사용자가 모든 명령을 승인합니다.',
			onboardingTitle: '로컬 우선 AI 에이전트 OS · 100% 비공개 및 프라이버시',
			onboardingDesc: '클라우드 계정 불필요 · 원격 측정 제로 · 코드와 데이터는 기기 외부로 전송되지 않습니다.',
			step1Title: '1. 프로젝트 폴더 열기',
			step1Desc: '코드베이스를 열어 야나가 프로젝트 구조를 파악할 수 있도록 합니다.',
			step2Title: '2. 작업 영역 신뢰',
			step2Desc: '안전한 코드 검토 및 제어된 명령 실행을 위해 폴더를 신뢰합니다.',
			step3Title: '3. AI 모델 연결',
			step3Desc: '무료 로컬 Ollama 모델을 사용하거나 Claude, GPT-6 Astra, Gemini API 키를 등록합니다.',
			openFolder: '폴더 열기',
			cloneRepo: '저장소 복제',
			openRecent: '최근 항목 열기…',
			startHere: '야나 주요 기능',
			recentWorkspaces: '최근 작업 영역',
			noRecent: '최근 폴더가 없습니다. 폴더를 열어 시작하세요.',
			runtimeAndLocal: '런타임 및 로컬 AI',
			safetyPolicy: '보안 정책 및 감독',
			allowed: '허용됨',
			allowedDesc: '파일 읽기, 코드 검사, 상태 확인',
			needsApproval: '사용자 승인 필요',
			needsApprovalDesc: '모든 시스템/터미널 명령 실행',
			policyNote: '야나가 실행하려는 모든 명령은 사전에 사용자의 승인을 받습니다.',
			showOnStartup: '시작 시 열려 있는 파일이 없으면 이 페이지 표시',
			// Cards
			canvasNewTitle: '디자인 캔버스',
			canvasNewDesc: '화면을 설명하면 AI가 즉시 시각적으로 빌드합니다',
			chatTitle: '야나 AI와 대화',
			chatDesc: '오른쪽 패널에서 질문하거나 작업을 요청하세요. 실시간 diff 및 명령 승인',
			tasksTitle: '작업 보드 (Tasks)',
			tasksDesc: '의존성 및 증거 데이터가 포함된 태스크 관리',
			permissionsTitle: '권한 및 리스',
			permissionsDesc: '권한 부여, 대기 중인 승인 및 유효 기간 관리',
			canvasStudioTitle: '컴포넌트 에디터',
			canvasStudioDesc: '수동 디자인 편집: 22개 컴포넌트 및 레이어 관리',
			memoryTitle: '프로젝트 메모리',
			memoryDesc: '새 대화마다 자동으로 전달되는 규칙과 메모',
			guideTitle: '사용자 가이드',
			guideDesc: '단계별 매뉴얼: 초기 설정, 명령 승인 및 문제 해결',
			settingsTitle: '야나 스튜디오 설정',
			settingsDesc: '모델, API 키, 런타임 및 토큰 사용량 관리',
			idePreferencesTitle: 'IDE 환경설정',
			idePreferencesDesc: '기본 어시스턴트, 권한 및 동작 설정',
			controlCenterTitle: '야나 제어 센터',
			controlCenterDesc: '실시간 상태: 감시자, 샌드박스, 보호 가드 및 훅',
			sidebarTitle: '모든 야나 도구',
			sidebarDesc: '왼쪽 사이드바에서 전체 도구 탐색',
			runDoctor: '닥터 진단 실행',
			scanAgent: '에이전트 구성 검사',
			huntVulns: '취약점 탐지',
			chooseModel: '모델 선택',
			addKey: 'API 키 등록',
		}
	};

	let currentLang = 'en';

	function t(key) {
		const dict = I18N[currentLang] || I18N.en;
		return dict[key] || I18N.en[key] || key;
	}

	function el(tag, cls, text) {
		const node = document.createElement(tag);
		if (cls) node.className = cls;
		if (text !== undefined) node.textContent = text;
		return node;
	}
	function run(id) { vscode.postMessage({ type: 'run', id }); }
	function action(label, id, cls) {
		const button = el('button', cls || 'btn', label);
		button.addEventListener('click', () => run(id));
		return button;
	}
	const CARD_ICONS = {
		canvasNew: "🎨",
		chat: "💬",
		tasks: "📋",
		permissions: "🛡️",
		canvasStudio: "📐",
		memory: "🧠",
		guide: "📖",
		settings: "⚙️",
		idePreferences: "🎛️",
		controlCenter: "🚀",
		sidebar: "📑"
	};
	function card(title, note, id, primary) {
		const node = el('button', 'card' + (primary ? ' primary' : ''));
		const head = el('div', 'card-header-row');
		head.append(el('span', 'card-icon', CARD_ICONS[id] || "✨"), el('span', 'card-title', title));
		node.append(head, el('span', 'card-note', note));
		node.addEventListener('click', () => run(id));
		return node;
	}
	function section(title, ...children) {
		const node = el('section', 'section');
		node.append(el('h2', null, title), ...children);
		return node;
	}
	function row(label, value, tone) {
		const node = el('div', 'row');
		node.append(el('span', 'row-label', label), el('span', 'row-value' + (tone ? ` ${tone}` : ''), value));
		return node;
	}

	function languageBar() {
		const bar = el('div', 'lang-bar');
		const label = el('span', 'lang-label', 'Language / 언어 / Ngôn ngữ:');
		bar.append(label);

		const languages = [
			{ code: 'vi', label: '🇻🇳 Tiếng Việt' },
			{ code: 'en', label: '🇺🇸 English' },
			{ code: 'ko', label: '🇰🇷 한국어' },
		];

		for (const l of languages) {
			const btn = el('button', 'lang-pill' + (currentLang === l.code ? ' active' : ''), l.label);
			btn.addEventListener('click', () => {
				currentLang = l.code;
				vscode.postMessage({ type: 'setLanguage', lang: l.code });
			});
			bar.append(btn);
		}
		return bar;
	}

	function onboardingBanner() {
		const banner = el('div', 'onboarding-banner');
		const head = el('div', 'onboarding-head');
		head.append(
			el('div', 'onboarding-title', t('onboardingTitle')),
			el('div', 'onboarding-desc', t('onboardingDesc'))
		);
		banner.append(head);

		const steps = el('div', 'onboarding-steps');
		const stepItems = [
			{ title: t('step1Title'), desc: t('step1Desc'), action: 'openFolder' },
			{ title: t('step2Title'), desc: t('step2Desc'), action: 'permissions' },
			{ title: t('step3Title'), desc: t('step3Desc'), action: 'pickModel' },
		];
		for (const s of stepItems) {
			const col = el('div', 'onboarding-step');
			col.append(el('div', 'step-title', s.title), el('div', 'step-desc', s.desc));
			col.addEventListener('click', () => run(s.action));
			steps.append(col);
		}
		banner.append(steps);
		return banner;
	}

	function hero() {
		const node = el('header', 'hero');
		const logo = el('img', 'emblem');
		logo.src = document.body.dataset.emblem;
		logo.alt = '';
		const actions = el('div', 'hero-actions');
		actions.append(
			action(t('openFolder'), 'openFolder', 'btn primary'),
			action(t('cloneRepo'), 'clone'),
			action(t('openRecent'), 'recent')
		);
		node.append(
			logo,
			el('h1', null, t('welcome')),
			el('p', 'tagline', t('tagline')),
			actions
		);
		return node;
	}

	function features() {
		const grid = el('div', 'grid');
		grid.append(
			card(t('canvasNewTitle'), t('canvasNewDesc'), 'canvasNew', true),
			card(t('chatTitle'), t('chatDesc'), 'chat', true),
			card(t('tasksTitle'), t('tasksDesc'), 'tasks'),
			card(t('permissionsTitle'), t('permissionsDesc'), 'permissions'),
			card(t('canvasStudioTitle'), t('canvasStudioDesc'), 'canvasStudio'),
			card(t('memoryTitle'), t('memoryDesc'), 'memory'),
			card(t('guideTitle'), t('guideDesc'), 'guide', true),
			card(t('settingsTitle'), t('settingsDesc'), 'settings'),
			card(t('idePreferencesTitle'), t('idePreferencesDesc'), 'idePreferences'),
			card(t('controlCenterTitle'), t('controlCenterDesc'), 'controlCenter', true),
			card(t('sidebarTitle'), t('sidebarDesc'), 'sidebar'),
		);
		return section(t('startHere'), grid);
	}

	function recent(status) {
		const list = el('div', 'list');
		if (!status.recent.length) list.append(el('p', 'muted', t('noRecent')));
		for (const entry of status.recent) {
			const item = el('button', 'recent');
			item.append(el('span', 'recent-name', entry.name), el('span', 'recent-path', entry.path));
			item.addEventListener('click', () => vscode.postMessage({ type: 'openFolder', path: entry.path }));
			list.append(item);
		}
		return section(t('recentWorkspaces'), list);
	}

	function health(status) {
		const box = el('div', 'list');
		box.append(row('Yana runtime', status.runtime.found ? `yana-rt ${status.runtime.version}` : 'not found', status.runtime.found ? 'ok' : 'bad'));
		const keyNote = status.model.keyed === null ? 'no key needed' : status.model.keyed ? 'key saved' : 'no key yet';
		box.append(row('Chat model', `${status.model.provider} · ${status.model.model} · ${keyNote}`, status.model.keyed === false ? 'bad' : ''));
		for (const entry of status.local) {
			box.append(row(entry.name, entry.ready ? `ready · ${entry.models} models` : 'not running', entry.ready ? 'ok' : 'muted'));
		}
		const buttons = el('div', 'inline');
		buttons.append(action(t('chooseModel'), 'pickModel'), action(t('addKey'), 'setKey'));
		box.append(buttons);
		return section(t('runtimeAndLocal'), box);
	}

	function policy() {
		const node = el('div', 'list');
		node.append(
			row(t('allowed'), t('allowedDesc')),
			row(t('needsApproval'), t('needsApprovalDesc')),
			el('p', 'muted', t('policyNote'))
		);
		const buttons = el('div', 'inline');
		buttons.append(action(t('runDoctor'), 'doctor'), action(t('scanAgent'), 'scan'), action(t('huntVulns'), 'hunt'));
		node.append(buttons);
		return section(t('safetyPolicy'), node);
	}

	function footer() {
		const label = el('label', 'startup');
		const box = el('input');
		box.type = 'checkbox';
		box.checked = true;
		box.addEventListener('change', () => vscode.postMessage({ type: 'showOnStartup', value: box.checked }));
		label.append(box, el('span', null, t('showOnStartup')));
		return label;
	}

	function render(status) {
		if (status.language) {
			const langCode = String(status.language).toLowerCase();
			if (langCode.startsWith('vi')) currentLang = 'vi';
			else if (langCode.startsWith('ko')) currentLang = 'ko';
			else currentLang = 'en';
		}
		const columns = el('div', 'columns');
		const left = el('div', 'col');
		const right = el('div', 'col');
		left.append(features(), recent(status));
		right.append(health(status), policy());
		columns.append(left, right);
		app.replaceChildren(languageBar(), onboardingBanner(), hero(), columns, footer());
	}

	window.addEventListener('message', ({ data }) => {
		if (data?.type === 'status') render(data.status);
	});
	app.replaceChildren(el('p', 'muted center', 'Loading…'));
	vscode.postMessage({ type: 'ready' });
})();
