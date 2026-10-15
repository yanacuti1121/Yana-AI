// Các tab của Yana Settings. Hỗ trợ đa ngôn ngữ (Tiếng Việt, English, 한국어).
// Không dùng innerHTML: DOM chỉ dựng bằng textContent/createElementNS.
(function () {
	const { el, button, badge, card, notice, number, bytes, request, t } = window.YanaUI;
	const tabs = window.YanaSettingsTabs = window.YanaSettingsTabs || {};
	const YANA_THEMES = ['Yana Dark', 'Yana Web (vutam.link)', 'Yana Light', 'Yana High Contrast', 'Yana High Contrast Light'];

	const TAB_I18N = {
		vi: {
			accountCardTitle: 'Tài khoản & Không gian làm việc',
			accountCardSub: 'Yana Studio hoạt động ở chế độ cục bộ ưu tiên (local-first) với zero telemetry và không bắt buộc tài khoản đám mây.',
			workspaceIdentity: 'Danh tính không gian làm việc',
			workspaceIdentitySub: 'Nhà phát triển cục bộ (không theo dõi đám mây hoặc đăng nhập bắt buộc)',
			localPrivate: 'Cục bộ / Riêng tư',
			credentialVault: 'Két lưu trữ bảo mật',
			credentialVaultSub: 'Lưu trữ an toàn trong Keychain hệ thống thông qua IDE SecretStorage.',
			manageKeys: 'Quản lý khóa API',
			displayLang: 'Ngôn ngữ hiển thị',
			changeLang: 'Đổi ngôn ngữ',
			activeWorkspace: 'Thư mục dự án đang mở',
			singleFile: 'Chế độ một tệp',
			trusted: 'Được tin cậy',
			active: 'Đang hoạt động',
			current: 'Hiện tại:',

			generalLangTitle: 'Ngôn ngữ hiển thị (Display Language)',
			generalLangSub: 'Chọn ngôn ngữ giao diện cho Yana Studio và trợ lý AI.',
			generalTitle: 'Hành vi tệp & Đo từ xa',
			generalSub: 'Tự động lưu, bảo vệ xóa tệp và quyền riêng tư.',
			autoSave: 'Tự động lưu tệp',
			autoSaveSub: 'Quy định thời điểm tệp chỉnh sửa được tự động lưu.',
			confirmDelete: 'Xác nhận trước khi xóa tệp',
			confirmDeleteSub: 'Hỏi xác nhận trước khi chuyển tệp hoặc thư mục vào thùng rác.',
			telemetry: 'Mức độ đo từ xa (Telemetry)',
			telemetrySub: 'Yana Studio hoạt động ở chế độ tôn trọng quyền riêng tư tuyệt đối.',

			appearanceTitle: 'Giao diện & Chủ đề',
			appearanceSub: 'Chủ đề màu sắc kiểm soát toàn bộ giao diện IDE, bao gồm cả các panel của Yana.',
			yanaDarkSub: 'Bảng màu buồng lái: nền #0c0e12, trình soạn thảo #12151c, điểm nhấn #4f80ff.',
			yanaOtherSub: 'Bảng màu tương ứng cho chế độ sáng và độ tương phản cao.',
			chooseTheme: 'Chọn giao diện',
			useYanaDark: 'Dùng Yana Dark',
			useYanaWeb: 'Dùng Yana Web',
			yanaWebSub: 'Phong cách website yana.vutam.link — nền trắng sáng tối giản, thanh lịch chuẩn Apple.',
			useYanaLight: 'Dùng Yana Light',
			yanaLightSub: 'Bảng màu sáng nhẹ nhàng, tối ưu làm việc ban ngày.',

			rulesTitle: 'Quy tắc Yana & Rào chắn an toàn',
			rulesSub: '{0} quy tắc hệ thống bắt buộc kiểm chứng bằng chứng trước khi kết luận.',
			enforced: 'Bắt buộc thực thi',
			skillsTitle: 'Danh mục kỹ năng (Skills)',
			skillsSub: '{0} kỹ năng kỹ thuật đã được lập chỉ mục cho kiến trúc, kiểm thử và tái cấu trúc.',
			activeSkills: 'Kỹ năng dự án đang mở',
			skillsDir: 'Thư mục kỹ năng',
			inspectMemory: 'Mở bộ nhớ dự án',
			instructionsTitle: 'Chỉ dẫn Agent',
			instructionsSub: 'Nguyên tắc vận hành cho trợ lý AI khi làm việc trong thư mục này.',
			agentsMdFile: 'Tệp chính sách AGENTS.md',
			agentsMdActive: 'Đang kích hoạt ở thư mục gốc',
			agentsMdMissing: 'Chưa có ở thư mục gốc',
			truthGateTitle: 'Quy tắc Truth Gate',
			truthGateSub: 'gates/truth_gate.md — Không tuyên bố hoàn thành nếu không có bằng chứng.',
			copyPath: 'Sao chép đường dẫn',

			browserTitle: 'Trình duyệt tích hợp & Xem trước',
			browserSub: 'Cấu hình xem trước web và cổng gỡ lỗi cục bộ.',
			previewTarget: 'Đích xem trước',
			previewTargetSub: 'Nơi mở trang xem trước ứng dụng web.',
			debugPort: 'Cổng gỡ lỗi từ xa (Debug Port)',
			debugPortSub: 'Cổng kết nối tự động hóa trình duyệt và thanh tra phần tử.',

			tabTitle: 'Tab Hoàn thành mã',
			tabSub: 'Gợi ý mã nội dòng trong khi gõ phím trong trình soạn thảo.',
			inlineSuggest: 'Gợi ý mã nội dòng',
			inlineSuggestSub: 'Tự động hiển thị gợi ý mã khi bạn đang gõ.',
			quickSuggest: 'Bảng gợi ý nhanh (Quick Suggestions)',
			quickSuggestSub: 'Hiển thị popup gợi ý khi gõ từ, chuỗi ký tự và chú thích.',

			editorFormattingTitle: 'Định dạng mã',
			editorFormattingSub: 'Quy tắc tự động định dạng mã khi lưu và gõ phím.',
			formatOnSave: 'Định dạng khi lưu (Format On Save)',
			formatOnSaveSub: 'Tự động làm đẹp mã nguồn mỗi khi lưu tệp.',
			formatMode: 'Phạm vi định dạng khi lưu',
			formatModeSub: 'Định dạng toàn bộ tệp hay chỉ vùng vừa sửa đổi.',
			formatOnType: 'Định dạng khi gõ',
			formatOnTypeSub: 'Tự động định dạng lại dòng mã ngay sau khi nhập xong.',
			codeLens: 'Hiển thị CodeLens',
			codeLensSub: 'Hiển thị tham chiếu và chỉ dẫn ngữ cảnh ngay trên hàm/lớp.',
			diffTitle: 'Trình xem khác biệt (Diff Editor)',
			diffSub: 'Thuật toán so sánh, tô màu và chế độ xem inline.',
			diffAlgo: 'Thuật toán Diff',
			diffAlgoSub: 'Chọn thuật toán phân tích sự khác biệt (Advanced hoặc Legacy).',
			showEmptyDeco: 'Hiển thị đánh dấu ký tự xóa/thêm',
			showMoves: 'Phát hiện mã bị di chuyển',
			useInlineView: 'Chế độ xem dòng đơn (True Inline View)',
			hideUnchanged: 'Ẩn vùng mã không đổi',
			agentSafetyTitle: 'Rào chắn Agent: Yana-AI',
			agentSafetySub: 'Hành vi của Agent, giới hạn phạm vi tác động và chính sách duyệt lệnh.',
			requireApproval: 'Bắt buộc người dùng duyệt trước khi ghi tệp',
			requireApprovalSub: 'Mọi thao tác sửa đổi đĩa đều phải được bạn xác nhận rõ ràng trước khi chạy.',
			blastRadius: 'Cảnh báo bán kính tác động',
			blastRadiusSub: 'Cảnh báo khi Agent tác động đồng thời nhiều hơn số tệp này.',

			pendingApprovals: 'Phê duyệt đang chờ',
			pendingApprovalsSub: 'Từ thẩm quyền yana-rt. Duyệt hoặc từ chối trực tiếp trong panel Chat.',
			nothingPending: 'Không có thao tác nào đang chờ duyệt.',
			leasesTitle: 'Giấy phép năng lực (Capability Leases)',
			leasesSub: 'Quyền hạn có thời hạn cấp qua yana-rt lease. Thu hồi sẽ có hiệu lực ngay ở lần kiểm tra tiếp theo.',
			noLeases: 'Chưa có giấy phép nào được cấp.',
			revoke: 'Thu hồi',

			discordTitle: 'Discord',
			discordSub: 'Chỉ chat có xác thực. Mã nguồn, Git và công cụ không bao giờ để lộ qua Discord.',
			mcpTitle: 'Giao thức ngữ cảnh mô hình (MCP)',
			mcpSub: 'MCP qua stdio. Mọi thay đổi thư mục đều được giám sát và bắt buộc phê duyệt.',
			externalToolsTitle: 'Công cụ AI khác trên máy này',
			externalToolsSub: 'Tìm thấy trên PATH hệ thống. Chúng chạy trong terminal riêng của bạn; kết quả không được coi là bằng chứng xác thực của Yana.',
			openInTerminal: 'Mở trong terminal',
			notInstalled: 'Chưa cài đặt',

			commandsTitle: 'Lệnh hệ thống Yana',
			searchCommands: 'Tìm kiếm lệnh hệ thống…',
			copy: 'Sao chép',
			insertTerminal: 'Chèn vào terminal',

			dataTitle: 'Quyền riêng tư & Bộ lưu trữ',
			dataSub: 'Chỉ đo đếm số lượng tệp và dung lượng. Trang này không bao giờ đọc nội dung tệp.',
			projectState: 'Trạng thái dự án (.yana-ai/)',
			extensionData: 'Dữ liệu Yana trong IDE',
			projectMemory: 'Bộ nhớ dự án gửi kèm mỗi phiên chat',
			savedTokens: 'Bản ghi sử dụng token',
			openMemory: 'Mở bộ nhớ',
			writeMemory: 'Tạo mới',

			usageTitle: 'Mức dùng Token',
			usageSub: 'Thống kê lượng token do nhà cung cấp báo về qua yana-rt sau mỗi lượt trao đổi trong IDE.',
			usageOverviewTitle: 'Tổng quan mức sử dụng Token',
			usageOverviewSub: 'Số lượng token được ghi nhận cục bộ theo từng phiên làm việc của trợ lý AI.',
			thisWorkspace: 'Thư mục dự án này',
			allProjects: 'Toàn bộ dự án',
			workspaceTokensDetail: '{0} input · {1} output · {2} lượt trao đổi',
			usageRatioTitle: 'Tỉ lệ Input & Output Token',
			usageRatioSub: 'Phân bổ giữa token ngữ cảnh đầu vào và token mô hình AI sinh ra.',
			inputTokens: 'Input tokens (Ngữ cảnh)',
			outputTokens: 'Output tokens (Sinh mã)',
			usageByModelTitle: 'Chi tiết theo Nhà cung cấp & Mô hình',
			usageByModelSub: 'Thống kê chi tiết số lượt trao đổi và token tiêu thụ của từng mô hình.',
			turnsUnit: 'lượt',
			lastRecorded: 'Ghi nhận gần nhất: {0}',
			honestTelemetryNote: 'Chỉ số token được lấy trực tiếp từ phản hồi telemetry của API qua yana-rt, không qua trung gian và không phục vụ tính cước đám mây.',
			usageEmpty: 'Chưa có lượt trao đổi chat nào được ghi nhận. Hãy gửi tin nhắn trong panel Yana AI để hiển thị số lượng token tại đây.',
			openChatPanel: 'Mở panel Chat Yana AI',
			backToModels: '← Quay lại Mô hình',
		},
		ko: {
			accountCardTitle: '계정 및 작업 영역 신원',
			accountCardSub: 'Yana Studio는 원격 측정 없이 로컬 우선 모드로 작동하며 클라우드 계정이 필요하지 않습니다.',
			workspaceIdentity: '작업 영역 신원',
			workspaceIdentitySub: '로컬 개발자 (클라우드 추적 또는 강제 로그인 없음)',
			localPrivate: '로컬 / 비공개',
			credentialVault: '보안 자격 증명 저장소',
			credentialVaultSub: 'IDE SecretStorage를 통해 OS 키체인에 안전하게 저장됩니다.',
			manageKeys: 'API 키 관리',
			displayLang: '표시 언어',
			changeLang: '언어 변경',
			activeWorkspace: '활성 작업 영역',
			singleFile: '단일 파일 모드',
			trusted: '신뢰됨',
			active: '활성',
			current: '현재:',

			generalLangTitle: '표시 언어 (Display Language)',
			generalLangSub: 'Yana Studio 및 AI 지원을 위한 인터페이스 언어를 선택하십시오.',
			generalTitle: '파일 동작 및 원격 측정',
			generalSub: '자동 저장, 파일 삭제 보호 및 개인 정보 보호.',
			autoSave: '파일 자동 저장',
			autoSaveSub: '수정된 파일이 자동으로 저장되는 시기를 제어합니다.',
			confirmDelete: '삭제 전 확인',
			confirmDeleteSub: '파일 또는 폴더를 휴지통으로 이동하기 전에 확인을 요청합니다.',
			telemetry: '원격 측정 수준 (Telemetry)',
			telemetrySub: 'Yana Studio는 개인 정보 보호 모드로 작동합니다.',

			appearanceTitle: '모양 및 테마',
			appearanceSub: '색 테마는 Yana 패널을 포함한 전체 IDE 모양을 제어합니다.',
			yanaDarkSub: '조종석 팔레트: 기본 #0c0e12, 편집기 #12151c, 강조 #4f80ff.',
			yanaOtherSub: '밝은 모드 및 고대비 모드를 위한 해당 팔레트.',
			chooseTheme: '테마 선택',
			useYanaDark: 'Yana Dark 사용',
			useYanaWeb: 'Yana Web 사용',
			yanaWebSub: 'yana.vutam.link 공식 웹사이트 스타일 — 미니멀하고 깔끔한 화이트 테마.',
			useYanaLight: 'Yana Light 사용',
			yanaLightSub: '주간 작업을 위한 깔끔한 밝은 테마.',

			rulesTitle: 'Yana 규칙 및 안전 게이트',
			rulesSub: '{0}개의 시스템 규칙이 주장 전 증거 검증을 시행합니다.',
			enforced: '강제 실행됨',
			skillsTitle: '스킬 카탈로그',
			skillsSub: '아키텍처, 테스트 및 리팩터링을 위한 {0}개 스킬이 색인되었습니다.',
			activeSkills: '활성 작업 영역 스킬',
			skillsDir: '스킬 디렉터리',
			inspectMemory: '메모리 검사',
			instructionsTitle: 'Agent 가이드라인',
			instructionsSub: '이 작업 영역에서 작업하는 AI 어시스턴트를 위한 운영 지침입니다.',
			agentsMdFile: 'AGENTS.md 정책 파일',
			agentsMdActive: '작업 영역 루트에서 활성',
			agentsMdMissing: '루트에서 찾을 수 없음',
			truthGateTitle: 'Truth Gate 규칙',
			truthGateSub: 'gates/truth_gate.md — 구체적인 증거 없이 완료를 주장하지 마십시오.',
			copyPath: '경로 복사',

			browserTitle: '통합 브라우저 및 미리보기',
			browserSub: '웹 미리보기 구성 및 로컬 디버깅.',
			previewTarget: '미리보기 대상',
			previewTargetSub: '웹 미리보기 페이지를 열 위치.',
			debugPort: '원격 디버그 포트',
			debugPortSub: '브라우저 자동화 및 검사기 포트.',

			tabTitle: 'Tab 코드 자동 완성',
			tabSub: '편집기에서 입력하는 동안 인라인 코드 제안.',
			inlineSuggest: '인라인 제안',
			inlineSuggestSub: '입력할 때 자동으로 인라인 완성을 표시합니다.',
			quickSuggest: '빠른 제안',
			quickSuggestSub: '단어, 문자열, 주석 입력 시 제안 팝업을 표시합니다.',

			editorFormattingTitle: '서식 지정',
			editorFormattingSub: '저장 및 입력 시 소스 코드 서식 지정 규칙.',
			formatOnSave: '저장 시 서식 지정',
			formatOnSaveSub: '저장할 때 파일을 자동으로 포맷합니다.',
			formatMode: '저장 시 서식 모드',
			formatModeSub: '전체 파일을 포맷할지 수정된 부분만 포맷할지 제어합니다.',
			formatOnType: '입력 시 서식 지정',
			formatOnTypeSub: '입력 후 줄을 자동으로 포맷할지 제어합니다.',
			codeLens: 'CodeLens 표시',
			codeLensSub: '편집기에서 CodeLens를 표시할지 제어합니다.',
			diffTitle: 'Diff 편집기',
			diffSub: '비교 알고리즘, 장식 및 인라인 diff 보기.',
			diffAlgo: 'Diff 알고리즘',
			diffAlgoSub: '고급 또는 레거시 diff 알고리즘을 사용할지 제어합니다.',
			showEmptyDeco: '빈 장식 표시',
			showMoves: '이동 감지 표시',
			useInlineView: '인라인 뷰 사용',
			hideUnchanged: '변경되지 않은 영역 숨기기',
			agentSafetyTitle: 'Agent 보호: Yana-AI',
			agentSafetySub: 'AI 코딩 Agent 동작, 영향 반경 제한 및 승인 정책.',
			requireApproval: '파일 쓰기 시 사용자 승인 필요',
			requireApprovalSub: '모든 디스크 쓰기는 실행 전에 명시적으로 확인되어야 합니다.',
			blastRadius: '영향 반경 경고 제한',
			blastRadiusSub: 'Agent 명령 또는 편집이 동시에 이 수 이상의 파일을 건드릴 때 경고합니다.',

			pendingApprovals: '대기 중인 승인',
			pendingApprovalsSub: 'yana-rt authority pending-approvals에서 가져옵니다. 채팅 패널에서 승인하거나 거부하십시오.',
			nothingPending: '승인을 기다리는 항목이 없습니다.',
			leasesTitle: '기능 임대 (Capability Leases)',
			leasesSub: 'yana-rt lease를 통해 부여된 기한부 권한입니다. 취소는 다음 확인 시 적용됩니다.',
			noLeases: '부여된 임대가 없습니다.',
			revoke: '취소',

			discordTitle: 'Discord',
			discordSub: '인증된 채팅 전용. 저장소, Git 및 도구 기능은 노출되지 않습니다.',
			mcpTitle: 'Model Context Protocol (MCP)',
			mcpSub: 'stdio 기반 MCP. 모든 변경은 제어되며 승인 전용 작업은 차단됩니다.',
			externalToolsTitle: '이 컴퓨터의 다른 AI 도구',
			externalToolsSub: 'PATH에서 감지됨. 자체 터미널에서 실행되며 Yana 증거로 취급되지 않습니다.',
			openInTerminal: '터미널에서 열기',
			notInstalled: '설치되지 않음',

			commandsTitle: 'Yana 시스템 명령',
			searchCommands: '시스템 명령 검색…',
			copy: '복사',
			insertTerminal: '터미널에 삽입',

			dataTitle: '개인정보 및 로컬 데이터',
			dataSub: '파일 수와 크기만 계산합니다. 이 페이지는 파일 내용을 절대 읽지 않습니다.',
			projectState: '프로젝트 상태 (.yana-ai/)',
			extensionData: 'IDE 내 Yana 확장 데이터',
			projectMemory: '채팅마다 전송되는 프로젝트 메모리',
			savedTokens: '저장된 토큰 레코드',
			openMemory: '메모리 열기',
			writeMemory: '새로 작성',

			usageTitle: '토큰 사용량',
			usageSub: 'IDE에서 각 채팅 턴 후 yana-rt를 통해 제공자가 보고한 토큰 통계입니다.',
			usageOverviewTitle: '토큰 사용량 개요',
			usageOverviewSub: 'AI 어시스턴트의 각 작업 세션별로 로컬에 기록된 토큰 수입니다.',
			thisWorkspace: '현재 작업 영역',
			allProjects: '모든 프로젝트',
			workspaceTokensDetail: '{0} 입력 · {1} 출력 · {2}회 턴',
			usageRatioTitle: '입력 및 출력 토큰 비율',
			usageRatioSub: '입력 컨텍스트 토큰과 AI 모델이 생성한 출력 토큰의 분포입니다.',
			inputTokens: '입력 토큰 (컨텍스트)',
			outputTokens: '출력 토큰 (생성)',
			usageByModelTitle: '제공자 및 모델별 세부 정보',
			usageByModelSub: '각 모델의 대화 횟수와 소비된 토큰에 대한 세부 통계입니다.',
			turnsUnit: '회',
			lastRecorded: '마지막 기록: {0}',
			honestTelemetryNote: '토큰 지표는 yana-rt를 통해 모델 API 원격 측정 응답에서 직접 캡처되며, 중개 서버 없이 프라이빗하게 유지됩니다.',
			usageEmpty: '아직 기록된 채팅 턴이 없습니다. Yana AI 패널에서 메시지를 보내면 여기에 토큰 수가 표시됩니다.',
			openChatPanel: 'Yana AI 채팅 패널 열기',
			backToModels: '← 모델로 돌아가기',
		},
		en: {
			accountCardTitle: 'Account & Workspace Identity',
			accountCardSub: 'Yana Studio operates in local-first mode with zero telemetry and no mandatory cloud accounts.',
			workspaceIdentity: 'Workspace Identity',
			workspaceIdentitySub: 'Local Developer (no cloud tracking or forced login)',
			localPrivate: 'Local / Private',
			credentialVault: 'Credential Vault',
			credentialVaultSub: 'Stored securely in the OS Keychain through IDE SecretStorage.',
			manageKeys: 'Manage keys',
			displayLang: 'Display Language',
			changeLang: 'Change language',
			activeWorkspace: 'Active Workspace',
			singleFile: 'Single file mode',
			trusted: 'Trusted',
			active: 'Active',
			current: 'Current:',

			generalLangTitle: 'Display Language',
			generalLangSub: 'Select the interface language for Yana Studio and code assistance.',
			generalTitle: 'General Settings',
			generalSub: 'Workspace behavior, telemetry, and file safety.',
			autoSave: 'Files: Auto Save',
			autoSaveSub: 'Controls how dirty files are automatically saved.',
			confirmDelete: 'Confirm Before Delete',
			confirmDeleteSub: 'Ask for confirmation before moving files or folders to trash.',
			telemetry: 'Telemetry Level',
			telemetrySub: 'Yana Studio operates in privacy-first mode.',

			appearanceTitle: 'Appearance',
			appearanceSub: 'The theme controls the colors of the whole IDE, including the Yana panels.',
			yanaDarkSub: 'Cockpit palette: base #0c0e12, editor #12151c, accent #4f80ff.',
			yanaOtherSub: 'Same palette for light mode and high contrast. Pick them in the theme picker.',
			chooseTheme: 'Choose theme',
			useYanaDark: 'Use Yana Dark',
			useYanaWeb: 'Use Yana Web',
			yanaWebSub: 'Official yana.vutam.link homepage aesthetic — minimalist, clean white design.',
			useYanaLight: 'Use Yana Light',
			yanaLightSub: 'Clean and bright aesthetic for daytime productivity.',
			useYanaHc: 'Use High Contrast',
			yanaHcSub: 'Maximum contrast and distinct borders for accessibility.',

			rulesTitle: 'Yana Rules & Safety Gates',
			rulesSub: '{0} system rules enforce verification before claims.',
			enforced: 'Enforced',
			skillsTitle: 'Skills Catalog',
			skillsSub: '{0} skills indexed for architecture, testing, refactoring, and AI tasks.',
			activeSkills: 'Active Workspace Skills',
			skillsDir: 'Skills Directory',
			inspectMemory: 'Inspect Memory',
			instructionsTitle: 'Agent Instructions',
			instructionsSub: 'Operating guidelines for AI assistants working in this workspace.',
			agentsMdFile: 'AGENTS.md Policy File',
			agentsMdActive: 'Active in workspace root',
			agentsMdMissing: 'Not found in root',
			truthGateTitle: 'Truth Gate Rules',
			truthGateSub: 'gates/truth_gate.md — No claim without concrete evidence.',
			copyPath: 'Copy path',

			browserTitle: 'Browser & Preview',
			browserSub: 'Web preview configuration and local debugging.',
			previewTarget: 'Preview Target',
			previewTargetSub: 'Where to open web preview pages.',
			debugPort: 'Remote Debug Port',
			debugPortSub: 'Port for automated browser testing and inspector.',

			tabTitle: 'Tab Autocomplete',
			tabSub: 'Inline code suggestions while typing in the editor.',
			inlineSuggest: 'Inline Suggestions',
			inlineSuggestSub: 'Show inline completions automatically as you type.',
			quickSuggest: 'Quick Suggestions',
			quickSuggestSub: 'Show suggestions popover while typing words, strings, and comments.',

			editorFormattingTitle: 'Formatting',
			editorFormattingSub: 'Source code formatting rules on save and typing.',
			formatOnSave: 'Format On Save',
			formatOnSaveSub: 'Automatically format files when saved.',
			formatMode: 'Format On Save Mode',
			formatModeSub: 'Controls if format on save formats the whole file or only modifications.',
			formatOnType: 'Format On Type',
			formatOnTypeSub: 'Controls whether the editor should automatically format the line after typing.',
			codeLens: 'Code Lens',
			codeLensSub: 'Controls whether the editor shows CodeLens.',
			diffTitle: 'Diff Editor',
			diffSub: 'Comparison algorithms, decorations, and inline diff view.',
			diffAlgo: 'Diff Algorithm',
			diffAlgoSub: 'Controls whether the diff editor uses an advanced or legacy algorithm.',
			showEmptyDeco: 'Experimental: Show Empty Decorations',
			showMoves: 'Experimental: Show Moves',
			useInlineView: 'Experimental: Use True Inline View',
			hideUnchanged: 'Hide Unchanged Regions',
			agentSafetyTitle: 'Agent: Yana-AI',
			agentSafetySub: 'AI coding agent behavior, blast radius limits, and approval policies.',
			requireApproval: 'Require Human Approval For File Writes',
			requireApprovalSub: 'Every disk write or modification must be explicitly confirmed by you before execution.',
			blastRadius: 'Blast Radius Warning Limit',
			blastRadiusSub: 'Warn when an agent command or edit touches more than this number of files at once.',

			pendingApprovals: 'Pending approvals',
			pendingApprovalsSub: 'From yana-rt authority pending-approvals. Approve or deny them in the chat panel.',
			nothingPending: 'Nothing is waiting for approval.',
			leasesTitle: 'Capability leases',
			leasesSub: 'Time-boxed authority granted through yana-rt lease. Revoking takes effect on the next authority check.',
			noLeases: 'No leases granted.',
			revoke: 'Revoke',

			discordTitle: 'Discord',
			discordSub: 'Authenticated chat only. Repository, Git, process and tool capabilities are never exposed to Discord.',
			mcpTitle: 'MCP',
			mcpSub: 'MCP over stdio. Workspace changes stay governed and approval-only operations stay denied.',
			externalToolsTitle: 'Other AI tools on this machine',
			externalToolsSub: 'Found on PATH. They run in your own terminal; their output is never treated as Yana evidence.',
			openInTerminal: 'Open in terminal',
			notInstalled: 'Not installed',

			commandsTitle: 'Yana commands',
			searchCommands: 'Search commands…',
			copy: 'Copy',
			insertTerminal: 'Insert into terminal',

			dataTitle: 'Privacy & Data',
			dataSub: 'Counts files and sizes only. This page never reads file contents.',
			projectState: 'Project state (.yana-ai/)',
			extensionData: 'Yana extension data in the IDE',
			projectMemory: 'Project Memory sent with every chat turn',
			savedTokens: 'Saved token records',
			openMemory: 'Open',
			writeMemory: 'Write',

			usageTitle: 'Token Usage',
			usageSub: 'Tokens reported by the provider through yana-rt, recorded after each chat turn in the IDE.',
			usageOverviewTitle: 'Token Usage Overview',
			usageOverviewSub: 'Number of tokens recorded locally for each AI assistant session.',
			thisWorkspace: 'This workspace',
			allProjects: 'All projects',
			workspaceTokensDetail: '{0} input · {1} output · {2} turns',
			usageRatioTitle: 'Input & Output Token Ratio',
			usageRatioSub: 'Distribution between input context tokens and tokens generated by the AI model.',
			inputTokens: 'Input tokens (Context)',
			outputTokens: 'Output tokens (Generated)',
			usageByModelTitle: 'By Provider & Model',
			usageByModelSub: 'Detailed round count and token consumption for each AI model.',
			turnsUnit: 'turns',
			lastRecorded: 'Last recorded: {0}',
			honestTelemetryNote: 'Token metrics are captured directly from model API telemetry via yana-rt with zero intermediate proxies and are not used for billing.',
			usageEmpty: 'No chat turns recorded yet. Send a message in the Yana AI panel and its token count appears here.',
			openChatPanel: 'Open chat panel',
			backToModels: '← Back to Models',
		}
	};

	function tr(key, ...args) {
		const lang = window.YanaUI.currentLang || 'en';
		const dict = TAB_I18N[lang] || TAB_I18N.en;
		let val = dict[key] || TAB_I18N.en[key] || key;
		for (let i = 0; i < args.length; i++) {
			val = val.replace(`{${i}}`, args[i]);
		}
		return val;
	}

	function item(title, detail, right) {
		const row = el('div', 'item');
		const text = el('div');
		text.append(el('div', '', title));
		if (detail) text.append(el('div', 'muted', detail));
		row.append(text);
		if (right) row.append(right);
		return row;
	}

	function list(rows) {
		const node = el('div', 'list');
		node.append(...rows);
		return node;
	}

	tabs.account = data => {
		const node = card(tr('accountCardTitle'), tr('accountCardSub'));
		const curLang = data.language || window.YanaUI.currentLang || 'en';
		const langName = curLang === 'vi' ? 'Tiếng Việt 🇻🇳' : curLang === 'ko' ? '한국어 🇰🇷' : 'English 🇺🇸';

		node.append(list([
			item(tr('workspaceIdentity'), tr('workspaceIdentitySub'), badge(tr('localPrivate'), 'ok')),
			item(tr('credentialVault'), tr('credentialVaultSub'), button(tr('manageKeys'), '', () => window.YanaUI.select('models'))),
			item(tr('displayLang'), `${tr('current')} ${langName}`, button(tr('changeLang'), '', () => window.YanaUI.select('general'))),
			item(tr('activeWorkspace'), data.workspaces?.length ? (data.workspaces[0].name || data.workspaces[0].path) : tr('singleFile'), badge(data.workspaces?.[0]?.isTrusted ? tr('trusted') : tr('active'), 'ok')),
		]));
		return node;
	};

	tabs.appearance = data => {
		const usingYana = YANA_THEMES.includes(data.colorTheme);
		const node = card(tr('appearanceTitle'), tr('appearanceSub'), badge(data.colorTheme || 'default', usingYana ? 'ok' : ''));
		node.append(list([
			item('Yana Dark (Cockpit)', tr('yanaDarkSub'), button(data.colorTheme === 'Yana Dark' ? tr('active') : tr('useYanaDark'), data.colorTheme === 'Yana Dark' ? '' : 'primary', () => request('useYanaTheme', {}))),
			item('Yana Web (yana.vutam.link)', tr('yanaWebSub'), button(data.colorTheme === 'Yana Web (vutam.link)' ? tr('active') : tr('useYanaWeb'), data.colorTheme === 'Yana Web (vutam.link)' ? '' : 'primary', () => request('useYanaWebTheme', {}))),
			item('Yana Light', tr('yanaLightSub'), button(data.colorTheme === 'Yana Light' ? tr('active') : tr('useYanaLight'), '', () => request('useYanaLightTheme', {}))),
			item('Yana High Contrast', tr('yanaHcSub'), button(data.colorTheme === 'Yana High Contrast' ? tr('active') : tr('useYanaHc'), '', () => request('useYanaHcTheme', {}))),
			item(tr('chooseTheme'), tr('yanaOtherSub'), button(tr('chooseTheme'), '', () => request('pickTheme', {}))),
		]));
		return node;
	};

	function barRow(label, value, total) {
		const percent = total ? Math.round((value / total) * 100) : 0;
		const row = el('div', 'spread');
		const bar = el('div', 'bar');
		bar.style.flex = '1';
		bar.style.margin = '0 16px';
		const fill = el('span');
		fill.style.width = `${percent}%`;
		bar.append(fill);
		const valSpan = el('span', 'mono', `${number(value)} · ${percent}%`);
		valSpan.style.minWidth = '110px';
		valSpan.style.textAlign = 'right';
		row.append(el('span', '', label), bar, valSpan);
		return row;
	}

	tabs.usage = data => {
		if (!data || !data.all?.rounds) {
			const node = card(tr('usageTitle'), tr('usageSub'));
			const emptyBox = el('div', 'empty', tr('usageEmpty'));
			const actions = el('div', 'row');
			actions.append(
				button(tr('openChatPanel'), 'primary', () => request('openChat', {})),
				button(tr('backToModels'), '', () => window.YanaUI.select('models'))
			);
			node.append(emptyBox, actions);
			return node;
		}

		// Card 1: Overview
		const lastBadge = data.lastRecordedAt
			? badge(tr('lastRecorded', new Date(data.lastRecordedAt).toLocaleDateString(window.YanaUI.currentLang === 'vi' ? 'vi-VN' : window.YanaUI.currentLang === 'ko' ? 'ko-KR' : 'en-US')), 'ok')
			: null;
		const overviewCard = card(tr('usageOverviewTitle'), tr('usageOverviewSub'), lastBadge);
		const stats = el('div', 'grid2');
		for (const [label, total] of [[tr('thisWorkspace'), data.workspace || { total: 0, input: 0, output: 0, rounds: 0 }], [tr('allProjects'), data.all]]) {
			const box = el('div', 'box');
			box.append(
				el('div', 'muted', label),
				el('div', 'stat', number(total.total)),
				el('div', 'muted', tr('workspaceTokensDetail', number(total.input), number(total.output), number(total.rounds)))
			);
			stats.append(box);
		}
		overviewCard.append(stats);

		// Card 2: Ratio
		const ratioCard = card(tr('usageRatioTitle'), tr('usageRatioSub'));
		ratioCard.append(
			barRow(tr('inputTokens'), data.all.input, data.all.total),
			barRow(tr('outputTokens'), data.all.output, data.all.total),
			notice(tr('honestTelemetryNote'))
		);

		// Card 3: Breakdown by Provider & Model
		const modelsCard = card(tr('usageByModelTitle'), tr('usageByModelSub'));
		const modelsList = list((data.models || []).map(m => item(
			m.model,
			`${m.provider} · ${number(m.rounds)} ${tr('turnsUnit')} · ${number(m.input)} in / ${number(m.output)} out`,
			el('span', 'badge ok mono', `${number(m.total)} tokens`)
		)));
		modelsCard.append(modelsList);

		return [overviewCard, ratioCard, modelsCard];
	};

	tabs.connections = data => {
		const node = card('Integrations & Connections', 'Local environment, version control, and AI runtime integration status.');
		node.append(list([
			item('Source Control (Git)', 'Native Git integration with workspace branch tracking and commit signing.', badge('Native Git', 'ok')),
			item('Model Providers & Catalogs', 'Direct HTTPS endpoints for OpenAI, Anthropic, Gemini, DeepSeek, and local Ollama.', button('Configure Models', '', () => window.YanaUI.select('models'))),
			item('Model Context Protocol (MCP)', 'Stdio-based tool protocol with security lease enforcement.', badge(data?.runtime?.runtime?.mcp ? 'Available' : 'Stdio Ready', 'ok')),
			item('Local AI Tool Discovery', 'Detected CLI tools on PATH (Claude, Gemini, Antigravity, Codex).', button('Inspect Tools', '', () => window.YanaUI.select('tools'))),
		]));
		return node;
	};

	tabs.permissions = data => {
		const approvals = card(tr('pendingApprovals'), tr('pendingApprovalsSub'));
		approvals.append(data.approvalsError ? notice(data.approvalsError, true)
			: data.approvals.length ? list(data.approvals.map(a => item(a.capability || a.approval_id, a.reason || a.expires_at || '', badge('Pending', 'warn'))))
				: el('div', 'empty', tr('nothingPending')));
		const leases = card(tr('leasesTitle'), tr('leasesSub'));
		leases.append(data.leasesError ? notice(data.leasesError, true)
			: data.leases.length ? list(data.leases.map(l => item(l.capability || l.id, `${l.subject || ''} · expires ${l.expires_at || '?'}`, button(tr('revoke'), 'danger', () => request('revokeLease', { id: l.id })))))
				: el('div', 'empty', tr('noLeases')));
		return [approvals, leases];
	};

	tabs.tools = data => {
		const discord = card(tr('discordTitle'), tr('discordSub'),
			badge(data.runtime.discord ? 'Available in runtime' : 'Not in this runtime', data.runtime.discord ? 'ok' : ''));
		discord.append(list([
			item('Bot token', null, el('span', 'mono', data.discord.configured ? 'set (hidden)' : 'not set')),
			item('Allowed channels', null, el('span', 'mono', data.discord.channels)),
			item('Allowed users', null, el('span', 'mono', data.discord.users)),
		]));
		const mcp = card(tr('mcpTitle'), tr('mcpSub'),
			badge(data.runtime.mcp ? 'Available in runtime' : 'Not in this runtime', data.runtime.mcp ? 'ok' : ''));
		mcp.append(el('div', 'box mono', 'yana-rt mcp'));
		const external = card(tr('externalToolsTitle'), tr('externalToolsSub'));
		const grid = el('div', 'grid3');
		grid.append(...data.externalTools.map(tool => {
			const box = el('div', 'box');
			box.append(el('div', '', tool.label), el('div', 'mono muted', tool.available ? tool.path : 'Not found'),
				tool.available ? button(tr('openInTerminal'), '', () => request('openToolTerminal', { command: tool.command })) : badge(tr('notInstalled')));
			return box;
		}));
		external.append(grid);
		return [discord, mcp, external];
	};

	tabs.commands = data => {
		const node = card(tr('commandsTitle'), data.source ? `${data.commands.length} commands from COMMANDS.md` : data.error);
		if (!data.commands?.length) {
			node.append(el('div', 'empty', 'Open the Yana-AI folder (it contains COMMANDS.md) to see the command reference.'));
			return node;
		}
		const search = el('input');
		search.type = 'search';
		search.placeholder = tr('searchCommands');
		const table = el('table');
		const head = el('tr');
		head.append(el('th', '', 'Command'), el('th', '', 'Description'), el('th', '', ''));
		table.append(head);
		const rows = data.commands.map(entry => {
			const row = el('tr');
			const actions = el('td');
			const buttons = el('div', 'row');
			buttons.append(button(tr('copy'), '', () => request('copy', { text: entry.command })),
				button(tr('insertTerminal'), '', () => request('fillTerminal', { command: entry.command })));
			actions.append(buttons);
			row.append(el('td', 'mono', entry.command), el('td', 'muted', `${entry.category} · ${entry.description}`), actions);
			row.dataset.search = `${entry.command} ${entry.category} ${entry.description}`.toLowerCase();
			return row;
		});
		table.append(...rows);
		search.addEventListener('input', () => {
			const query = search.value.trim().toLowerCase();
			for (const row of rows) row.hidden = Boolean(query) && !row.dataset.search.includes(query);
		});
		node.append(search, table);
		return node;
	};

	tabs.data = data => {
		const node = card(tr('dataTitle'), tr('dataSub'));
		node.append(el('div', 'stat', bytes(data.project.bytes + data.extension.bytes)), list([
			item(tr('projectState'), data.root || 'No folder open', el('span', 'mono', `${number(data.project.files)} files · ${bytes(data.project.bytes)}`)),
			item(tr('extensionData'), 'Holds no API keys: keys live in the Keychain.', el('span', 'mono', `${number(data.extension.files)} files · ${bytes(data.extension.bytes)}`)),
			item(tr('projectMemory'), null, button(data.memoryBytes ? `${bytes(data.memoryBytes)} · ${tr('openMemory')}` : `Empty · ${tr('writeMemory')}`, '', () => request('openMemory', {}))),
			item(tr('savedTokens'), null, el('span', 'mono', number(data.usageRecords))),
			item('Workspace State & Memory', 'Stored inside .yana-ai/ and memory/ in the project root. Fully versioned with Git.', badge('Git Tracked', 'ok')),
		]));
		return node;
	};

	tabs.editor = data => {
		const statusNotice = el('div');
		const notify = (msg, isErr) => {
			statusNotice.replaceChildren(notice(msg, isErr));
			setTimeout(() => statusNotice.replaceChildren(), 3000);
		};

		const saveSetting = async (section, key, value) => {
			const res = await request('updateSetting', { section, key, value });
			if (res?.ok) notify(`Saved: ${key}`, false);
			else notify(res?.error || 'Failed to update setting', true);
		};

		const formatting = card(tr('editorFormattingTitle'), tr('editorFormattingSub'));
		const modeSelect = el('select');
		for (const [val, lbl] of [['file', 'file'], ['modifications', 'modifications'], ['modificationsIfAvailable', 'modificationsIfAvailable']]) {
			const opt = el('option', '', lbl);
			opt.value = val;
			opt.selected = val === data.formatOnSaveMode;
			modeSelect.append(opt);
		}
		modeSelect.style.width = '180px';
		modeSelect.addEventListener('change', () => saveSetting('editor', 'formatOnSaveMode', modeSelect.value));

		formatting.append(list([
			item(tr('formatOnSave'), tr('formatOnSaveSub'), window.YanaUI.toggle(data.formatOnSave, val => saveSetting('editor', 'formatOnSave', val))),
			item(tr('formatMode'), tr('formatModeSub'), modeSelect),
			item(tr('formatOnType'), tr('formatOnTypeSub'), window.YanaUI.toggle(data.formatOnType, val => saveSetting('editor', 'formatOnType', val))),
			item(tr('codeLens'), tr('codeLensSub'), window.YanaUI.toggle(data.codeLens, val => saveSetting('editor', 'codeLens', val))),
		]));

		const diffCard = card(tr('diffTitle'), tr('diffSub'));
		const algoSelect = el('select');
		for (const [val, lbl] of [['advanced', 'advanced'], ['legacy', 'legacy']]) {
			const opt = el('option', '', lbl);
			opt.value = val;
			opt.selected = val === data.diffAlgorithm;
			algoSelect.append(opt);
		}
		algoSelect.style.width = '140px';
		algoSelect.addEventListener('change', () => saveSetting('diffEditor', 'algorithm', algoSelect.value));

		diffCard.append(list([
			item(tr('diffAlgo'), tr('diffAlgoSub'), algoSelect),
			item(tr('showEmptyDeco'), '', window.YanaUI.toggle(data.showEmptyDecorations, val => saveSetting('diffEditor', 'experimental.showEmptyDecorations', val))),
			item(tr('showMoves'), '', window.YanaUI.toggle(data.showMoves, val => saveSetting('diffEditor', 'experimental.showMoves', val))),
			item(tr('useInlineView'), '', window.YanaUI.toggle(data.useInlineView, val => saveSetting('diffEditor', 'useInlineViewWhenSpaceIsLimited', val))),
			item(tr('hideUnchanged'), '', window.YanaUI.toggle(data.hideUnchangedEnabled, val => saveSetting('diffEditor', 'hideUnchangedRegions.enabled', val))),
		]));

		const agentCard = card(tr('agentSafetyTitle'), tr('agentSafetySub'), badge(tr('active'), 'ok'));
		agentCard.append(notice(data.agent?.disclaimer || 'AI may make mistakes. Double-check all generated code.'));

		const blastInput = el('input');
		blastInput.type = 'number';
		blastInput.min = '1';
		blastInput.max = '50';
		blastInput.value = data.agent?.blastRadiusLimit ?? 5;
		blastInput.addEventListener('change', () => saveSetting('yana', 'guardrails.blastRadiusLimit', Number(blastInput.value)));

		agentCard.append(list([
			item(tr('requireApproval'), tr('requireApprovalSub'), window.YanaUI.toggle(data.agent?.requireApprovalForWrites, val => saveSetting('yana', 'guardrails.requireApprovalForWrites', val))),
			item(tr('blastRadius'), tr('blastRadiusSub'), blastInput),
		]));

		return [statusNotice, formatting, diffCard, agentCard];
	};

	tabs.customizations = data => {
		const rulesCard = card(tr('rulesTitle'), tr('rulesSub', data.rulesCount), badge(tr('enforced'), 'ok'));
		rulesCard.append(list((data.rules || []).map(r => item(r.name, r.desc, badge(r.id, 'info')))));

		const skillsCard = card(tr('skillsTitle'), tr('skillsSub', number(data.skillsCount)));
		skillsCard.append(list([
			item(tr('activeSkills'), data.root, badge(`${number(data.skillsCount)} skills`, data.skillsCount ? 'ok' : 'warn')),
			item(tr('skillsDir'), '.agents/skills/ & core/skills/', button(tr('inspectMemory'), '', () => request('openMemory', {}))),
		]));

		const instructionsCard = card(tr('instructionsTitle'), tr('instructionsSub'));
		instructionsCard.append(list([
			item(tr('agentsMdFile'), data.hasAgentsMd ? tr('agentsMdActive') : tr('agentsMdMissing'), badge(data.hasAgentsMd ? tr('active') : 'Missing', data.hasAgentsMd ? 'ok' : 'warn')),
			item(tr('truthGateTitle'), tr('truthGateSub'), button(tr('copyPath'), '', () => request('copy', { text: 'gates/truth_gate.md' }))),
		]));

		return [rulesCard, skillsCard, instructionsCard];
	};

	tabs.general = data => {
		const save = (section, key, val) => request('updateSetting', { section, key, value: val });
		const curLang = data.language || window.YanaUI.currentLang || 'en';

		// Card 1: Language Switcher
		const langCard = card(tr('generalLangTitle'), tr('generalLangSub'));
		const chips = el('div', 'chips');
		const languages = [
			{ id: 'vi', label: 'Tiếng Việt 🇻🇳' },
			{ id: 'en', label: 'English 🇺🇸' },
			{ id: 'ko', label: '한국어 🇰🇷' },
		];
		for (const itemLang of languages) {
			const isSel = curLang === itemLang.id;
			const chip = el('button', `chip ${isSel ? 'active' : ''}`.trim(), itemLang.label);
			chip.type = 'button';
			chip.addEventListener('click', async () => {
				await request('setLanguage', { lang: itemLang.id });
			});
			chips.append(chip);
		}
		langCard.append(chips);

		// Card 2: General settings
		const autoSaveSelect = el('select');
		for (const val of ['off', 'afterDelay', 'onFocusChange', 'onWindowChange']) {
			const opt = el('option', '', val);
			opt.value = val;
			opt.selected = val === data.autoSave;
			autoSaveSelect.append(opt);
		}
		autoSaveSelect.style.width = '160px';
		autoSaveSelect.addEventListener('change', () => save('files', 'autoSave', autoSaveSelect.value));

		const node = card(tr('generalTitle'), tr('generalSub'));
		node.append(list([
			item(tr('autoSave'), tr('autoSaveSub'), autoSaveSelect),
			item(tr('confirmDelete'), tr('confirmDeleteSub'), window.YanaUI.toggle(data.confirmDelete, val => save('explorer', 'confirmDelete', val))),
			item(tr('telemetry'), tr('telemetrySub'), badge(data.telemetryLevel || 'off', 'ok')),
		]));
		return [langCard, node];
	};

	tabs.browser = data => {
		const node = card(tr('browserTitle'), tr('browserSub'));
		node.append(list([
			item(tr('previewTarget'), tr('previewTargetSub'), badge(data.previewMode || 'internal-webview', 'info')),
			item(tr('debugPort'), tr('debugPortSub'), el('span', 'mono', String(data.debugPort || 9222))),
		]));
		return node;
	};

	tabs.tab = data => {
		const save = (section, key, val) => request('updateSetting', { section, key, value: val });
		const node = card(tr('tabTitle'), tr('tabSub'));
		node.append(list([
			item(tr('inlineSuggest'), tr('inlineSuggestSub'), window.YanaUI.toggle(data.inlineSuggest, val => save('editor', 'inlineSuggest.enabled', val))),
			item(tr('quickSuggest'), tr('quickSuggestSub'), window.YanaUI.toggle(data.quickSuggestions, val => save('editor', 'quickSuggestions', val))),
		]));
		return node;
	};
})();
