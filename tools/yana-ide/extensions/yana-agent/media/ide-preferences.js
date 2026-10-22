'use strict';
// Giao diện màn "Yana IDE" hỗ trợ đa ngôn ngữ (Tiếng Việt, English, 한국어).
// Chỉ dựng DOM bằng textContent; mọi thay đổi gửi về extension, extension kiểm tra lại
// rồi gửi trạng thái mới, đảm bảo an toàn tuyệt đối và tôn trọng locale.
(function () {
	const vscode = acquireVsCodeApi();
	const app = document.getElementById('app');
	let notice = '';
	let currentLang = 'en';

	const DICT = {
		vi: {
			'title': 'Cài đặt IDE Yana',
			'lead': 'Cài đặt riêng cho các tính năng của IDE Yana. Mọi công tắc tại đây đều hoạt động thật trên hệ thống.',
			'userGuide': 'Sách hướng dẫn sử dụng',
			'guideOpenFirst': 'Mở sách hướng dẫn khi khởi động lần đầu',
			'guideOpenFirstSub': 'Tự động mở tài liệu hướng dẫn từng bước cạnh Trang chủ Yana.',
			'guideShowAgain': 'Hiển thị lại sách hướng dẫn',
			'guideSeenSub': 'Đã mở một lần trước đó. Tùy chọn này giúp mở lại trong lần khởi động tiếp theo.',
			'guideWillOpenSub': 'Sách hướng dẫn sẽ mở tự động vào lần khởi động tiếp theo.',
			'guideShowNext': 'Hiện lại ở lần khởi động sau',
			'guideOpenNow': 'Mở xem ngay',
			'startPage': 'Trang khởi động',
			'openHomeStartup': 'Mở Trang chủ Yana khi khởi động',
			'openHomeStartupSub': 'Chỉ hiển thị khi không có tệp nào đang mở.',
			'approvals': 'Phê duyệt & Quyền hạn',
			'approvalStore': 'Kho lưu trữ phê duyệt cho dự án này',
			'folderNotOpen': 'Chưa mở thư mục',
			'on': 'Đang bật',
			'off': 'Đang tắt',
			'turnOnApprovals': 'Bật phê duyệt trong dự án này',
			'nothingToDo': 'Đã sẵn sàng hoạt động.',
			'openFolderFirst': 'Hãy mở một thư mục trước.',
			'trustedApprovalNote': 'Yana dừng lại và xin phép bạn trước mỗi lệnh hoặc thay đổi tệp. Cần có tệp cấu hình để yana-rt ghi nhận các phê duyệt đang chờ.',
			'restrictedApprovalNote': 'Thư mục này đang ở Chế độ hạn chế (Restricted Mode). Cần tin cậy thư mục trước khi bật phê duyệt.',
			'assistant': 'Trợ lý AI mặc định',
			'defaultAssistant': 'Trợ lý mặc định',
			'openChatFirst': 'Hãy mở bảng chat Yana một lần rồi quay lại.',
			'noAssistants': 'Chưa có danh sách trợ lý',
			'assistantDesc': 'Quy định phong cách phản hồi và mô hình AI mặc định của Yana.',
			'modelRuntime': 'Mô hình và Runtime',
			'currentModel': 'Mô hình chat hiện tại',
			'notSet': 'chưa đặt',
			'default': 'mặc định',
			'btnModelsRuntime': 'Mô hình & Runtime',
			'yanaRtNotFound': 'không tìm thấy. Mở Mô hình & Runtime để chọn đường dẫn.',
			'btnYanaSettings': 'Cài đặt Yana',
			'replies': 'Phản hồi & Tham số',
			'maxTokens': 'Độ dài phản hồi tối đa (tokens)',
			'maxTokensSub': 'Để trống để dùng mặc định của nhà cung cấp (Claude: 4096). Từ 1 đến 32000.',
			'temperature': 'Độ sáng tạo (Temperature)',
			'temperatureSub': 'Để trống để dùng mặc định. Từ 0 đến 2; Claude giới hạn tối đa 1.0.',
			'planMode': 'Chế độ Plan',
			'planModeSub': 'Bật tắt trong ô chat. Khi chạy với yana-rt hiện tại, chế độ này chỉ đọc và lập kế hoạch, không tự ý sửa đổi tệp.',
			'runtimeSupportsControls': 'yana-rt hỗ trợ đầy đủ các tham số này và chế độ Plan',
			'runtimeTooOld': 'Phiên bản yana-rt cũ: chế độ Plan chỉ mang tính yêu cầu, các tham số này tạm bỏ qua',
			'planned': 'Tính năng sắp ra mắt',
			'plannedSub': 'Các tính năng này đang trong quá trình hoàn thiện, chưa có công tắc điều khiển.',
			'voiceInput': 'Nhập liệu bằng giọng nói',
			'voiceInputWhy': 'Chưa cấu hình runtime xử lý âm thanh/speech.',
			'reasoningEffort': 'Mức độ suy luận (Reasoning effort)',
			'reasoningEffortWhy': 'Khả năng điều chỉnh tùy thuộc vào từng nhà cung cấp và mô hình cụ thể.',
			'discordRemote': 'Điều khiển qua Discord bot',
			'discordRemoteWhy': 'Bản yana-rt cài đặt chưa tích hợp lệnh remote và chưa có bot token.',
		},
		ko: {
			'title': 'Yana IDE 기본 설정',
			'lead': '이 IDE의 기능에 대한 설정입니다. 여기에 있는 모든 스위치는 실제로 작동합니다.',
			'userGuide': '사용자 가이드',
			'guideOpenFirst': '처음 시작할 때 가이드 열기',
			'guideOpenFirstSub': 'Yana 홈 옆에 단계별 설명서를 한 번 엽니다.',
			'guideShowAgain': '가이드 다시 표시',
			'guideSeenSub': '이미 한 번 열렸습니다. 다음 시작 시 다시 열리도록 설정합니다.',
			'guideWillOpenSub': '다음 시작 시 자동으로 열립니다.',
			'guideShowNext': '다음 시작 시 다시 표시',
			'guideOpenNow': '지금 열기',
			'startPage': '시작 페이지',
			'openHomeStartup': '시작 시 Yana 홈 열기',
			'openHomeStartupSub': '열려 있는 파일이 없을 때만 표시됩니다.',
			'approvals': '승인 및 권한',
			'approvalStore': '이 프로젝트의 승인 저장소',
			'folderNotOpen': '폴더가 열리지 않음',
			'on': '켜짐',
			'off': '꺼짐',
			'turnOnApprovals': '이 프로젝트에서 승인 켜기',
			'nothingToDo': '작업이 필요하지 않습니다.',
			'openFolderFirst': '먼저 폴더를 여세요.',
			'trustedApprovalNote': 'Yana는 모든 명령이나 파일 변경 전에 중지하고 확인을 요청합니다.',
			'restrictedApprovalNote': '이 폴더는 제한 모드입니다. 승인을 켜기 전에 신뢰해야 합니다.',
			'assistant': '기본 AI 어시스턴트',
			'defaultAssistant': '기본 어시스턴트',
			'openChatFirst': 'Yana 채팅 패널을 한 번 연 후 다시 오세요.',
			'noAssistants': '어시스턴트 없음',
			'assistantDesc': 'Yana의 작동 방식을 선택합니다.',
			'modelRuntime': '모델 및 런타임',
			'currentModel': '현재 채팅 모델',
			'notSet': '설정되지 않음',
			'default': '기본값',
			'btnModelsRuntime': '모델 및 런타임',
			'yanaRtNotFound': '찾을 수 없습니다. 모델 및 런타임을 열어 선택하세요.',
			'btnYanaSettings': 'Yana 설정',
			'replies': '응답 및 매개변수',
			'maxTokens': '최대 응답 토큰 (tokens)',
			'maxTokensSub': '비워두면 제공자 기본값을 사용합니다 (Claude: 4096). 1에서 32000 사이.',
			'temperature': '창의성 (Temperature)',
			'temperatureSub': '비워두면 제공자 기본값을 사용합니다. 0에서 2 사이.',
			'planMode': 'Plan 모드',
			'planModeSub': '채팅창에서 전환합니다. 최신 yana-rt에서는 파일이나 명령을 실행하지 않고 계획만 설명합니다.',
			'runtimeSupportsControls': 'yana-rt가 이러한 설정과 Plan 모드를 완벽하게 지원합니다',
			'runtimeTooOld': 'yana-rt 버전이 오래되었습니다. Plan 모드는 요청일 뿐이며 무시됩니다',
			'planned': '예정된 기능',
			'plannedSub': '아직 지원되지 않으므로 제어 스위치가 없습니다.',
			'voiceInput': '음성 입력',
			'voiceInputWhy': '아직 음성 런타임이 구성되지 않았습니다.',
			'reasoningEffort': '추론 강도 (Reasoning effort)',
			'reasoningEffortWhy': '모델 및 제공자에 따라 지원 여부가 다릅니다.',
			'discordRemote': 'Discord 원격 채팅',
			'discordRemoteWhy': '설치된 yana-rt에 원격 명령이 없거나 봇 토큰이 없습니다.',
		},
		en: {
			'title': 'Yana IDE Settings',
			'lead': 'Settings for the features of this IDE. Every switch here works; anything that does not work yet is listed at the bottom.',
			'userGuide': 'User guide',
			'guideOpenFirst': 'Open the guide on first start',
			'guideOpenFirstSub': 'Opens the step-by-step manual once, next to Yana Home.',
			'guideShowAgain': 'Show the guide again',
			'guideSeenSub': 'It has already opened once. This makes it open again at the next start.',
			'guideWillOpenSub': 'It will open at the next start.',
			'guideShowNext': 'Show again at next start',
			'guideOpenNow': 'Open now',
			'startPage': 'Start page',
			'openHomeStartup': 'Open Yana Home at startup',
			'openHomeStartupSub': 'Only when no file is open.',
			'approvals': 'Approvals & Governance',
			'approvalStore': 'Approval store for this project',
			'folderNotOpen': 'Folder not open',
			'on': 'On',
			'off': 'Off',
			'turnOnApprovals': 'Turn on approvals in this project',
			'nothingToDo': 'Nothing to do.',
			'openFolderFirst': 'Open a folder first.',
			'trustedApprovalNote': 'Yana stops and asks before every command or file change. Without this file, yana-rt cannot store a pending approval.',
			'restrictedApprovalNote': 'This folder is in Restricted Mode. Trust it before turning approvals on.',
			'assistant': 'Default Assistant',
			'defaultAssistant': 'Default assistant',
			'openChatFirst': 'Open the Yana chat panel once, then come back.',
			'noAssistants': 'No assistants yet',
			'assistantDesc': 'Choose how Yana should work. Today an assistant only changes the provider and model.',
			'modelRuntime': 'Model and runtime',
			'currentModel': 'Current chat model',
			'notSet': 'not set',
			'default': 'default',
			'btnModelsRuntime': 'Models and runtime',
			'yanaRtNotFound': 'not found. Open Models and runtime to choose it.',
			'btnYanaSettings': 'Yana Settings',
			'replies': 'Replies & Controls',
			'maxTokens': 'Longest reply (tokens)',
			'maxTokensSub': 'Empty uses the provider default (Claude: 4096). From 1 to 32000.',
			'temperature': 'Temperature',
			'temperatureSub': 'Empty uses the provider default. From 0 to 2; Claude caps it at 1.',
			'planMode': 'Plan mode',
			'planModeSub': 'Switch it in the chat box. With a current yana-rt it cannot run commands or change files, only look and describe a plan.',
			'runtimeSupportsControls': 'yana-rt supports these and Plan mode',
			'runtimeTooOld': 'This yana-rt is too old: Plan mode is only a request, these are ignored',
			'planned': 'Not available yet',
			'plannedSub': 'These do not work yet, so there is no switch for them.',
			'voiceInput': 'Voice input',
			'voiceInputWhy': 'No speech runtime is configured yet.',
			'reasoningEffort': 'Reasoning effort',
			'reasoningEffortWhy': 'Not tunable yet: whether a model accepts it differs per provider and model.',
			'discordRemote': 'Discord remote chat',
			'discordRemoteWhy': 'The installed yana-rt has no remote command, and no bot token is set.',
		}
	};

	function t(key, fallback) {
		const dict = DICT[currentLang] || DICT.en;
		return dict[key] || DICT.en[key] || fallback || key;
	}

	function el(tag, cls, text) {
		const node = document.createElement(tag);
		if (cls) node.className = cls;
		if (text !== undefined) node.textContent = text;
		return node;
	}
	function send(message) { notice = ''; vscode.postMessage(message); }
	function button(label, message, cls) {
		const node = el('button', cls || 'btn', label);
		node.addEventListener('click', () => send(message));
		return node;
	}
	function toggle(checked, type) {
		const node = el('input');
		node.type = 'checkbox';
		node.checked = checked;
		node.addEventListener('change', () => send({ type, value: node.checked }));
		return node;
	}
	function row(label, note, control) {
		const node = el('div', 'row');
		const text = el('div', 'row-text');
		text.append(el('div', 'row-label', label), el('div', 'row-note', note));
		node.append(text, control);
		return node;
	}
	function group(title, ...rows) {
		const node = el('section', 'group');
		node.append(el('h2', null, title), ...rows);
		return node;
	}
	function inline(...controls) {
		const node = el('div', 'inline');
		node.append(...controls);
		return node;
	}
	function label(text, tone) { return el('span', 'badge' + (tone ? ` ${tone}` : ''), text); }

	function guideGroup(state) {
		return group(t('userGuide'),
			row(t('guideOpenFirst'), t('guideOpenFirstSub'), toggle(state.guide.autoOpen, 'setGuideAutoOpen')),
			row(t('guideShowAgain'), state.guide.seen ? t('guideSeenSub') : t('guideWillOpenSub'),
				inline(button(t('guideShowNext'), { type: 'showGuideAgain' }), button(t('guideOpenNow'), { type: 'openGuide' }))));
	}

	function homeGroup(state) {
		return group(t('startPage'),
			row(t('openHomeStartup'), t('openHomeStartupSub'), toggle(state.home.showOnStartup, 'setHomeOnStartup')));
	}

	function approvalGroup(state) {
		const a = state.approvals;
		let status = label(t('folderNotOpen'), 'warn');
		if (a.hasFolder) status = a.active ? label(t('on'), 'ok') : label(t('off'), 'bad');
		const action = a.hasFolder && !a.active
			? button(t('turnOnApprovals'), { type: 'enableApprovals' })
			: el('span', 'muted', a.hasFolder ? t('nothingToDo') : t('openFolderFirst'));
		const note = a.trusted ? t('trustedApprovalNote') : t('restrictedApprovalNote');
		return group(t('approvals'), row(t('approvalStore'), note, inline(status, action)));
	}

	function assistantGroup(state) {
		const { items, selectedId } = state.assistants;
		if (!items.length) return group(t('assistant'), row(t('defaultAssistant'), t('openChatFirst'), el('span', 'muted', t('noAssistants'))));
		const select = el('select');
		for (const item of items) {
			const option = el('option', null, `${item.name} (${item.provider || t('default')} / ${item.model || t('default')})`);
			option.value = item.id;
			option.selected = item.id === selectedId;
			select.append(option);
		}
		select.addEventListener('change', () => send({ type: 'selectAssistant', id: select.value }));
		const current = items.find(item => item.id === selectedId);
		return group(t('assistant'),
			row(t('defaultAssistant'), (current?.description || t('assistantDesc')), select));
	}

	function runtimeGroup(state) {
		const r = state.runtime;
		return group(t('modelRuntime'),
			row(t('currentModel'), `${r.provider || t('notSet')} / ${r.model || t('default')}`, button(t('btnModelsRuntime'), { type: 'openModels' })),
			row('yana-rt', r.path || t('yanaRtNotFound'), button(t('btnYanaSettings'), { type: 'openSettings' })));
	}

	function numberBox(value, type, placeholder, step) {
		const node = el('input');
		node.type = 'number';
		node.step = step;
		node.placeholder = placeholder;
		node.value = value === null || value === undefined ? '' : String(value);
		node.addEventListener('change', () => send({ type, value: node.value }));
		return node;
	}

	function chatGroup(state) {
		const c = state.chat;
		const support = c.controlsSupported
			? label(t('runtimeSupportsControls'), 'ok')
			: label(t('runtimeTooOld'), 'warn');
		return group(t('replies'),
			row(t('maxTokens'), t('maxTokensSub'), numberBox(c.maxTokens, 'setMaxTokens', 'default', '1')),
			row(t('temperature'), t('temperatureSub'), numberBox(c.temperature, 'setTemperature', 'default', '0.1')),
			row(t('planMode'), t('planModeSub'), support));
	}

	function plannedGroup(_state) {
		const node = group(t('planned'));
		node.append(el('p', 'muted', t('plannedSub')));
		const plannedItems = [
			[t('voiceInput'), t('voiceInputWhy')],
			[t('reasoningEffort'), t('reasoningEffortWhy')],
			[t('discordRemote'), t('discordRemoteWhy')]
		];
		for (const [name, why] of plannedItems) node.append(row(name, why, label(t('planned'))));
		return node;
	}

	function render(state) {
		if (state.language && DICT[state.language]) {
			currentLang = state.language;
		}
		const page = el('main', 'page');
		page.append(el('h1', null, t('title')),
			el('p', 'lead', t('lead')));
		if (notice) page.append(el('p', 'notice', notice));
		page.append(guideGroup(state), homeGroup(state), approvalGroup(state), assistantGroup(state), chatGroup(state), runtimeGroup(state), plannedGroup(state));
		app.replaceChildren(page);
	}

	let last;
	window.addEventListener('message', ({ data }) => {
		if (data?.type === 'state') { last = data.state; render(last); }
		if (data?.type === 'error') { notice = data.message; if (last) render(last); }
	});
	vscode.postMessage({ type: 'ready' });
})();
