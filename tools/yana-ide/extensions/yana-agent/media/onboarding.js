'use strict';
// Giao diện Hướng dẫn mở đầu Yana Studio (First-Launch Onboarding Walkthrough).
(function () {
	const vscode = acquireVsCodeApi();
	const app = document.getElementById('app');
	const emblemUri = document.body.dataset.emblem || '';
	const logoUri = document.body.dataset.logo || '';

	let currentStep = 1;
	const TOTAL_STEPS = 4;

	let state = {
		language: 'vi',
		mode: 'supervised',
		provider: 'ollama',
		model: ''
	};

	const I18N = {
		vi: {
			skip: 'Bỏ qua',
			back: '← Quay lại',
			next: 'Tiếp tục →',
			startNow: '🚀 Bắt đầu sử dụng Yana Studio',
			step1Nav: 'Giới thiệu',
			step2Nav: 'Chế độ Agent',
			step3Nav: 'Mô hình AI',
			step4Nav: 'Bắt đầu',
			// Step 1
			welcomeTitle: 'Chào mừng bạn đến với Yana Studio',
			welcomeDesc: 'Hệ điều hành Agent AI đầu tiên chạy cục bộ. Lập trình, thiết kế giao diện, kiểm thử và bàn giao sản phẩm với quyền riêng tư tối đa.',
			selectLanguage: 'Chọn ngôn ngữ giao diện:',
			feature1Title: '100% Riêng tư & Cục bộ',
			feature1Desc: 'Không cần tài khoản đám mây, Zero Telemetry. Mã nguồn và dữ liệu chỉ lưu trữ trên máy tính của bạn.',
			feature2Title: 'Bạn hoàn toàn kiểm soát',
			feature2Desc: 'Mọi thao tác sửa file, thực thi lệnh shell, hoặc kết nối mạng đều được dừng lại xin bạn phê duyệt.',
			// Step 2
			modeTitle: 'Chọn Chế độ Vận hành cho Agent',
			modeDesc: 'Bạn muốn Yana AI hỗ trợ theo phong cách nào? Bạn có thể thay đổi bất kỳ lúc nào tại thanh tác vụ phía dưới.',
			modeSupervisedTitle: 'Chế độ Giám thị',
			modeSupervisedBadge: 'Khuyên dùng',
			modeSupervisedDesc: 'Agent đọc mã và lên kế hoạch tự động; mọi lệnh terminal và sửa file đều cần bạn bấm duyệt.',
			modePlanTitle: 'Chế độ Lập kế hoạch',
			modePlanBadge: 'Chỉ đọc',
			modePlanDesc: 'Chỉ tư vấn, phân tích mã nguồn và thiết kế kiến trúc. Khóa toàn bộ quyền sửa file và chạy lệnh.',
			modeAutoTitle: 'Chế độ Tự chủ',
			modeAutoBadge: 'Nâng cao',
			modeAutoDesc: 'Agent tự động thực thi các chuỗi lệnh trong sandbox an toàn với ngân sách giới hạn.',
			// Step 3
			modelTitle: 'Cấu hình Mô hình Trí tuệ Nhân tạo',
			modelDesc: 'Yana tương thích với cả mô hình chạy offline trên máy và các mô hình đám mây mạnh mẽ nhất.',
			modelLocalTitle: 'Mô hình Cục bộ (Ollama / Local)',
			modelLocalBadge: 'Miễn phí & Offline',
			modelLocalDesc: 'Chạy trực tiếp trên GPU/CPU máy tính của bạn qua Ollama hoặc LM Studio. Hoạt động offline 100%.',
			modelCloudTitle: 'Mô hình Đám mây (Claude / GPT-6 Astra / Gemini)',
			modelCloudBadge: 'Mạnh mẽ nhất',
			modelCloudDesc: 'Sử dụng API Key cá nhân của bạn. Chìa khóa được mã hóa lưu trữ trong Keychain hệ điều hành an toàn.',
			modelLaterTitle: 'Thiết lập sau',
			modelLaterBadge: 'Mặc định',
			modelLaterDesc: 'Sử dụng cấu hình mặc định sẵn có. Bạn có thể chọn mô hình bất cứ lúc nào trong bảng cài đặt.',
			// Step 4
			readyTitle: 'Bạn đã sẵn sàng!',
			readyDesc: 'Yana Studio đã được cấu hình phù hợp với bạn. Hãy chọn bước tiếp theo để bắt đầu:',
			actionFolderTitle: 'Mở thư mục dự án của bạn',
			actionFolderDesc: 'Chọn codebase trên máy để Yana tìm hiểu cấu trúc và bắt đầu hỗ trợ viết mã',
			actionChatTitle: 'Bắt đầu trò chuyện với Yana AI',
			actionChatDesc: 'Mở khung chat bên phải để hỏi đáp kiến trúc hoặc giao việc trực tiếp',
			actionCanvasTitle: 'Phác thảo UI với Design Canvas',
			actionCanvasDesc: 'Dùng AI hoặc kéo thả để thiết kế màn hình ứng dụng nhanh chóng'
		},
		en: {
			skip: 'Skip',
			back: '← Back',
			next: 'Continue →',
			startNow: '🚀 Get Started with Yana Studio',
			step1Nav: 'Introduction',
			step2Nav: 'Agent Mode',
			step3Nav: 'AI Models',
			step4Nav: 'Get Started',
			// Step 1
			welcomeTitle: 'Welcome to Yana Studio',
			welcomeDesc: 'The first local-first AI Agent Operating System. Code, design, test, and ship software with absolute privacy.',
			selectLanguage: 'Select display language:',
			feature1Title: '100% Private & Local',
			feature1Desc: 'No cloud account required, Zero telemetry. Your code and context never leave this machine.',
			feature2Title: 'You are always in control',
			feature2Desc: 'Every file edit, shell command execution, or network call halts for your explicit approval.',
			// Step 2
			modeTitle: 'Choose Agent Governance Mode',
			modeDesc: 'How would you like Yana AI to assist you? You can switch modes anytime from the status bar.',
			modeSupervisedTitle: 'Supervised Mode',
			modeSupervisedBadge: 'Recommended',
			modeSupervisedDesc: 'Agent reads code and drafts plans; every terminal execution and file modification requires approval.',
			modePlanTitle: 'Plan Mode',
			modePlanBadge: 'Read-only',
			modePlanDesc: 'Consults, analyzes code, and designs architectures. All mutative commands and writes are blocked.',
			modeAutoTitle: 'Autonomous Mode',
			modeAutoBadge: 'Advanced',
			modeAutoDesc: 'Agent autonomously executes chained actions inside safe sandboxes with defined task budgets.',
			// Step 3
			modelTitle: 'Configure AI Model Engine',
			modelDesc: 'Yana supports both local models running offline on your hardware and top-tier cloud APIs.',
			modelLocalTitle: 'Local Models (Ollama / LM Studio)',
			modelLocalBadge: 'Free & Offline',
			modelLocalDesc: 'Runs directly on your local GPU/CPU. Fully offline, private, and unlimited usage.',
			modelCloudTitle: 'Cloud Models (Claude / GPT-6 Astra / Gemini)',
			modelCloudBadge: 'Highest Reasoning',
			modelCloudDesc: 'Bring your own API key. Keys are securely encrypted in your OS keychain.',
			modelLaterTitle: 'Configure Later',
			modelLaterBadge: 'Default',
			modelLaterDesc: 'Use standard defaults. You can switch models anytime from the status bar or settings.',
			// Step 4
			readyTitle: "You're all set!",
			readyDesc: 'Yana Studio has been tailored to your preferences. Choose how you would like to begin:',
			actionFolderTitle: 'Open your project workspace',
			actionFolderDesc: 'Select a codebase on your machine so Yana can index the structure and assist with code',
			actionChatTitle: 'Start chatting with Yana AI',
			actionChatDesc: 'Open the right panel to ask architectural questions or delegate tasks',
			actionCanvasTitle: 'Sketch UI with Design Canvas',
			actionCanvasDesc: 'Use AI or drag-and-drop to visually design application screens'
		},
		ko: {
			skip: '건너뛰기',
			back: '← 뒤로',
			next: '계속 →',
			startNow: '🚀 Yana Studio 시작하기',
			step1Nav: '소개',
			step2Nav: '에이전트 모드',
			step3Nav: 'AI 모델',
			step4Nav: '시작',
			// Step 1
			welcomeTitle: '야나 스튜디오에 오신 것을 환영합니다',
			welcomeDesc: '최초의 로컬 우선 AI 에이전트 OS. 완벽한 프라이버시 속에서 코딩, UI 디자인, 테스트 및 제품 출시를 지원합니다.',
			selectLanguage: '표시 언어 선택:',
			feature1Title: '100% 로컬 및 프라이버시',
			feature1Desc: '클라우드 계정 불필요, 텔레메트리 제로. 소스 코드와 데이터는 기기 외부로 전송되지 않습니다.',
			feature2Title: '항상 사용자가 제어',
			feature2Desc: '모든 파일 수정, 터미널 명령 실행 또는 네트워크 접근은 사용자의 명시적 승인을 거칩니다.',
			// Step 2
			modeTitle: '에이전트 거버넌스 모드 선택',
			modeDesc: 'Yana AI가 어떻게 지원하기를 원하시나요? 하단 상태 표시줄에서 언제든지 변경할 수 있습니다.',
			modeSupervisedTitle: '감독 모드 (Supervised)',
			modeSupervisedBadge: '권장',
			modeSupervisedDesc: '에이전트가 코드를 읽고 계획을 수립합니다. 모든 터미널 실행 및 파일 수정은 승인이 필요합니다.',
			modePlanTitle: '계획 모드 (Plan Mode)',
			modePlanBadge: '읽기 전용',
			modePlanDesc: '코드 분석 및 아키텍처 계획만 수행하며, 파일 수정 및 명령 실행은 차단됩니다.',
			modeAutoTitle: '자율 모드 (Autonomous)',
			modeAutoBadge: '고급',
			modeAutoDesc: '정해진 예산 내에서 안전한 샌드박스를 통해 에이전트가 자율적으로 명령을 실행합니다.',
			// Step 3
			modelTitle: 'AI 모델 엔진 설정',
			modelDesc: 'Yana는 로컬 오프라인 모델과 최고 수준의 클라우드 API를 모두 지원합니다.',
			modelLocalTitle: '로컬 모델 (Ollama / Local)',
			modelLocalBadge: '무료 & 오프라인',
			modelLocalDesc: '기기 자체의 GPU/CPU에서 직접 실행됩니다. 100% 오프라인으로 작동합니다.',
			modelCloudTitle: '클라우드 모델 (Claude / GPT-6 Astra / Gemini)',
			modelCloudBadge: '최고 성능',
			modelCloudDesc: '자신의 API 키를 사용합니다. 키는 OS 키체인에 안전하게 암호화되어 보관됩니다.',
			modelLaterTitle: '나중에 설정',
			modelLaterBadge: '기본값',
			modelLaterDesc: '기본 설정을 사용합니다. 설정 패널에서 언제든지 변경할 수 있습니다.',
			// Step 4
			readyTitle: '모든 준비가 완료되었습니다!',
			readyDesc: 'Yana Studio 맞춤 설정이 완료되었습니다. 시작할 작업을 선택하세요:',
			actionFolderTitle: '프로젝트 폴더 열기',
			actionFolderDesc: '기기의 코드베이스를 열어 Yana가 프로젝트 구조를 파악하도록 합니다',
			actionChatTitle: 'Yana AI와 대화 시작',
			actionChatDesc: '오른쪽 패널을 열어 질문하거나 작업을 바로 지시합니다',
			actionCanvasTitle: 'Design Canvas로 UI 스케치',
			actionCanvasDesc: 'AI 또는 드래그 앤 드롭으로 앱 화면을 신속하게 디자인합니다'
		}
	};

	function t(key) {
		const dict = I18N[state.language] || I18N.vi;
		return dict[key] || I18N.vi[key] || key;
	}

	function el(tag, className, text) {
		const elem = document.createElement(tag);
		if (className) elem.className = className;
		if (text !== undefined && text !== null) elem.textContent = text;
		return elem;
	}

	function renderHeader() {
		const header = el('div', 'wizard-header');
		
		const brand = el('div', 'brand-section');
		if (logoUri) {
			const logo = el('img', 'brand-logo');
			logo.src = logoUri;
			brand.append(logo);
		}
		brand.append(el('span', 'brand-title', 'Yana Studio'), el('span', 'brand-badge', 'v1.6.2'));

		const skipBtn = el('button', 'skip-btn', t('skip'));
		skipBtn.onclick = () => {
			vscode.postMessage({ type: 'skip' });
		};

		header.append(brand, skipBtn);
		return header;
	}

	function renderStepper() {
		const stepper = el('div', 'stepper');
		const steps = [
			{ id: 1, label: t('step1Nav') },
			{ id: 2, label: t('step2Nav') },
			{ id: 3, label: t('step3Nav') },
			{ id: 4, label: t('step4Nav') }
		];

		steps.forEach((step, idx) => {
			const indicator = el('div', `step-indicator ${step.id === currentStep ? 'active' : ''} ${step.id < currentStep ? 'completed' : ''}`);
			const circle = el('span', 'step-circle', step.id < currentStep ? '✓' : String(step.id));
			const label = el('span', 'step-label', step.label);
			indicator.append(circle, label);
			stepper.append(indicator);

			if (idx < steps.length - 1) {
				stepper.append(el('div', 'step-line'));
			}
		});

		return stepper;
	}

	function renderStep1() {
		const container = el('div', 'step-container');

		const hero = el('div', 'hero-header');
		if (emblemUri) {
			const emblem = el('img', 'hero-emblem');
			emblem.src = emblemUri;
			hero.append(emblem);
		}
		hero.append(
			el('h1', 'hero-title', t('welcomeTitle')),
			el('p', 'hero-subtitle', t('welcomeDesc'))
		);

		// Language Picker
		const langSec = el('div', 'lang-section');
		const langLabel = el('p', 'hero-subtitle', t('selectLanguage'));
		langLabel.style.marginBottom = '8px';
		langLabel.style.fontWeight = '600';

		const langList = el('div', 'lang-selector');
		const langs = [
			{ code: 'vi', label: '🇻🇳 Tiếng Việt' },
			{ code: 'en', label: '🇺🇸 English' },
			{ code: 'ko', label: '🇰🇷 한국어' }
		];

		langs.forEach(item => {
			const btn = el('button', `lang-btn ${state.language === item.code ? 'active' : ''}`, item.label);
			btn.onclick = () => {
				state.language = item.code;
				vscode.postMessage({ type: 'setLanguage', lang: item.code });
				render();
			};
			langList.append(btn);
		});

		langSec.append(langLabel, langList);

		// Feature Highlights
		const highlights = el('div', 'highlights-list');
		highlights.style.marginTop = '28px';

		const h1 = el('div', 'highlight-item');
		h1.append(
			el('div', 'highlight-icon', '🔒'),
			el('div', 'highlight-text', null)
		);
		h1.querySelector('.highlight-text').append(
			el('h4', null, t('feature1Title')),
			el('p', null, t('feature1Desc'))
		);

		const h2 = el('div', 'highlight-item');
		h2.append(
			el('div', 'highlight-icon', '🛡️'),
			el('div', 'highlight-text', null)
		);
		h2.querySelector('.highlight-text').append(
			el('h4', null, t('feature2Title')),
			el('p', null, t('feature2Desc'))
		);

		highlights.append(h1, h2);

		container.append(hero, langSec, highlights);
		return container;
	}

	function renderStep2() {
		const container = el('div', 'step-container');

		const hero = el('div', 'hero-header');
		hero.append(
			el('h2', 'hero-title', t('modeTitle')),
			el('p', 'hero-subtitle', t('modeDesc'))
		);

		const grid = el('div', 'cards-grid');

		const modes = [
			{ id: 'supervised', icon: '🛡️', title: t('modeSupervisedTitle'), badge: t('modeSupervisedBadge'), desc: t('modeSupervisedDesc') },
			{ id: 'plan', icon: '💡', title: t('modePlanTitle'), badge: t('modePlanBadge'), desc: t('modePlanDesc') },
			{ id: 'autonomous', icon: '⚡', title: t('modeAutoTitle'), badge: t('modeAutoBadge'), desc: t('modeAutoDesc') }
		];

		modes.forEach(m => {
			const card = el('div', `option-card ${state.mode === m.id ? 'selected' : ''}`);
			card.onclick = () => {
				state.mode = m.id;
				vscode.postMessage({ type: 'setMode', mode: m.id });
				render();
			};

			const icon = el('div', 'card-icon', m.icon);
			const titleRow = el('div', 'card-title');
			titleRow.append(el('span', null, m.title));
			if (m.badge) {
				titleRow.append(el('span', 'card-badge', m.badge));
			}
			const desc = el('div', 'card-desc', m.desc);

			card.append(icon, titleRow, desc);
			grid.append(card);
		});

		container.append(hero, grid);
		return container;
	}

	function renderStep3() {
		const container = el('div', 'step-container');

		const hero = el('div', 'hero-header');
		hero.append(
			el('h2', 'hero-title', t('modelTitle')),
			el('p', 'hero-subtitle', t('modelDesc'))
		);

		const grid = el('div', 'cards-grid');

		const models = [
			{ id: 'ollama', icon: '🖥️', title: t('modelLocalTitle'), badge: t('modelLocalBadge'), desc: t('modelLocalDesc') },
			{ id: 'anthropic', icon: '☁️', title: t('modelCloudTitle'), badge: t('modelCloudBadge'), desc: t('modelCloudDesc') },
			{ id: 'default', icon: '⏩', title: t('modelLaterTitle'), badge: t('modelLaterBadge'), desc: t('modelLaterDesc') }
		];

		models.forEach(m => {
			const card = el('div', `option-card ${state.provider === m.id ? 'selected' : ''}`);
			card.onclick = () => {
				state.provider = m.id;
				vscode.postMessage({ type: 'setProvider', provider: m.id });
				render();
			};

			const icon = el('div', 'card-icon', m.icon);
			const titleRow = el('div', 'card-title');
			titleRow.append(el('span', null, m.title));
			if (m.badge) {
				titleRow.append(el('span', 'card-badge', m.badge));
			}
			const desc = el('div', 'card-desc', m.desc);

			card.append(icon, titleRow, desc);
			grid.append(card);
		});

		container.append(hero, grid);
		return container;
	}

	function renderStep4() {
		const container = el('div', 'step-container');

		const hero = el('div', 'hero-header');
		hero.append(
			el('h2', 'hero-title', t('readyTitle')),
			el('p', 'hero-subtitle', t('readyDesc'))
		);

		const list = el('div', 'ready-actions');

		const actions = [
			{ id: 'openFolder', icon: '📂', title: t('actionFolderTitle'), desc: t('actionFolderDesc') },
			{ id: 'chat', icon: '💬', title: t('actionChatTitle'), desc: t('actionChatDesc') },
			{ id: 'canvas', icon: '🎨', title: t('actionCanvasTitle'), desc: t('actionCanvasDesc') }
		];

		actions.forEach(a => {
			const card = el('div', 'action-card');
			card.onclick = () => {
				vscode.postMessage({ type: 'finish', action: a.id });
			};

			const main = el('div', 'action-main');
			main.append(
				el('span', 'action-icon', a.icon),
				el('div', null, null)
			);
			main.querySelector('div').append(
				el('div', 'action-title', a.title),
				el('div', 'action-desc', a.desc)
			);

			const arrow = el('span', 'action-arrow', '→');
			card.append(main, arrow);
			list.append(card);
		});

		container.append(hero, list);
		return container;
	}

	function renderFooter() {
		const footer = el('div', 'wizard-footer');

		const left = el('div', 'footer-left');
		if (currentStep > 1) {
			const backBtn = el('button', 'back-btn', t('back'));
			backBtn.onclick = () => {
				currentStep--;
				render();
			};
			left.append(backBtn);
		}

		const dots = el('div', 'dots-indicator');
		for (let i = 1; i <= TOTAL_STEPS; i++) {
			dots.append(el('span', `dot ${i === currentStep ? 'active' : ''}`));
		}

		const right = el('div', 'footer-right');
		if (currentStep < TOTAL_STEPS) {
			const nextBtn = el('button', 'next-btn', t('next'));
			nextBtn.onclick = () => {
				currentStep++;
				render();
			};
			right.append(nextBtn);
		} else {
			const finishBtn = el('button', 'finish-btn', t('startNow'));
			finishBtn.onclick = () => {
				vscode.postMessage({ type: 'finish', action: 'chat' });
			};
			right.append(finishBtn);
		}

		footer.append(left, dots, right);
		return footer;
	}

	function render() {
		app.replaceChildren();

		app.append(renderHeader(), renderStepper());

		if (currentStep === 1) app.append(renderStep1());
		else if (currentStep === 2) app.append(renderStep2());
		else if (currentStep === 3) app.append(renderStep3());
		else if (currentStep === 4) app.append(renderStep4());

		app.append(renderFooter());
	}

	window.addEventListener('message', event => {
		const msg = event.data;
		if (msg?.type === 'state' && msg.state) {
			Object.assign(state, msg.state);
			render();
		}
	});

	// Khởi tạo
	vscode.postMessage({ type: 'ready' });
	render();
})();
