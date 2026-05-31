#!/usr/bin/env python3
"""Patch codexmate global install to add Vietnamese (vi) language support."""
import os, re, sys
from pathlib import Path

def find_codexmate() -> Path:
    candidates = [
        # 1. global npm install
        Path(os.popen("npm root -g 2>/dev/null").read().strip()) / "codexmate",
        # 2. standalone installer (~/.codexmate)
        Path.home() / ".codexmate",
        # 3. local submodule (tools/codexmate/ relative to this script)
        Path(__file__).resolve().parent.parent / "codexmate",
        # 4. npm link / local dev install
        Path(os.popen("npm root 2>/dev/null").read().strip()) / "codexmate",
    ]
    for c in candidates:
        if c.exists() and (c / "web-ui").exists():
            print(f"Found codexmate at: {c}")
            return c
    paths = "\n  ".join(str(c) for c in candidates)
    sys.exit(
        f"codexmate not found. Tried:\n  {paths}\n"
        "Install options:\n"
        "  npm install -g codexmate\n"
        "  or run the standalone installer: tools/codexmate/scripts/install.sh"
    )

NODE_MODULES = find_codexmate()

WEB_UI = NODE_MODULES / "web-ui" / "modules"
I18N_MJS = WEB_UI / "i18n.mjs"
I18N_DICT = WEB_UI / "i18n.dict.mjs"
CSS_DIR = NODE_MODULES / "web-ui" / "styles"
CSS_SHELL = CSS_DIR / "layout-shell.css"

VI_DICT = '''    vi: {
        // Global
        'lang.zh': '中文',
        'lang.en': 'English',
        'lang.vi': 'Tiếng Việt',
        'lang.label': 'Ngôn ngữ',
        'nav.topTabs.aria': 'Điều hướng',

        // Common
        'common.all': 'Tất cả',
        'common.copy': 'Sao chép',
        'common.paste': 'Dán',
        'common.edit': 'Chỉnh sửa',
        'common.install': 'Cài đặt',
        'common.update': 'Cập nhật',
        'common.uninstall': 'Gỡ cài đặt',
        'common.official': 'Chính thức',
        'common.custom': 'Tùy chỉnh',
        'common.rules': 'Quy tắc',
        'common.troubleshooting': 'Xử lý sự cố',
        'common.command': 'Lệnh',
        'common.mirror': 'Registry',
        'common.packageManager': 'Trình quản lý gói',
        'common.action': 'Hành động',
        'common.targets': 'Mục tiêu',
        'common.currentPm': 'Trình quản lý gói',
        'common.currentAction': 'Hành động hiện tại',
        'common.mirrorActive': 'Registry',
        'common.defaultOfficial': 'Mặc định',
        'common.cancel': 'Hủy',
        'common.confirm': 'Xác nhận',
        'common.add': 'Thêm',
        'common.save': 'Lưu',
        'common.saveApply': 'Lưu & áp dụng',
        'common.close': 'Đóng',
        'common.delete': 'Xóa',
        'common.clear': 'Xóa trắng',
        'common.show': 'Hiện',
        'common.hide': 'Ẩn',
        'common.detail': 'Chi tiết',
        'common.refresh': 'Làm mới',
        'common.refreshing': 'Đang làm mới...',
        'common.loading': 'Đang tải...',
        'common.saving': 'Đang lưu...',
        'common.sending': 'Đang gửi...',
        'common.scanning': 'Đang quét...',
        'common.export': 'Xuất',
        'common.import': 'Nhập',
        'common.apply': 'Áp dụng',
        'common.applying': 'Đang áp dụng...',
        'common.confirming': 'Đang xác nhận...',
        'common.writeToEditor': 'Ghi vào trình soạn thảo',
        'common.refreshFromText': 'Làm mới từ văn bản',
        'common.backToEdit': 'Quay lại chỉnh sửa',
        'common.selectAll': 'Chọn tất cả',
        'common.unselectAll': 'Bỏ chọn tất cả',
        'common.resetFilters': 'Đặt lại bộ lọc',
        'common.notEditable': 'Không thể chỉnh sửa',
        'common.notDeletable': 'Không thể xóa',
        'common.notLoaded': 'Chưa tải',
        'common.exists': 'Đã tồn tại',
        'common.notExistsWillCreateOnApply': 'Không tìm thấy. Sẽ được tạo khi áp dụng.',
        'common.notExistsWillCreateOnSave': 'Không tìm thấy. Sẽ được tạo khi lưu.',
        'common.none': 'Không có',
        'cli.missing.title': '{name} CLI chưa được cài đặt',
        'cli.missing.subtitle': 'Hãy cài đặt {name} CLI trước khi dùng trang này.',
        'cli.missing.openDocs': 'Mở hướng dẫn cài đặt',
        'cli.missing.commandAria': 'Lệnh cài đặt {name} CLI',

        // Brand
        'brand.kicker.workspace': 'Không gian làm việc',
        'brand.subtitle.localConfigSessionsWorkspace': 'Quản lý cấu hình & phiên làm việc cục bộ',

        // Confirm dialog
        'confirm.aria': 'Xác nhận hành động',
        'confirm.title.default': 'Vui lòng xác nhận',
        'confirm.ok': 'Xác nhận',
        'confirm.cancel': 'Hủy',

        // Shared fields
        'field.name': 'Tên',
        'field.configName': 'Tên cấu hình',
        'field.apiEndpoint': 'API endpoint',
        'field.apiKey': 'API key',
        'field.baseUrl': 'Base URL',
        'field.provider': 'Nhà cung cấp',
        'field.providerName': 'Tên nhà cung cấp',
        'field.modelName': 'Tên model',
        'field.model': 'Model',
        'field.message': 'Tin nhắn',
        'field.varName': 'Tên biến',
        'field.targetFile': 'File đích',
        'field.modelId': 'Model ID',
        'field.displayName': 'Tên hiển thị',
        'field.contextAndMaxOutput': 'Context và đầu ra tối đa',
        'field.apiType': 'Loại API',
        'field.env': 'Biến môi trường',
        'field.allow': 'Cho phép',
        'field.deny': 'Từ chối',

        // Shared placeholders/hints
        'placeholder.providerNameExample': 'vd: myapi',
        'placeholder.apiEndpointExample': 'https://api.example.com/v1',
        'placeholder.providerName': 'Tên nhà cung cấp',
        'placeholder.keepUnchanged': 'Để trống để giữ nguyên',
        'hint.keepKeyUnchanged': 'Để trống để giữ key hiện tại',
        'placeholder.modelExample': 'vd: gpt-5',
        'placeholder.configNameExample': 'vd: Cấu hình Claude của tôi',
        'placeholder.apiKeyExampleClaude': 'sk-ant-...',
        'placeholder.baseUrlExampleClaude': 'https://open.bigmodel.cn/api/anthropic',
        'placeholder.selectProvider': 'Chọn nhà cung cấp',

        // Roles / labels
        'role.you': 'Bạn',
        'role.provider': 'Nhà cung cấp',
        'label.model': 'Model:',

        // Top tabs
        'tab.dashboard': 'Tổng quan',
        'tab.docs': 'Tài liệu',
        'tab.config': 'Cấu hình',
        'tab.config.codex': 'Codex',
        'tab.config.claude': 'Claude',
        'tab.config.openclaw': 'OpenClaw',
        'tab.sessions': 'Phiên làm việc',
        'tab.usage': 'Thống kê',
        'tab.orchestration': 'Tác vụ',
        'tab.market': 'Skills',
        'tab.plugins': 'Plugin',
        'tab.settings': 'Cài đặt',

        // Side rail section titles
        'side.overview': 'Tổng quan',
        'side.docs': 'Tài liệu',
        'side.config': 'Cấu hình',
        'side.sessions': 'Phiên làm việc',
        'side.plugins': 'Plugin',
        'side.system': 'Hệ thống',
        'side.orchestration': 'Tác vụ',
        'side.skills': 'Skills',

        // Side rail items
        'side.overview.doctor': 'Chẩn đoán',
        'side.overview.doctor.meta': 'Tổng quan / Chẩn đoán',
        'side.docs.cliInstall': 'Cài CLI',
        'side.docs.cliInstall.meta': 'Cài đặt / Cập nhật / Gỡ cài đặt',
        'side.config.codex': 'Codex',
        'side.config.codex.meta': 'Nhà cung cấp / Model',
        'side.config.claude': 'Claude Code',
        'side.config.claude.meta': 'Cài đặt Claude',
        'side.config.openclaw': 'OpenClaw',
        'side.config.openclaw.meta': 'JSON5 / AGENTS',
        'side.sessions.browser': 'Trình duyệt phiên',
        'side.sessions.browser.meta': 'Duyệt / Xuất / Dọn dẹp',
        'side.plugins.tools': 'Công cụ Prompt',
        'side.plugins.tools.meta': 'Template / Biến',
        'side.system.settings': 'Cài đặt Runtime',
        'side.system.settings.meta': 'Dữ liệu / Sao lưu',

        // Header titles
        'kicker.dashboard': 'Chẩn đoán',
        'kicker.config': 'Cấu hình',
        'kicker.sessions': 'Phiên làm việc',
        'kicker.usage': 'Thống kê',
        'kicker.orchestration': 'Tác vụ',
        'kicker.market': 'Skills',
        'kicker.plugins': 'Plugin',
        'kicker.docs': 'Tài liệu',
        'kicker.settings': 'Cài đặt',

        'title.dashboard': 'Tổng quan / Chẩn đoán',
        'title.config': 'Bảng điều khiển cấu hình cục bộ',
        'title.sessions': 'Phiên làm việc & Xuất dữ liệu',
        'title.usage': 'Thống kê & Xu hướng cục bộ',
        'title.orchestration': 'Điều phối tác vụ',
        'title.market': 'Cài đặt & Đồng bộ Skills',
        'title.plugins': 'Plugin & Template',
        'title.docs': 'Cài CLI & Tài liệu',
        'title.settings': 'Cài đặt hệ thống & Dữ liệu',

        'subtitle.dashboard': 'Trạng thái tổng hợp và chẩn đoán.',
        'subtitle.config': 'Quản lý cấu hình và model cục bộ.',
        'subtitle.sessions': 'Duyệt và xuất phiên làm việc.',
        'subtitle.usage': 'Xem thống kê 7/30 ngày gần đây.',
        'subtitle.orchestration': 'Lên kế hoạch, xếp hàng, chạy và xem lại tác vụ.',
        'subtitle.market': 'Quản lý skills cục bộ.',
        'subtitle.plugins': 'Quản lý template prompt và plugin tái sử dụng.',
        'subtitle.docs': 'Lệnh cài CLI và xử lý sự cố.',
        'subtitle.settings': 'Quản lý tải về, thư mục và thùng rác.',

        'dashboard.doctor.title': 'Chẩn đoán',
        'dashboard.doctor.runChecks': 'Chạy kiểm tra',
        'dashboard.doctor.checking': 'Đang kiểm tra...',
        'dashboard.doctor.export': 'Xuất báo cáo',
        'dashboard.doctor.export.json': 'Xuất JSON',
        'dashboard.doctor.export.md': 'Xuất Markdown',
        'dashboard.doctor.open': 'Mở',
        'doctor.action.openConfig': 'Mở cấu hình',
        'doctor.action.checkProvider': 'Kiểm tra cấu hình nhà cung cấp',
        'doctor.action.openUsage': 'Mở thống kê',
        'doctor.action.openSessions': 'Mở phiên làm việc',
        'doctor.action.openTasks': 'Mở tác vụ',
        'doctor.action.viewTaskLogs': 'Xem tác vụ / Log',
        'doctor.action.openSkills': 'Mở Skills',
        'doctor.issue.configNotReady.problem': 'Cấu hình chưa sẵn sàng',
        'doctor.issue.configNotReady.impact': 'Không thể đọc nhà cung cấp/model; danh sách model và yêu cầu có thể thất bại.',
        'doctor.issue.providerUnreachable.problem.remote-model-probe-unreachable': 'Nhà cung cấp không thể kết nối',
        'doctor.issue.providerUnreachable.problem.remote-model-probe-auth-failed': 'Xác thực nhà cung cấp thất bại',
        'doctor.issue.providerUnreachable.problem.remote-model-probe-not-found': 'Endpoint nhà cung cấp trả về 404',
        'doctor.issue.providerUnreachable.problem.remote-model-probe-http-error': 'Nhà cung cấp trả về lỗi HTTP',
        'doctor.issue.providerUnreachable.problem.remote-model-probe-error': 'Kiểm tra nhà cung cấp thất bại',
        'doctor.issue.providerUnreachable.problem.unknown': 'Nhà cung cấp không thể kết nối',
        'doctor.issue.providerUnreachable.impactAuth': 'Lỗi xác thực sẽ khiến danh sách model và yêu cầu trả về 401/403.',
        'doctor.issue.providerUnreachable.impactNetwork': 'Nhà cung cấp không thể kết nối sẽ khiến yêu cầu thất bại hoặc timeout.',
        'doctor.issue.configHealthFailed.problem': 'Kiểm tra sức khỏe cấu hình thất bại',
        'doctor.issue.configHealthFailed.impact': 'Một số tính năng có thể không khả dụng.',
        'doctor.issue.usageError.problem': 'Tổng hợp thống kê thất bại',
        'doctor.issue.usageError.impact': 'Biểu đồ thống kê có thể không khả dụng.',
        'doctor.issue.usageMissingModel.problem': 'Một số phiên thiếu metadata model',
        'doctor.issue.usageMissingModel.impact': 'Thống kê sử dụng và ước tính chi phí có thể không chính xác.',
        'doctor.issue.tasksError.problem': 'Tổng quan tác vụ thất bại',
        'doctor.issue.tasksError.impact': 'Hàng đợi tác vụ có thể không khả dụng.',
        'doctor.issue.tasksFailed.problem': 'Phát hiện tác vụ thất bại',
        'doctor.issue.tasksFailed.impact': 'Pipeline tự động có thể bị chặn; kiểm tra log và thử lại.',
        'doctor.issue.skillsError.problem': 'Liệt kê skills thất bại',
        'doctor.issue.skillsError.impact': 'Skills marketplace có thể không khả dụng.',
        'doctor.issue.skillsRootMissing.problem': 'Thư mục skills bị thiếu',
        'doctor.issue.skillsRootMissing.impact': 'Cài đặt/quét skills sẽ trống; tạo thư mục qua Cài đặt/Tài liệu.',
        'doctor.issue.skillsMissingFiles.problem': 'Một số skills thiếu skill.json',
        'doctor.issue.skillsMissingFiles.impact': 'Các skills đó có thể không chạy hoặc đồng bộ đúng cách.',
        'dashboard.card.config': 'Cấu hình',
        'dashboard.card.sessions': 'Phiên làm việc',
        'dashboard.card.usage': 'Thống kê',
        'dashboard.card.tasks': 'Tác vụ',
        'dashboard.card.skills': 'Skills',
        'dashboard.kv.model': 'Model',
        'dashboard.kv.issue': 'Vấn đề',
        'dashboard.kv.active': 'Hoạt động',
        'dashboard.kv.sessions': 'Phiên làm việc',
        'dashboard.kv.missingModel': 'Thiếu model',
        'dashboard.kv.blockers': 'Vấn đề chặn',
        'dashboard.kv.runs': 'Lần chạy',
        'dashboard.kv.target': 'Mục tiêu',
        'dashboard.kv.root': 'Thư mục gốc',
        'dashboard.status.health': 'Sức khỏe',
        'dashboard.status.busy': 'Đang bận',
        'dashboard.status.models': 'Models',
        'dashboard.busy.init': 'Khởi tạo',
        'dashboard.busy.sessions': 'Phiên làm việc',
        'dashboard.busy.models': 'Models',
        'dashboard.busy.configApply': 'Áp dụng cấu hình',
        'dashboard.busy.agents': 'Đang lưu agents',
        'dashboard.busy.skills': 'Skills',
        'dashboard.busy.tasks': 'Tác vụ',
        'dashboard.busy.idle': 'Rảnh',
        'dashboard.message.none': 'Không có tin nhắn',
        'dashboard.sessionSource.codex': 'Codex',
        'dashboard.sessionSource.claude': 'Claude Code',
        'dashboard.sessionSource.gemini': 'Gemini CLI',
        'dashboard.sessionSource.codebuddy': 'CodeBuddy Code',
        'dashboard.sessionSource.all': 'Tất cả',
        'dashboard.sessionPath.all': 'Tất cả đường dẫn',
        'dashboard.sessionQuery.unsupported': 'Nguồn không được hỗ trợ',
        'dashboard.sessionQuery.unset': 'Chưa đặt',
        'dashboard.healthStatus.failRead': 'Thất bại',
        'dashboard.healthStatus.initializing': 'Đang khởi tạo',
        'dashboard.healthStatus.ok': 'Tốt',
        'dashboard.modelStatus.loading': 'Đang tải',
        'dashboard.modelStatus.error': 'Lỗi',
        'dashboard.modelStatus.ok': 'Tốt',
        'dashboard.health.ok': 'Kiểm tra thành công',
        'dashboard.health.fail': 'Kiểm tra thất bại',
        'dashboard.health.issues': '{count} vấn đề',
        'dashboard.issues.title': '{count} vấn đề cần xử lý',
        'dashboard.state.loading': 'Đang tải',
        'dashboard.state.ready': 'Sẵn sàng',
        'dashboard.state.idle': 'Rảnh',
        'dashboard.none': 'Không có',
        'dashboard.sessions.count': '{count} phiên',
        'dashboard.usage.range': 'Phạm vi {value}',
        'dashboard.tasks.queue': 'chạy {running} / hàng đợi {queued}',
        'dashboard.skills.count': 'đã cài {installed} / có thể nhập {importable}',
        'dashboard.providersHealth.title': 'Sức khỏe nhà cung cấp',
        'dashboard.providersHealth.current': '(hiện tại)',
        'dashboard.providersHealth.checking': 'Đang kiểm tra...',
        'dashboard.providersHealth.allOk': 'Tất cả nhà cung cấp hoạt động tốt',
        'dashboard.providersHealth.hasIssues': '{count} nhà cung cấp có vấn đề',

        // Plugins panel
        'plugins.sidebar.title': 'Plugin',
        'plugins.sidebar.note': 'Tiện ích tái sử dụng, chuẩn hóa.',
        'plugins.sidebar.ariaList': 'Danh sách plugin',
        'plugins.main.ariaWorkspace': 'Không gian làm việc plugin',
        'plugins.refresh': 'Làm mới',
        'plugins.refreshing': 'Đang làm mới...',
        'plugins.promptTemplates.title': 'Template prompt',
        'plugins.promptTemplates.subtitle': 'Tích hợp sẵn: cải thiện comment ({{code}}). Sao chép và dán vào Codex/Claude.',
        'plugins.promptTemplates.mode.aria': 'Chế độ template prompt',
        'plugins.promptTemplates.mode.compose': 'Soạn thảo',
        'plugins.promptTemplates.mode.manage': 'Quản lý',
        'plugins.promptTemplates.compose.selectTemplate': 'Chọn template',
        'plugins.promptTemplates.compose.chooseTemplate': 'Chọn một template',
        'plugins.promptTemplates.compose.chooseTemplateHint': 'Chọn template để bắt đầu soạn thảo.',
        'plugins.promptTemplates.compose.builtinSuffix': ' (tích hợp sẵn)',
        'plugins.promptTemplates.compose.empty': 'Không có template nào.',
        'plugins.promptTemplates.compose.varsHint': 'Điền và thêm biến trong "Quản lý".',
        'plugins.promptTemplates.compose.missingCount': 'Thiếu {count}',
        'plugins.promptTemplates.compose.jumpToMissing': 'Đến phần thiếu',
        'plugins.promptTemplates.compose.goManage': 'Quản lý biến',
        'plugins.promptTemplates.compose.outputTitle': 'Kết quả',
        'plugins.promptTemplates.compose.outputHint': 'Nhấn "Sao chép" và dán vào Codex/Claude.',
        'plugins.promptTemplates.compose.outputAria': 'Prompt đã render',
        'plugins.promptTemplates.compose.copy': 'Sao chép',
        'plugins.promptTemplates.manage.searchAria': 'Tìm kiếm template',
        'plugins.promptTemplates.manage.searchPlaceholder': 'Tìm kiếm template',
        'plugins.promptTemplates.manage.create': 'Mới',
        'plugins.promptTemplates.manage.export': 'Xuất',
        'plugins.promptTemplates.manage.import': 'Nhập',
        'plugins.promptTemplates.manage.loading': 'Đang tải template...',
        'plugins.promptTemplates.manage.empty': 'Không có template.',
        'plugins.promptTemplates.manage.vars': '{count} biến',
        'plugins.promptTemplates.manage.builtin': 'tích hợp sẵn',
        'plugins.promptTemplates.manage.custom': 'tùy chỉnh',
        'plugins.promptTemplates.manage.newTemplateName': 'Template mới',
        'plugins.promptTemplates.editor.selectHint': 'Chọn template để chỉnh sửa.',
        'plugins.promptTemplates.editor.namePlaceholder': 'Tên template',
        'plugins.promptTemplates.editor.nameAria': 'Tên template',
        'plugins.promptTemplates.editor.duplicate': 'Nhân bản',
        'plugins.promptTemplates.editor.delete': 'Xóa',
        'plugins.promptTemplates.editor.save': 'Lưu',
        'plugins.promptTemplates.editor.builtinReadOnly': 'Template tích hợp sẵn là chỉ đọc.',
        'plugins.promptTemplates.editor.descPlaceholder': 'Mô tả (tùy chọn)',
        'plugins.promptTemplates.editor.descAria': 'Mô tả template',
        'plugins.promptTemplates.editor.templateLabel': 'Template',
        'plugins.promptTemplates.editor.templateAria': 'Nội dung template',
        'plugins.promptTemplates.editor.templatePlaceholder': 'Viết template tại đây. Dùng {{var}} cho biến.',
        'plugins.promptTemplates.vars.title': 'Biến',
        'plugins.promptTemplates.vars.hint': 'Phát hiện từ template. Điền để render prompt.',
        'plugins.promptTemplates.vars.reset': 'Đặt lại',
        'plugins.promptTemplates.vars.empty': 'Không có biến nào.',
        'plugins.promptTemplates.vars.valuePlaceholder': 'Giá trị cho {name}',
        'plugins.promptTemplates.preview.title': 'Xem trước',
        'plugins.promptTemplates.preview.hint': 'Kết quả render (biến thiếu sẽ thành trống).',
        'plugins.promptTemplates.preview.copy': 'Sao chép',
        'plugins.promptTemplates.preview.outputAria': 'Prompt đã render',
        'plugins.promptTemplates.noPluginSelected': 'Chọn plugin từ panel bên trái trước.',
        'plugins.meta.attribution': 'Tạo bởi {createdBy} · Duy trì bởi {maintainers}',
        'plugins.meta.createdBy': 'Tạo bởi {createdBy}',
        'plugins.meta.maintainedBy': 'Duy trì bởi {maintainers}',

        // Built-in prompt templates
        'plugins.builtin.commentPolish.name': 'Cải thiện comment',
        'plugins.builtin.commentPolish.desc': 'Cải thiện comment code sau {{code}}',
        'plugins.builtin.commentPolish.line1': 'Cải thiện comment code sau',
        'plugins.builtin.ruleAck.name': 'Xác nhận quy tắc',
        'plugins.builtin.ruleAck.desc': 'Vui lòng tuân theo 【{{rule}}】, trả lời khi nhận được',
        'plugins.builtin.ruleAck.line1': 'Vui lòng tuân theo 【{{rule}}】, trả lời khi nhận được',

        // Toasts
        'toast.copy.empty': 'Không có gì để sao chép',
        'toast.copy.ok': 'Đã sao chép',
        'toast.copy.fail': 'Sao chép thất bại',
        'toast.save.ok': 'Đã lưu',
        'toast.save.fail': 'Lưu thất bại',
        'toast.delete.ok': 'Đã xóa',
        'toast.delete.fail': 'Xóa thất bại',
        'toast.export.empty': 'Không có gì để xuất',
        'toast.export.ok': 'Đã xuất',
        'toast.export.fail': 'Xuất thất bại',
        'toast.import.ok': 'Đã nhập',
        'toast.import.fail': 'Nhập thất bại',
        'toast.import.notAvailable': 'Nhập không khả dụng',
        'toast.import.readFileFail': 'Không đọc được file',
        'toast.import.invalidJson': 'JSON không hợp lệ',
        'toast.import.expectedArray': 'Cần dạng mảng',
        'toast.export.notSupported': 'Xuất không được hỗ trợ',
        'toast.plugins.loadFail': 'Tải plugin thất bại',
        'toast.templates.builtinNotEditable': 'Template tích hợp không thể chỉnh sửa',
        'toast.templates.builtinNotModifiable': 'Template tích hợp là chỉ đọc. Nhân bản trước.',
        'toast.templates.nameRequired': 'Cần nhập tên template',
        'toast.templates.builtinNotDuplicable': 'Template tích hợp không thể nhân bản',
        'toast.templates.builtinNotDeletable': 'Template tích hợp không thể xóa',
        'toast.templates.deleteTitle': 'Xóa template',
        'toast.templates.deleteMessage': 'Xóa "{name}"? Hành động này không thể hoàn tác.',
        'toast.templates.deleteConfirm': 'Xóa',
        'toast.templates.deleteCancel': 'Hủy',

        // Basic modals
        'modal.providerAdd.title': 'Thêm nhà cung cấp',
        'modal.providerEdit.title': 'Chỉnh sửa nhà cung cấp',
        'modal.modelAdd.title': 'Thêm model',
        'modal.modelManage.title': 'Quản lý model',
        'modal.claudeConfigAdd.title': 'Thêm cấu hình Claude Code',
        'modal.claudeConfigEdit.title': 'Chỉnh sửa cấu hình Claude Code',
        'field.useBuiltinTransform': 'Dùng transform tích hợp (tương thích OpenAI)',
        'hint.useBuiltinTransform': 'Khi bật, base_url trỏ đến dịch vụ transform tích hợp của codexmate.',

        // Config template / agents modals
        'modal.configTemplate.title': 'Trình soạn thảo template cấu hình (xác nhận thủ công)',
        'modal.configTemplate.label': 'Template config.toml',
        'modal.configTemplate.placeholder': 'Chỉnh sửa template config.toml tại đây',
        'modal.configTemplate.mode.twoStep': 'Xác nhận 2 bước: xem trước diff, rồi áp dụng.',
        'modal.configTemplate.mode.oneStep': 'Áp dụng 1 bước: ghi ngay.',
        'diff.title.configTemplate': 'Xem trước diff (config.toml)',
        'diff.generating': 'Đang tạo...',
        'diff.failed': 'Thất bại',
        'diff.noChanges': 'Không phát hiện thay đổi',
        'diff.hint.busy': 'Đang tạo diff hoặc áp dụng. Hành động tạm thời bị tắt.',
        'diff.hint.failedBack': 'Xem trước diff thất bại. Quay lại chỉnh sửa và thử lại.',
        'diff.hint.noChangesBack': 'Không phát hiện thay đổi. Quay lại chỉnh sửa hoặc hủy.',
        'diff.hint.previewMode': 'Chế độ xem trước. Nhấn "Áp dụng" để ghi hoặc "Quay lại chỉnh sửa".',
        'modal.agents.export': 'Xuất',
        'modal.agents.copy': 'Sao chép',
        'modal.agents.title': 'Trình soạn thảo AGENTS.md',
        'modal.agents.hint': 'Nội dung đã lưu sẽ được ghi vào AGENTS.md (cạnh config.toml).',
        'modal.agents.targetFile': 'File đích',
        'modal.agents.contentLabel': 'Nội dung AGENTS.md',
        'modal.agents.placeholder': 'Chỉnh sửa AGENTS.md tại đây',
        'modal.agents.unsaved.previewModeHint': 'Chế độ xem trước: chưa lưu cho đến khi nhấn "Áp dụng".',
        'modal.agents.unsaved.detectedHint': 'Phát hiện thay đổi chưa lưu: lưu trước khi đóng.',
        'modal.agents.hint.shortcuts': 'Phím tắt: Esc (quay lại chỉnh sửa khi xem trước, đóng khi chỉnh sửa).',
        'modal.agents.hint.twoStepSave': 'Lưu 2 bước: "Xác nhận" để xem diff, rồi "Áp dụng" để lưu.',
        'diff.tooLargeSkip': 'Nội dung quá lớn. Bỏ qua xem trước diff.',
        'diff.viewHint.preview': 'Chế độ xem trước. Nhấn "Áp dụng" để lưu hoặc "Quay lại chỉnh sửa".',
        'diff.viewHint.truncated': 'Bỏ qua xem trước do kích thước. Nhấn "Áp dụng" để lưu.',

        // Skills modal
        'modal.skills.title': 'Quản lý Skills',
        'modal.skills.subtitle': 'Quản lý skills cục bộ cho host hiện tại.',
        'modal.skills.target.aria': 'Chọn đích skills',
        'modal.skills.rootDir': 'Thư mục skills ({label})',
        'modal.skills.summary.target': 'Đích',
        'modal.skills.summary.total': 'Tổng cộng',
        'modal.skills.summary.withSkill': 'Có SKILL.md',
        'modal.skills.summary.missingSkill': 'Thiếu SKILL.md',
        'modal.skills.summary.importable': 'Có thể nhập',
        'modal.skills.panel.aria': 'Quản lý Skills',
        'modal.skills.local.title': 'Skills cục bộ',
        'modal.skills.local.note': 'Tìm kiếm, lọc và xóa hàng loạt.',
        'modal.skills.filter.keywordAria': 'Lọc theo tên hoặc mô tả',
        'modal.skills.filter.keywordPlaceholder': 'Tìm theo tên thư mục / tên hiển thị / mô tả',
        'modal.skills.filter.statusAria': 'Lọc theo trạng thái SKILL.md',
        'modal.skills.filter.status.all': 'Tất cả',
        'modal.skills.filter.status.withSkill': 'Có SKILL.md',
        'modal.skills.filter.status.missingSkill': 'Thiếu SKILL.md',
        'modal.skills.selection.stats': 'Đã chọn {selected} (lọc {filtered} / {total}, đã chọn trong lọc {visibleSelected})',
        'modal.skills.empty.local': 'Không có skills để quản lý.',
        'modal.skills.empty.filtered': 'Không có skills khớp bộ lọc hiện tại.',
        'modal.skills.pill.hasSkillFile': 'Có SKILL.md',
        'modal.skills.pill.missingSkillFile': 'Thiếu SKILL.md',
        'modal.skills.pill.symlink': 'Symlink',
        'modal.skills.pill.dir': 'Thư mục',
        'modal.skills.import.title': 'Nhập từ app khác',
        'modal.skills.import.note': 'Quét và nhập vào {label}.',
        'modal.skills.import.scan': 'Quét có thể nhập',
        'modal.skills.import.stats': 'Đã chọn {selected} / {total}. Có SKILL.md {configured}, thiếu {missing}.',
        'modal.skills.import.emptyHint': 'Không có skills có thể nhập. Nhấn "Quét có thể nhập".',
        'modal.skills.bulk.title': 'Hành động hàng loạt',
        'modal.skills.bulk.note': 'Bên phải là nhập; bên trái là cục bộ.',
        'modal.skills.actions.zipImport': 'Nhập ZIP',
        'modal.skills.actions.zipImporting': 'Đang nhập ZIP...',
        'modal.skills.actions.exportSelected': 'Xuất đã chọn',
        'modal.skills.actions.exporting': 'Đang xuất...',
        'modal.skills.actions.importSelected': 'Nhập đã chọn',
        'modal.skills.actions.importing': 'Đang nhập...',
        'modal.skills.actions.deleteSelected': 'Xóa đã chọn',
        'modal.skills.actions.deleting': 'Đang xóa...',

        // OpenClaw config modal
        'placeholder.openclawConfigNameExample': 'vd: Mặc định',
        'modal.openclaw.loadCurrent': 'Tải cấu hình hiện tại',
        'modal.openclaw.quick.title': 'Cài đặt nhanh',
        'modal.openclaw.quick.subtitle': '3 bước: điền nhà cung cấp/model, ghi vào editor, lưu & áp dụng.',
        'modal.openclaw.quick.readFromEditor': 'Đọc từ editor',
        'modal.openclaw.quick.step1': 'Điền nhà cung cấp và model',
        'modal.openclaw.quick.step2': 'Ghi vào editor',
        'modal.openclaw.quick.step3': 'Lưu & áp dụng',
        'modal.openclaw.quick.providerHint': 'Sẽ kết hợp thành nhà cung cấp/model cho định danh model chính.',
        'modal.openclaw.quick.baseUrlHintDefault': 'Điền sẵn từ mặc định tích hợp OpenClaw. Có thể chỉnh sửa.',
        'modal.openclaw.quick.baseUrlHintReadonly': 'Phát hiện tham chiếu ngoài. Chỉ đọc trong form nhanh.',
        'modal.openclaw.quick.apiKeyHintFromAuth': 'Giá trị từ hồ sơ auth ngoài; thay đổi sẽ được ghi lại khi lưu.',
        'modal.openclaw.quick.apiKeyHintReadonly': 'Phát hiện auth/tham chiếu ngoài. Chỉ đọc trong form nhanh.',
        'modal.openclaw.quick.apiKeyHintKeep': 'Để trống để giữ key hiện có.',
        'placeholder.apiTypeExample': 'vd: openai-responses',
        'modal.openclaw.quick.modelTitle': 'Model',
        'placeholder.modelIdExample': 'vd: gpt-4.1',
        'placeholder.modelNameOptional': 'Để trống để dùng model ID',
        'field.contextWindow': 'Cửa sổ context',
        'field.maxOutput': 'Đầu ra tối đa',
        'hint.emptyNoChange': 'Để trống để giữ giá trị hiện có.',
        'modal.openclaw.quick.optionsTitle': 'Tùy chọn',
        'modal.openclaw.quick.setPrimary': 'Đặt làm model chính',
        'modal.openclaw.quick.overrideProvider': 'Ghi đè cài đặt nhà cung cấp',
        'modal.openclaw.quick.overrideModels': 'Ghi đè danh sách model',
        'modal.openclaw.quick.optionsHint': 'Khi tắt ghi đè, chỉ điền các trường còn thiếu.',
        'modal.openclaw.quick.writeToEditor': 'Ghi vào editor',

        // Docs panel
        'docs.title': 'Cài CLI',
        'docs.subtitle': 'Lệnh cài đặt cho Claude Code / Gemini CLI / CodeBuddy Code / Codex CLI.',
        'docs.section.commands': 'Lệnh',
        'docs.section.commandsNote': 'Sao chép và chạy trực tiếp.',
        'docs.section.faq': 'FAQ',
        'docs.section.faqNote': 'Vấn đề phổ biến và mẹo.',
        'docs.command.aria': 'Lệnh {name}',
        'docs.registryHintPrefix': 'Lệnh sẽ thêm:',
        'docs.registryHintCustom': 'Nhập URL đầy đủ (http/https) để thêm làm registry.',
        'docs.registry.tencent': 'Tencent Cloud',
        'docs.meta.bin': 'bin: {bin}',
        'docs.termuxLabel': 'Termux',
        'docs.termuxAria': 'Lệnh Codex CLI cho Termux',
        'docs.rule.1': 'Lệnh phụ thuộc vào trình quản lý gói, registry và hành động.',
        'docs.rule.2': 'Registry tùy chỉnh chỉ dùng cho cài đặt/cập nhật.',
        'docs.tip.win.1': 'Nếu PowerShell báo lỗi quyền (EACCES/EPERM), chạy lệnh cài đặt với quyền Administrator.',
        'docs.tip.win.2': 'Nếu lệnh không tìm thấy sau cài đặt, mở lại terminal và chạy: where codex / where claude.',
        'docs.tip.win.3': 'Nếu mạng chặn npm, thử chuyển registry (npmmirror / Tencent / Tùy chỉnh).',
        'docs.tip.unix.1': 'Nếu gặp EACCES, sửa quyền thư mục Node global thay vì dùng sudo npm.',
        'docs.tip.unix.2': 'Nếu lệnh không khả dụng sau cài đặt, mở lại terminal và chạy: which codex / which claude.',
        'docs.tip.unix.3': 'Nếu mạng chặn npm, thử chuyển registry.',

        // Sessions panel
        'sessions.loading': 'Đang tải...',
        'sessions.sourceTitle': 'Nguồn phiên',
        'sessions.refresh': 'Làm mới',
        'sessions.refreshing': 'Đang làm mới...',
        'sessions.allPaths': 'Tất cả đường dẫn',
        'sessions.source.codex': 'Codex',
        'sessions.source.claudeCode': 'Claude Code',
        'sessions.source.gemini': 'Gemini CLI',
        'sessions.source.codebuddy': 'CodeBuddy Code',
        'sessions.loadingList': 'Đang tải phiên làm việc...',
        'sessions.empty': 'Không tìm thấy phiên nào',
        'sessions.unknownTime': 'thời gian không rõ',
        'sessions.query.placeholder.enabled': 'Tìm kiếm từ khóa (Codex/Claude/Gemini/CodeBuddy)',
        'sessions.query.placeholder.disabled': 'Tìm kiếm từ khóa không khả dụng cho nguồn này',
        'sessions.pin': 'Ghim',
        'sessions.unpin': 'Bỏ ghim',
        'sessions.copyResume': 'Sao chép lệnh tiếp tục',
        'sessions.preview.refresh': 'Làm mới nội dung',
        'sessions.preview.loading': 'Đang tải...',
        'sessions.preview.deleteHard': 'Xóa vĩnh viễn',
        'sessions.preview.moveToTrash': 'Chuyển vào thùng rác',
        'sessions.preview.deleting': 'Đang xóa...',
        'sessions.preview.moving': 'Đang chuyển...',
        'sessions.preview.export': 'Xuất',
        'sessions.preview.exporting': 'Đang xuất...',
        'sessions.preview.convert': 'Tạo phiên dẫn xuất',
        'sessions.preview.converting': 'Đang tạo...',
        'sessions.preview.convert.loadedOnly': 'Chỉ chuyển đổi tin nhắn đã tải',
        'sessions.preview.importNative': 'Nhập vào Native',
        'sessions.preview.importingNative': 'Đang nhập...',
        'sessions.preview.importNative.unsupported': 'Thao tác này không được hỗ trợ',
        'sessions.preview.importNative.confirmTitle': 'Ghi đè file phiên native?',
        'sessions.preview.importNative.confirmMessage': 'File phiên native đã tồn tại. Ghi đè sẽ thay thế phiên khớp trong thư mục native của công cụ đích.',
        'sessions.preview.importNative.confirmText': 'Ghi đè',
        'sessions.preview.importNative.cancelled': 'Đã hủy nhập',
        'sessions.preview.importNative.conflict': 'Phiên native đã tồn tại',
        'sessions.preview.importNative.invalidSource': 'Nguồn phiên không hợp lệ',
        'sessions.preview.importNative.fileNotFound': 'Không tìm thấy file phiên',
        'sessions.preview.importNative.nativePathUnavailable': 'Đường dẫn phiên native không khả dụng',
        'sessions.preview.importNative.success': 'Đã nhập vào thư mục native',
        'sessions.preview.importNative.failed': 'Nhập thất bại',
        'sessions.preview.importNative.failedWithReason': 'Nhập vào native thất bại: {reason}',
        'sessions.preview.copyLink': 'Sao chép link',
        'sessions.preview.loadingBody': 'Đang tải nội dung phiên...',
        'sessions.preview.emptyMsgs': 'Không có tin nhắn để hiển thị',
        'sessions.preview.rendering': 'Đang render nội dung phiên...',
        'sessions.preview.rerender': 'Render lại',
        'sessions.preview.preparing': 'Đang chuẩn bị nội dung phiên...',
        'sessions.preview.clipped': 'Chỉ hiển thị {count} tin nhắn mới nhất.',
        'sessions.preview.shownCount': 'Hiển thị {shown} / {total}',
        'sessions.preview.loadMore': 'Tải thêm (còn lại {remain})',
        'sessions.preview.loadingMore': 'Đang tải tin nhắn cũ hơn...',
        'sessions.timeline.aria': 'Dòng thời gian phiên',
        'sessions.selectHint': 'Chọn một phiên ở bên trái trước',
        'sessions.role.all': 'Tất cả vai trò',
        'sessions.role.user': 'Chỉ người dùng',
        'sessions.role.assistant': 'Chỉ trợ lý',
        'sessions.role.system': 'Chỉ hệ thống',
        'sessions.time.all': 'Tất cả thời gian',
        'sessions.time.7d': '7 ngày qua',
        'sessions.time.30d': '30 ngày qua',
        'sessions.time.90d': '90 ngày qua',
        'sessions.sort.time': 'Sắp xếp: thời gian',
        'sessions.sort.hot': 'Sắp xếp: hot',
        'sessions.sort.hotBadge': 'Hot',
        'sessions.filters.copyLink': 'Sao chép link bộ lọc',
        'sessions.filters.urlBuildFail': 'Tạo link thất bại',
        'sessions.filters.source': 'Nguồn',
        'sessions.filters.path': 'Đường dẫn',
        'sessions.filters.keyword': 'Từ khóa',
        'sessions.filters.role': 'Vai trò',
        'sessions.filters.time': 'Thời gian',
        'sessions.roleLabel.user': 'Người dùng',
        'sessions.roleLabel.system': 'Hệ thống',
        'sessions.roleLabel.assistant': 'Trợ lý',

        // Usage panel
        'usage.overview': 'Tổng quan thống kê',
        'usage.range.aria': 'Phạm vi thời gian thống kê',
        'usage.range.7d': '7 ngày qua',
        'usage.range.30d': '30 ngày qua',
        'usage.range.all': 'Tất cả',
        'usage.compare.toggle': 'So sánh kỳ trước',
        'usage.compare.prev': 'Trước',
        'usage.compare.delta': 'Chênh lệch',
        'usage.refresh': 'Làm mới thống kê',
        'usage.refreshing': 'Đang làm mới...',
        'usage.loading': 'Đang tải thống kê...',
        'usage.empty': 'Không có dữ liệu phiên cho thống kê',
        'usage.refreshOverlay': 'Đang làm mới…',
        'usage.copyTitle': 'Nhấn để sao chép: {value}',
        'usage.copySuccess': 'Đã sao chép: {label}',
        'usage.copyFail': 'Sao chép thất bại',
        'usage.copyNone': 'Không có gì để sao chép',
        'usage.daily.title': 'Thống kê hàng ngày',
        'usage.daily.subtitle': 'Token và chi phí ước tính tổng hợp theo ngày.',
        'usage.daily.note': 'Lưu ý: Chi phí ước tính mặc định không tính Claude; chỉ tính khi có giá model và token đầu vào/ra.',
        'usage.heatmap.title': 'Bản đồ nhiệt hoạt động',
        'usage.heatmap.subtitle': 'Tổng hợp theo phiên mỗi ngày; di chuột để xem chi tiết.',
        'usage.heatmap.legend.less': 'Ít hơn',
        'usage.heatmap.legend.more': 'Nhiều hơn',
        'usage.heatmap.tooltip': '{date} · {sessions} phiên · {messages} tin nhắn · {tokens} token',
        'usage.heatmap.aria': '{date}, {sessions} phiên',
        'usage.hourlyHeatmap.title': 'Bản đồ nhiệt 7×24',
        'usage.hourlyHeatmap.subtitle': 'Phân phối phiên theo ngày trong tuần × giờ; tối = hoạt động nhiều hơn.',
        'usage.hourlyHeatmap.tooltip': '{weekday} {hour}:00 · {sessions} phiên · {messages} tin nhắn · {tokens} token',
        'usage.hourlyHeatmap.legend.less': 'Ít hơn',
        'usage.hourlyHeatmap.legend.more': 'Nhiều hơn',
        'usage.legend.tokens': 'Token',
        'usage.legend.cost': 'Chi phí ước tính',
        'usage.table.date': 'Ngày',
        'usage.table.sessions': 'Phiên',
        'usage.table.messages': 'Tin nhắn',
        'usage.table.tokens': 'Token',
        'usage.table.cost': 'Chi phí ước tính',
        'usage.trend.sessions': 'Xu hướng phiên',
        'usage.trend.messages': 'Xu hướng tin nhắn',
        'usage.trend.activeHours': 'Giờ hoạt động',
        'usage.trend.sources': 'Phân tích nguồn',
        'usage.legend.codex': 'Codex',
        'usage.legend.claude': 'Claude',
        'usage.trend.sessions.codexTitle': 'Codex {count}',
        'usage.trend.sessions.claudeTitle': 'Claude {count}',
        'usage.trend.messages.barTitle': '{count} tin nhắn',
        'usage.hour.title': '{hour}:00 · {count} phiên',
        'usage.source.row': '{sessions} phiên · {messages} tin nhắn · tb {avg}',
        'usage.summary.sessions': 'Tổng phiên',
        'usage.summary.messages': 'Tổng tin nhắn',
        'usage.summary.tokens': 'Tổng token',
        'usage.summary.contextWindow': 'Tổng context',
        'usage.summary.estimatedCost': 'Chi phí ước tính · {range}',
        'usage.estimatedCost.note.excludesClaudePrefix': 'Không tính Claude. ',
        'usage.estimatedCost.method.configured': 'Ước tính dùng giá đã cấu hình',
        'usage.estimatedCost.method.catalog': 'Ước tính dùng giá catalog công khai',
        'usage.estimatedCost.method.configuredAndCatalog': 'Ước tính dùng giá đã cấu hình + catalog công khai',
        'usage.estimatedCost.detail.estimate': '{prefix}{method}. Ước tính {estimate}. Phủ {covered}/{total} phiên (~{percent}% token).',
        'usage.estimatedCost.detail.missing': '{prefix}Thiếu giá model hoặc token. Thêm models.cost hoặc đảm bảo phiên ghi token đầu vào/ra.',
        'usage.summary.activeDuration': 'Thời gian hoạt động',
        'usage.summary.activeDuration.title': 'Khoảng hoạt động {value}',
        'usage.summary.totalDuration': 'Tổng thời gian',
        'usage.summary.totalDuration.title': 'Khoảng tổng {value}',
        'usage.summary.activeDays': 'Ngày hoạt động',
        'usage.summary.avgMessagesPerSession': 'TB tin nhắn/phiên',
        'usage.summary.busiestDay': 'Ngày bận nhất',
        'usage.summary.busiestHour': 'Giờ cao điểm',
        'usage.currentSession.title': 'Phiên hiện tại',
        'usage.currentSession.apiDuration': 'Thời gian API',
        'usage.currentSession.totalDuration': 'Tổng thời gian',
        'usage.currentSession.tokens': 'Token',
        'usage.range.kicker.all': 'Tất cả',
        'usage.range.kicker.30d': '30 ngày qua',
        'usage.range.kicker.7d': '7 ngày qua',
        'usage.copyTokenDay': 'Đã sao chép: Token ({day})',
        'usage.copyCostDay': 'Đã sao chép: Chi phí ước tính ({day})',
        'usage.dayDetail.title': 'Chi tiết {day}',
        'usage.dayDetail.subtitle': 'Chọn ngày để xem phân tích.',
        'usage.dayDetail.pick': 'Chọn ngày',
        'usage.dayDetail.empty': 'Chọn ngày để xem phân tích.',
        'usage.dayDetail.clear': 'Xóa',
        'usage.dayDetail.topSessions': 'Phiên hàng đầu',
        'usage.dayDetail.topModels': 'Model hàng đầu',
        'usage.models.title': 'Model đã dùng',
        'usage.models.subtitle': 'Chỉ bao gồm tên model có trong bản ghi đã lưu.',
        'usage.models.kicker': 'Xác định {modeled}/{total}',
        'usage.models.count': 'Model',
        'usage.models.coverage': 'Phủ sóng',
        'usage.models.missing': 'Thiếu model',
        'usage.models.noneTitle': 'Không tìm thấy tên model trong phạm vi này',
        'usage.models.noneBody': 'Đã quét {total} phiên, nhưng không tìm thấy trường model nào.',
        'usage.models.providerOnly': '{count} phiên cũ chỉ ghi nhà cung cấp.',
        'usage.models.missingNote.providerOnly': '{count} phiên không ghi tên model và bị loại trừ.',
        'usage.models.missingNote': '{count} phiên thiếu model và bị loại trừ.',
        'usage.models.missingListTitle': 'Phiên vẫn thiếu model',
        'usage.models.chipTitle': '{model} · {sessions} phiên · {messages} tin nhắn{tokens}',
        'usage.models.meta': '{sessions} phiên · {messages} tin nhắn{tokens}',
        'usage.weekday.title': 'Phân phối theo ngày trong tuần',
        'usage.paths.title': 'Đường dẫn hàng đầu',
        'usage.paths.empty': 'Không có dữ liệu đường dẫn',
        'usage.paths.count': '{count} lần truy cập',
        'usage.paths.meta': '{messages} tin nhắn{recent}',
        'usage.paths.recent': ' · gần nhất {label}',
        'usage.recent.title': 'Phiên hoạt động gần đây',
        'usage.sessions.empty': 'Không có dữ liệu phiên',
        'usage.sessions.messages': '{count} tin nhắn',
        'usage.sessions.topDensity': 'Nhiều tin nhắn nhất',

        // Config panel (Codex)
        'config.addProvider': 'Thêm nhà cung cấp',
        'config.providerTemplate.title': 'Preset nhà cung cấp',
        'config.models': 'Model',
        'config.modelLoading': 'Đang tải...',
        'config.models.unlimited': 'Không có danh sách model. Nhập thủ công.',
        'config.models.error': 'Tải danh sách model thất bại. Nhập thủ công.',
        'config.models.notInList.codex': 'Model hiện tại không có trong danh sách. Nhập thủ công.',
        'config.models.notInList.other': 'Model hiện tại không có trong danh sách. Nhập thủ công.',
        'config.template.editFirst': 'Chỉnh sửa template trước, rồi áp dụng.',
        'config.template.bridgeCodexOnly': 'Template {hint} chỉ chỉnh sửa được trong chế độ Codex.',
        'config.template.openEditor': 'Mở trình soạn thảo template',
        'config.serviceTier': 'Cấp dịch vụ',
        'config.serviceTier.fast': 'nhanh (mặc định)',
        'config.serviceTier.standard': 'tiêu chuẩn',
        'config.serviceTier.hint': 'Chỉ nhanh ghi {field}.',
        'config.reasoningEffort': 'Mức độ suy luận',
        'config.reasoningEffort.medium': 'trung bình (mặc định)',
        'config.reasoningEffort.hint': 'Kiểm soát độ sâu suy luận; cao là sâu hơn.',
        'config.contextBudget': 'Ngưỡng nén',
        'config.reset': 'Đặt lại',
        'config.example': 'vd: {value}',
        'config.contextWindow.hint': 'Giới hạn cửa sổ context (mặc định 190000).',
        'config.autoCompact.hint': 'Ngưỡng nén tự động (mặc định 185000).',
        'config.agents.open': 'Mở AGENTS.md',
        'modal.agents.title.default': 'Trình soạn thảo AGENTS.md',
        'modal.agents.title.claudeMd': 'Trình soạn thảo CLAUDE.md',
        'modal.agents.title.openclaw': 'Trình soạn thảo AGENTS.md OpenClaw',
        'modal.agents.hint.default': 'Nội dung đã lưu sẽ được ghi vào AGENTS.md (cạnh config.toml).',
        'modal.agents.hint.claudeMd': 'Nội dung đã lưu sẽ được ghi vào ~/.claude/CLAUDE.md.',
        'modal.agents.contentLabel.claudeMd': 'Nội dung CLAUDE.md',
        'modal.agents.placeholder.claudeMd': 'Chỉnh sửa CLAUDE.md tại đây',
        'modal.agents.hint.openclaw': 'Nội dung đã lưu sẽ được ghi vào AGENTS.md không gian làm việc OpenClaw.',
        'modal.agents.title.openclawWorkspaceFile': 'File không gian làm việc OpenClaw: {fileName}',
        'modal.agents.hint.openclawWorkspaceFile': 'Nội dung đã lưu sẽ được ghi vào OpenClaw {fileName}.',
        'config.url.unset': 'URL chưa đặt',
        'config.model.unset': 'Model chưa đặt',
        'config.badge.system': 'Hệ thống',
        'config.availabilityTest': 'Kiểm tra khả dụng',
        'config.availabilityTestAria': 'Kiểm tra khả dụng cho {name}',
        'config.health.title': 'Kiểm tra sức khỏe cấu hình',
        'config.health.run': 'Chạy kiểm tra',
        'config.health.running': 'Đang kiểm tra...',
        'config.health.hint': 'Chạy kiểm tra khả dụng cho tất cả nhà cung cấp và làm mới badge độ trễ.',
        'config.health.progress': '{done}/{total} xong · {failed} thất bại',
        'config.health.ok': 'Đạt',
        'config.health.fail': 'Thất bại',
        'config.health.issues': '{count} vấn đề',
        'config.shareCommand': 'Chia sẻ lệnh',
        'config.shareDisabled': 'Không thể chia sẻ',
        'config.shareCommand.aria': 'Chia sẻ lệnh nhập',
        'config.provider.edit.aria': 'Chỉnh sửa nhà cung cấp: {name}',
        'config.provider.delete.aria': 'Xóa nhà cung cấp: {name}',
        'config.provider.clone': 'Nhân bản',
        'config.provider.clone.aria': 'Nhân bản nhà cung cấp: {name}',
        'app.loadingConfig': 'Đang tải cấu hình...',
        'common.current': 'Hiện tại {value}',
        'common.notSelected': 'Chưa chọn',
        'common.readFromEditor': 'Đọc từ editor',
        'common.writeToEditor': 'Ghi vào editor',
        'sessions.sourceLabel': 'Nguồn: {value}',
        'usage.rangeLabel': 'Phạm vi: {value}',
        'sessions.source.all': 'Tất cả',
        'usage.range.all': 'Tất cả',
        'usage.range.7d.short': '7 ngày qua',
        'usage.range.30d.short': '30 ngày qua',
        'orchestration.queueStats': 'Hàng đợi: {running} đang chạy · {queued} đang chờ',
        'orchestration.hero.kicker': 'Điều phối tác vụ',
        'orchestration.hero.title': 'Biến mục tiêu thành các bước thực thi',
        'orchestration.hero.subtitle': 'Viết mục tiêu, xem trước kế hoạch, rồi chạy.',
        'orchestration.draft.reset': 'Đặt lại bản nháp',
        'orchestration.summary.aria': 'Tóm tắt điều phối tác vụ',
        'orchestration.summary.running': 'Đang chạy',
        'orchestration.summary.queued': 'Đang chờ',
        'orchestration.summary.runs': 'Lần chạy',
        'orchestration.step1.title': 'Bắt đầu với kết quả',
        'orchestration.step1.subtitle': 'Chỉ bao gồm những gì ảnh hưởng đến thực thi.',
        'orchestration.templates.title': 'Ví dụ nhanh',
        'orchestration.templates.reviewFix.label': 'Sửa review + regression',
        'orchestration.templates.reviewFix.target': 'Xử lý comment review PR hiện tại và thêm test regression',
        'orchestration.templates.reviewFix.notes': 'Tránh refactor không liên quan; cung cấp kết quả xác minh',
        'orchestration.templates.reviewFix.followUps': 'Xử lý comment review mới\nCập nhật tóm tắt PR',
        'orchestration.templates.planOnly.label': 'Chỉ lập kế hoạch',
        'orchestration.templates.planOnly.target': 'Điều tra nguyên nhân gốc rễ và đề xuất kế hoạch thực thi mà không thay đổi code',
        'orchestration.templates.planOnly.notes': 'Tập trung vào nguyên nhân gốc, phạm vi ảnh hưởng và vùng rủi ro',
        'orchestration.templates.workflowBatch.label': 'Batch workflow',
        'orchestration.templates.workflowBatch.target': 'Chạy một bộ kiểm tra cố định bằng workflow và tóm tắt kết quả',
        'orchestration.templates.workflowBatch.workflowIds': 'diagnose-config\nsafe-provider-switch',
        'orchestration.templates.workflowBatch.notes': 'Đưa ra kết luận thống nhất; tránh diễn giải lặp lại',
        'orchestration.fields.target': 'Mục tiêu',
        'orchestration.fields.target.placeholder': 'vd: Xử lý comment review PR và thêm test regression; tránh các module không liên quan',
        'orchestration.fields.target.hint': 'Một câu là đủ: kết quả, ràng buộc và tiêu chí chấp nhận.',
        'orchestration.engine.codex': 'Codex',
        'orchestration.engine.workflow': 'Workflow',
        'orchestration.runMode.write': 'Ghi',
        'orchestration.runMode.readOnly': 'Chỉ đọc',
        'orchestration.runMode.dryRun': 'Thử nghiệm',
        'orchestration.pills.hasTitle': 'Có tiêu đề',
        'orchestration.pills.workflowCount': 'Workflows {count}',
        'orchestration.pills.planNodes': 'Kế hoạch {count} nút',
        'orchestration.step2.title': 'Chọn cách chạy',
        'orchestration.step2.subtitle': 'Tùy chọn phổ biến hiển thị; phần còn lại trong Nâng cao.',
        'orchestration.fields.engine': 'Engine',
        'orchestration.fields.runMode': 'Chế độ chạy',
        'orchestration.advanced.title': 'Nâng cao',
        'orchestration.fields.title': 'Tiêu đề',
        'orchestration.fields.title.placeholder': 'Tùy chọn. Mặc định là tiêu đề suy ra từ mục tiêu.',
        'orchestration.fields.notes': 'Ghi chú',
        'orchestration.fields.notes.placeholder': 'vd: Chỉ thay đổi tăng dần; không viết lại kiến trúc',
        'orchestration.fields.notes.hint': 'Thêm ranh giới, ràng buộc, quy tắc style hoặc yêu cầu xác minh.',
        'orchestration.fields.followUps': 'Theo dõi (mỗi dòng một mục)',
        'orchestration.fields.followUps.placeholder': 'vd:\nXử lý comment review mới\nThêm test regression',
        'orchestration.fields.concurrency': 'Đồng thời',
        'orchestration.fields.concurrency.hint': 'Bắt đầu với 1–2 cho tác vụ phức tạp.',
        'orchestration.fields.autoFixRounds': 'Tự động sửa',
        'orchestration.fields.autoFixRounds.hint': 'Thử lại vài vòng sau khi thất bại.',
        'orchestration.fields.workflowIds': 'Workflow ID (mỗi dòng một ID)',
        'orchestration.fields.workflowIds.placeholder': 'vd:\ndiagnose-config\nsafe-provider-switch',
        'orchestration.fields.workflowIds.hint': 'Bắt buộc trong chế độ Workflow. {count} có sẵn cục bộ.',
        'orchestration.workflow.stepCount': '{count} bước',
        'orchestration.step3.title': 'Xem trước, rồi thực thi',
        'orchestration.step3.subtitle': 'Xác nhận kế hoạch, rồi quyết định chạy ngay hoặc xếp hàng.',
        'orchestration.actions.planning': 'Đang lập kế hoạch...',
        'orchestration.actions.previewOnly': 'Chỉ xem trước',
        'orchestration.actions.preparing': 'Đang chuẩn bị...',
        'orchestration.actions.generatePlan': 'Tạo kế hoạch',
        'orchestration.actions.planAndRun': 'Lập kế hoạch & chạy',
        'orchestration.actions.processing': 'Đang xử lý...',
        'orchestration.actions.queueAndStart': 'Xếp hàng & bắt đầu',
        'orchestration.actions.caption': '"Lập kế hoạch & chạy" làm mới kế hoạch khi cần; dùng "Xếp hàng & bắt đầu" cho chạy hàng loạt.',
        'orchestration.stage.title': 'Không gian làm việc mở khi có dữ liệu',
        'orchestration.stage.subtitle': 'Viết mục tiêu trước, rồi xem trước kế hoạch.',
        'orchestration.stage.pill.target': 'Viết mục tiêu',
        'orchestration.stage.pill.preview': 'Xem trước',
        'orchestration.stage.pill.run': 'Chạy hoặc xếp hàng',
        'orchestration.plan.title': 'Xem trước kế hoạch',
        'orchestration.plan.subtitle': 'Xác nhận nút, đợt và phụ thuộc.',
        'orchestration.plan.summary.nodes': 'Nút',
        'orchestration.plan.summary.waves': 'Đợt',
        'orchestration.plan.summary.engine': 'Engine',
        'orchestration.plan.node.write': 'ghi',
        'orchestration.plan.node.readOnly': 'chỉ đọc',
        'orchestration.labels.dependencies': 'Phụ thuộc: ',
        'orchestration.labels.error': 'Lỗi: ',
        'orchestration.workbench.title': 'Bàn làm việc',
        'orchestration.workbench.subtitle': 'Chỉ mở rộng khi có dữ liệu.',
        'orchestration.queue.start': 'Bắt đầu hàng đợi',
        'orchestration.queue.starting': 'Đang bắt đầu...',
        'orchestration.workbench.tabs.aria': 'Chế độ xem bàn làm việc',
        'orchestration.workbench.tabs.queue': 'Hàng đợi {count}',
        'orchestration.workbench.tabs.runs': 'Lần chạy {count}',
        'orchestration.workbench.tabs.detail': 'Chi tiết lần chạy',
        'orchestration.queue.empty.title': 'Không có tác vụ trong hàng đợi',
        'orchestration.queue.empty.subtitle': 'Xếp hàng tác vụ hàng loạt trước, rồi bắt đầu runner.',
        'orchestration.runs.empty.title': 'Chưa có lần chạy nào',
        'orchestration.runs.empty.subtitle': 'Các lần chạy gần đây sẽ xuất hiện sau khi thực thi.',
        'orchestration.detail.refresh': 'Làm mới chi tiết',
        'orchestration.detail.retry': 'Thử lại',
        'orchestration.detail.retrying': 'Đang thử lại...',
        'orchestration.detail.empty.title': 'Chọn một lần chạy để xem chi tiết',
        'orchestration.detail.empty.subtitle': 'Chế độ xem này hiển thị trạng thái nút, tóm tắt và log.',
        'orchestration.detail.summary.status': 'Trạng thái',
        'orchestration.detail.summary.duration': 'Thời gian',
        'orchestration.detail.summary.nodes': 'Nút',
        'orchestration.detail.summary.summary': 'Tóm tắt',
        'orchestration.detail.node.meta': '{id} · thử {attempts} lần · tự sửa {autoFix}',
        'skills.localLabel': '{target} / Skills cục bộ',
        'skills.counts': '{installed} đã cài · {importable} có thể nhập',

        // Sidebar status labels
        'status.currentSource': 'Nguồn hiện tại',
        'status.sessionCount': 'Phiên làm việc',
        'status.range': 'Phạm vi',
        'status.totalSessions': 'Tổng phiên',
        'status.totalMessages': 'Tổng tin nhắn',
        'status.engine': 'Engine',
        'status.concurrency': 'Đồng thời',
        'status.running': 'Đang chạy',
        'status.queued': 'Đang chờ',
        'status.runs': 'Lần chạy',
        'status.currentTarget': 'Mục tiêu hiện tại',
        'status.localSkills': 'Skills cục bộ',
        'status.importable': 'Có thể nhập',
        'status.importableDirect': 'Nhập trực tiếp',
        'status.pm': 'Trình quản lý gói',
        'status.action': 'Hành động',
        'status.registry': 'Registry',
        'status.claudeConfig': 'Cấu hình Claude',
        'status.claudeModel': 'Model Claude',
        'status.openclawConfig': 'Cấu hình OpenClaw',
        'status.workspaceFile': 'File không gian làm việc',
        'status.configMode': 'Chế độ cấu hình',
        'status.currentProvider': 'Nhà cung cấp hiện tại',
        'status.currentModel': 'Model hiện tại',
        'status.quickSwitchProvider': 'Chuyển nhanh nhà cung cấp',
        'side.usage.meta': 'Thống kê cục bộ / Xu hướng',
        'side.orchestration.meta': 'Lập kế hoạch / Hàng đợi / Lần chạy',

        // Settings panel
        'settings.tab.general': 'Chung',
        'settings.tab.data': 'Dữ liệu',
        'settings.tabs.aria': 'Danh mục cài đặt',
        'settings.quickSettings.title': 'Cài đặt nhanh',
        'settings.sharePrefix.title': 'Tiền tố lệnh chia sẻ',
        'settings.sharePrefix.meta': 'Dùng làm tiền tố cho "Sao chép lệnh chia sẻ" trong Web UI',
        'settings.sharePrefix.label': 'Tiền tố',
        'settings.sharePrefix.hint': 'Mặc định là npm start (local). Bạn có thể chuyển sang codexmate toàn cục. Cài đặt này được lưu trong trình duyệt.',
        'settings.claude.title': 'Cấu hình Claude',
        'settings.claude.meta': 'Sao lưu / nhập ~/.claude',
        'settings.codex.title': 'Cấu hình Codex',
        'settings.codex.meta': 'Sao lưu / nhập ~/.codex',
        'settings.backup.progress': 'Đang sao lưu {percent}%',
        'settings.backup.oneClickClaude': 'Sao lưu ~/.claude',
        'settings.backup.importClaude': 'Nhập bản sao lưu ~/.claude',
        'settings.backup.oneClickCodex': 'Sao lưu ~/.codex',
        'settings.backup.importCodex': 'Nhập bản sao lưu ~/.codex',
        'settings.importing': 'Đang nhập...',
        'settings.deleteBehavior.title': 'Hành vi xóa phiên',
        'settings.deleteBehavior.meta': 'Có "Xóa" chuyển vào thùng rác trước không',
        'settings.deleteBehavior.toggle': 'Chuyển phiên đã xóa vào thùng rác trước',
        'settings.deleteBehavior.hint': 'Bật theo mặc định. Nếu tắt, xóa phiên sẽ xóa vĩnh viễn.',
        'settings.trash.title': 'Thùng rác',
        'settings.trash.meta': 'Phiên đã xóa (khôi phục / xóa vĩnh viễn)',
        'settings.trash.refresh': 'Làm mới',
        'settings.trash.refreshing': 'Đang làm mới...',
        'settings.trash.clear': 'Làm trống thùng rác',
        'settings.trash.clearing': 'Đang xóa...',
        'settings.trash.loading': 'Đang tải thùng rác...',
        'settings.trash.empty': 'Thùng rác trống',
        'settings.trash.retry': 'Tải thùng rác thất bại. Làm mới để thử lại.',
        'settings.trash.restore': 'Khôi phục',
        'settings.trash.restoring': 'Đang khôi phục...',
        'settings.trash.purge': 'Xóa vĩnh viễn',
        'settings.trash.purging': 'Đang xóa...',
        'settings.trash.workspace': 'Không gian làm việc',
        'settings.trash.originalFile': 'File gốc',
        'settings.trash.loadMore': 'Tải thêm (còn lại {count})',
        'settings.trash.retention': 'Tự động dọn',
        'settings.trash.retentionMeta': 'Mục trong thùng rác cũ hơn số ngày lưu giữ sẽ tự động bị xóa',
        'settings.trash.retentionLabel': 'Số ngày lưu giữ',
        'settings.trash.retentionHint': 'Phạm vi 1-365 ngày, mặc định 30. Mục hết hạn bị xóa khi tải thùng rác.',
        'settings.templateConfirm.title': 'Xác nhận áp dụng template',
        'settings.templateConfirm.meta': 'Giảm ghi nhầm',
        'settings.templateConfirm.toggle': 'Xem trước diff trước khi áp dụng (Xác nhận → Áp dụng)',
        'settings.templateConfirm.hint': 'Khi bật: hiện xem trước diff trước, rồi xác nhận ghi.',
        'settings.reset.title': 'Đặt lại cấu hình',
        'settings.reset.meta': 'Thận trọng khi thực hiện',
        'settings.reset.hint': 'Sao lưu config.toml, rồi ghi cấu hình mặc định.',
        'settings.reset.button': 'Đặt lại cấu hình',
        'settings.reset.loading': 'Đang đặt lại...',

        // Market (Skills)
        'market.title': 'Tổng quan Skills',
        'market.subtitle': 'Chuyển đích và xem skills cục bộ.',
        'market.refresh': 'Làm mới tổng quan',
        'market.refreshing': 'Đang làm mới...',
        'market.openManager': 'Mở trình quản lý Skills',
        'market.target.aria': 'Chọn đích skills',
        'market.summary.target': 'Đích',
        'market.summary.total': 'Tổng cục bộ',
        'market.summary.configured': 'Có SKILL.md',
        'market.summary.missing': 'Thiếu SKILL.md',
        'market.summary.importable': 'Có thể nhập',
        'market.summary.importableDirect': 'Nhập trực tiếp',
        'market.root.fallback': 'Đường dẫn mặc định',
        'market.installed.title': 'Skills đã cài',
        'market.installed.note': 'Chỉ hiển thị top 6.',
        'market.local.refresh': 'Làm mới cục bộ',
        'market.local.refreshing': 'Đang làm mới...',
        'market.local.loading': 'Đang tải skills cục bộ...',
        'market.local.empty': 'Không tìm thấy skills đã cài.',
        'market.pill.verified': 'Đã xác minh',
        'market.pill.missingSkill': 'Thiếu SKILL.md',
        'market.import.title': 'Nguồn nhập',
        'market.import.note': 'Quét và nhập vào {target}.',
        'market.import.scan': 'Quét nguồn',
        'market.import.scanning': 'Đang quét...',
        'market.import.loading': 'Đang quét skills có thể nhập...',
        'market.import.empty': 'Chưa tìm thấy skills có thể nhập.',
        'market.pill.importableDirect': 'Nhập trực tiếp',
        'market.pill.importMissing': 'Thiếu SKILL.md',
        'market.actions.title': 'Phân phối',
        'market.actions.note': 'Hành động áp dụng cho đích hiện tại.',
        'market.action.manage.title': 'Quản lý skills cục bộ',
        'market.action.manage.copy': 'Quản lý skills đã cài cho {target}',
        'market.action.crossImport.title': 'Nhập từ app khác',
        'market.action.crossImport.copy': 'Nhập vào {target}',
        'market.action.zipImport.title': 'Nhập ZIP',
        'market.action.zipImport.copy': 'Nhập từ ZIP vào đích',
        'market.help.title': 'Cách hoạt động',
        'market.help.target.title': 'Chuyển đích',
        'market.help.target.copy': 'Hành động ghi vào thư mục {target}.',
        'market.help.crossImport.title': 'Nhập từ app khác',
        'market.help.crossImport.copy': 'Nhập skills chưa quản lý từ các host khác.',
        'market.help.zipImport.title': 'Nhập ZIP',
        'market.help.zipImport.copy': 'Nhập skills cục bộ từ file ZIP.',

        // Claude config panel
        'claude.addProvider': 'Thêm nhà cung cấp',
        'claude.applyDefault': 'Áp dụng cho ~/.claude/settings.json theo mặc định.',
        'claude.presetProviders': 'Preset nhà cung cấp',
        'claude.customConfig': 'Cấu hình tùy chỉnh',
        'claude.model': 'Model',
        'claude.model.placeholder': 'vd: claude-3-7-sonnet',
        'claude.model.hint': 'Thay đổi model được lưu và áp dụng vào cấu hình hiện tại tự động.',
        'claude.health.title': 'Kiểm tra sức khỏe cấu hình',
        'claude.health.run': 'Chạy kiểm tra',
        'claude.health.running': 'Đang kiểm tra...',
        'claude.health.hint': 'Chạy kiểm tra khả dụng cho tất cả cấu hình Claude và làm mới badge độ trễ.',
        'claude.health.progress': '{done}/{total} xong · {failed} thất bại',
        'claude.md.title': 'CLAUDE.md',
        'claude.md.open': 'Mở CLAUDE.md',
        'claude.md.hint': 'Đọc/ghi ~/.claude/CLAUDE.md.',
        'claude.model.unset': 'Model chưa đặt',
        'claude.configured': 'Đã cấu hình',
        'claude.notConfigured': 'Chưa cấu hình',
        'claude.action.edit': 'Chỉnh sửa',
        'claude.action.delete': 'Xóa',
        'claude.action.shareDisabled': 'Chia sẻ lệnh nhập',
        'claude.action.editAria': 'Chỉnh sửa cấu hình Claude: {name}',
        'claude.action.deleteAria': 'Xóa cấu hình Claude: {name}',
        'claude.action.clone': 'Nhân bản',
        'claude.action.cloneAria': 'Nhân bản cấu hình Claude: {name}',
        'claude.localBridge.poolTitle': 'Round-robin pool',
        'claude.localBridge.poolHint': 'Chọn nhà cung cấp để cân bằng tải',
        'claude.localBridge.noProviders': 'Không có nhà cung cấp. Thêm nhà cung cấp trước.',
        'claude.localBridge.disabled': 'Đã tắt',
        'claude.localBridge.enabled': 'Đã bật',

        // OpenClaw config panel
        'openclaw.applyHint': 'Ghi vào ~/.openclaw/openclaw.json (hỗ trợ JSON5).',
        'openclaw.agents.hint': 'Đọc/ghi AGENTS.md không gian làm việc. Mặc định: ~/.openclaw/workspace/AGENTS.md.',
        'openclaw.agents.open': 'Mở AGENTS.md',
        'openclaw.workspaceFile': 'File không gian làm việc',
        'openclaw.workspace.placeholder': 'vd: SOUL.md',
        'openclaw.workspace.hint': 'Chỉ hỗ trợ file .md bên trong Workspace.',
        'openclaw.workspace.open': 'Mở file không gian làm việc',
        'openclaw.configured': 'Đã cấu hình',
        'openclaw.notConfigured': 'Chưa cấu hình',
        'openclaw.action.edit': 'Chỉnh sửa',
        'openclaw.action.delete': 'Xóa',
        'modal.openclaw.quick.subtitle': '3 bước: điền nhà cung cấp/model, ghi vào editor, lưu & áp dụng.',
        'modal.openclaw.quick.step2': 'Ghi vào editor',
        'modal.openclaw.structured.writeHint': 'Ghi vào editor có thể định dạng lại JSON và bỏ comment.',
        'openclaw.action.editAria': 'Chỉnh sửa cấu hình OpenClaw: {name}',
        'openclaw.action.deleteAria': 'Xóa cấu hình OpenClaw: {name}'
    },'''

print("Patching i18n.dict.mjs...")
dict_content = I18N_DICT.read_text(encoding='utf-8')

if "'lang.vi': 'Tiếng Việt'" in dict_content:
    print("Vietnamese already patched in dict. Skipping.")
else:
    # Add trailing comma to last section before inserting vi
    # The last entry's closing } has no comma — fix before insert
    import re as _re2
    patched = _re2.sub(r'(    \})\n(\})\);', r'\1,\n\2);', dict_content, count=1)
    # Insert vi section before closing });
    patched = patched.replace('\n});\n\nexport { DICT }', f'\n{VI_DICT}\n}});\n\nexport {{ DICT }}')
    if VI_DICT[:20] not in patched:
        sys.exit("ERROR: Could not find insertion point in i18n.dict.mjs")
    # Fix literal newlines inside JS single-quoted string values
    vi_start = patched.index("    vi: {")
    before_vi = patched[:vi_start]
    vi_section = patched[vi_start:]
    def _fix_str_newlines(text):
        result = []
        i = 0
        while i < len(text):
            if text[i] == "'":
                j = i + 1
                while j < len(text) and not (text[j] == "'" and text[j-1] != "\\"):
                    j += 1
                raw = text[i:j+1]
                result.append(raw.replace('\n', '\\n'))
                i = j + 1
            else:
                result.append(text[i])
                i += 1
        return ''.join(result)
    patched = before_vi + _fix_str_newlines(vi_section)
    I18N_DICT.write_text(patched, encoding='utf-8')
    print("  ✓ i18n.dict.mjs patched")

print("Patching i18n.mjs (vi support + remove zh/ja defaults)...")
mjs_content = I18N_MJS.read_text(encoding='utf-8')
if "VI_PATCH_COMPLETE" in mjs_content:
    print("i18n.mjs already fully patched. Skipping.")
else:
    mjs_patched = mjs_content
    # Add vi detection (if not already there)
    if "if (normalized === 'vi')" not in mjs_patched:
        mjs_patched = mjs_patched.replace(
            "if (normalized === 'ja') return 'ja';",
            "if (normalized === 'vi') return 'vi';"
        )
    # Remove ja from normalizeLang
    mjs_patched = mjs_patched.replace(
        "if (normalized === 'ja') return 'ja';\n",
        ""
    )
    # Change default fallback from zh to vi
    mjs_patched = mjs_patched.replace("return 'zh';", "return 'vi';")
    # Remove zh fallback from t() — prevents Chinese text showing for missing VI keys
    mjs_patched = mjs_patched.replace(
        "const table = DICT[lang] || DICT.zh;\n            const fallbackEn = DICT.en;\n            const fallbackZh = DICT.zh;\n            const raw = (table && table[key]) || (fallbackEn && fallbackEn[key]) || (fallbackZh && fallbackZh[key]) || key;",
        "const table = DICT[lang] || DICT.vi;\n            const fallbackEn = DICT.en;\n            const raw = (table && table[key]) || (fallbackEn && fallbackEn[key]) || key;"
    )
    # Remove ja from DOM lang setter (both initI18n and setLang)
    mjs_patched = mjs_patched.replace(
        "else if (next === 'ja') document.documentElement.lang = 'ja';\n                    else if (next === 'vi') document.documentElement.lang = 'vi';",
        "else if (next === 'vi') document.documentElement.lang = 'vi';"
    )
    mjs_patched = mjs_patched.replace(
        "else if (next === 'ja') document.documentElement.lang = 'ja';",
        ""
    )
    # Change zh-CN fallback to vi
    mjs_patched = mjs_patched.replace(
        "else document.documentElement.lang = 'zh-CN';",
        "else document.documentElement.lang = 'vi';"
    )
    # Mark as complete
    mjs_patched = mjs_patched.replace(
        "const I18N_STORAGE_KEY = 'codexmateLang';",
        "const I18N_STORAGE_KEY = 'codexmateLang'; // VI_PATCH_COMPLETE"
    )
    I18N_MJS.write_text(mjs_patched, encoding='utf-8')
    print("  ✓ i18n.mjs patched")

print("Patching CSS lang switch...")
if CSS_SHELL.exists():
    css = CSS_SHELL.read_text(encoding='utf-8')
    if 'lang-switch-vi' in css:
        print("CSS already patched. Skipping.")
    else:
        css_patch = css.replace(
            '.lang-switch-track[data-lang="zh"] .lang-switch-en {',
            '.lang-switch-track[data-lang="vi"] .lang-switch-vi { opacity: 1; font-weight: 700; }\n.lang-switch-track[data-lang="zh"] .lang-switch-en {'
        )
        CSS_SHELL.write_text(css_patch, encoding='utf-8')
        print("  ✓ CSS patched")
else:
    print("  ⚠ CSS file not found, skipping")

print("Patching layout-header.html (remove ZH/JA buttons, add VI, set vi default)...")
HEADER_HTML = NODE_MODULES / "web-ui" / "partials" / "index" / "layout-header.html"
if HEADER_HTML.exists():
    html = HEADER_HTML.read_text(encoding='utf-8')
    if "setLang('zh')" not in html and "setLang('ja')" not in html:
        print("layout-header.html already patched. Skipping.")
    else:
        # Old 3-button block (ZH, EN, JA) — appears twice (header fab + side rail)
        OLD_BUTTONS = """\
                <button
                    type="button"
                    class="lang-choice-btn"
                    :aria-pressed="(lang || 'zh') === 'zh'"
                    :class="{ active: (lang || 'zh') === 'zh' }"
                    @click="setLang('zh')">ZH</button>
                <button
                    type="button"
                    class="lang-choice-btn"
                    :aria-pressed="(lang || 'zh') === 'en'"
                    :class="{ active: (lang || 'zh') === 'en' }"
                    @click="setLang('en')">EN</button>
                <button
                    type="button"
                    class="lang-choice-btn"
                    :aria-pressed="(lang || 'zh') === 'ja'"
                    :class="{ active: (lang || 'zh') === 'ja' }"
                    @click="setLang('ja')">日本語</button>"""
        NEW_BUTTONS = """\
                <button
                    type="button"
                    class="lang-choice-btn"
                    :aria-pressed="(lang || 'vi') === 'en'"
                    :class="{ active: (lang || 'vi') === 'en' }"
                    @click="setLang('en')">EN</button>
                <button
                    type="button"
                    class="lang-choice-btn"
                    :aria-pressed="(lang || 'vi') === 'vi'"
                    :class="{ active: (lang || 'vi') === 'vi' }"
                    @click="setLang('vi')">VI</button>"""
        patched = html.replace(OLD_BUTTONS, NEW_BUTTONS)
        # Regex: remove all ZH and JA buttons regardless of indentation
        import re as _re
        # Remove ZH button block
        patched = _re.sub(
            r'\s*<button[^>]*\n[^>]*\n[^>]*zh[^>]*\n[^>]*zh[^>]*\n[^>]*setLang\(\'zh\'\)[^<]*</button>',
            '', patched
        )
        # Remove JA button block
        patched = _re.sub(
            r'\s*<button[^>]*\n[^>]*\n[^>]*ja[^>]*\n[^>]*ja[^>]*\n[^>]*setLang\(\'ja\'\)[^<]*</button>',
            '', patched
        )
        # Fix default lang reference from 'zh' to 'vi' in remaining buttons
        patched = patched.replace("(lang || 'zh')", "(lang || 'vi')")

        if patched == html:
            print("  ⚠ No changes made — buttons may already be removed or pattern changed")
        else:
            HEADER_HTML.write_text(patched, encoding='utf-8')
            print("  ✓ layout-header.html patched (ZH+JA removed, VI default set)")
else:
    print("  ⚠ layout-header.html not found, skipping")

print("Patching web-ui-render.precompiled.js (compiled render — actual UI source)...")
RENDER_JS = NODE_MODULES / "web-ui" / "res" / "web-ui-render.precompiled.js"
if RENDER_JS.exists():
    render = RENDER_JS.read_text(encoding='utf-8')
    if "setLang('zh')" not in render and "setLang('ja')" not in render:
        print("web-ui-render.precompiled.js already patched. Skipping.")
    else:
        import re as _re3
        # For each indentation level (header fab=12sp, side-rail=16sp):
        def patch_render_buttons(code, indent):
            sp = ' ' * indent
            ZH = (f'{sp}_createElementVNode("button", {{\n'
                  f'{sp}  type: "button",\n'
                  f'{sp}  class: _normalizeClass(["lang-choice-btn", {{ active: (_ctx.lang || \'zh\') === \'zh\' }}]),\n'
                  f'{sp}  "aria-pressed": (_ctx.lang || \'zh\') === \'zh\',\n'
                  f'{sp}  onClick: $event => (_ctx.setLang(\'zh\'))\n'
                  f'{sp}}}, "ZH", 10 /* CLASS, PROPS */, ["aria-pressed", "onClick"]),')
            JA = (f'{sp}_createElementVNode("button", {{\n'
                  f'{sp}  type: "button",\n'
                  f'{sp}  class: _normalizeClass(["lang-choice-btn", {{ active: (_ctx.lang || \'zh\') === \'ja\' }}]),\n'
                  f'{sp}  "aria-pressed": (_ctx.lang || \'zh\') === \'ja\',\n'
                  f'{sp}  onClick: $event => (_ctx.setLang(\'ja\'))\n'
                  f'{sp}}}, "日本語", 10 /* CLASS, PROPS */, ["aria-pressed", "onClick"])')
            EN_OLD = (f'{sp}_createElementVNode("button", {{\n'
                      f'{sp}  type: "button",\n'
                      f'{sp}  class: _normalizeClass(["lang-choice-btn", {{ active: (_ctx.lang || \'zh\') === \'en\' }}]),\n'
                      f'{sp}  "aria-pressed": (_ctx.lang || \'zh\') === \'en\',\n'
                      f'{sp}  onClick: $event => (_ctx.setLang(\'en\'))\n'
                      f'{sp}}}, "EN", 10 /* CLASS, PROPS */, ["aria-pressed", "onClick"]),')
            EN_NEW = (f'{sp}_createElementVNode("button", {{\n'
                      f'{sp}  type: "button",\n'
                      f'{sp}  class: _normalizeClass(["lang-choice-btn", {{ active: (_ctx.lang || \'vi\') === \'en\' }}]),\n'
                      f'{sp}  "aria-pressed": (_ctx.lang || \'vi\') === \'en\',\n'
                      f'{sp}  onClick: $event => (_ctx.setLang(\'en\'))\n'
                      f'{sp}}}, "EN", 10 /* CLASS, PROPS */, ["aria-pressed", "onClick"]),\n'
                      f'{sp}_createElementVNode("button", {{\n'
                      f'{sp}  type: "button",\n'
                      f'{sp}  class: _normalizeClass(["lang-choice-btn", {{ active: (_ctx.lang || \'vi\') === \'vi\' }}]),\n'
                      f'{sp}  "aria-pressed": (_ctx.lang || \'vi\') === \'vi\',\n'
                      f'{sp}  onClick: $event => (_ctx.setLang(\'vi\'))\n'
                      f'{sp}}}, "VI", 10 /* CLASS, PROPS */, ["aria-pressed", "onClick"])')
            code = code.replace(ZH + '\n', '').replace(ZH, '')
            code = code.replace(JA + ',\n', '').replace(JA, '')
            code = code.replace(EN_OLD, EN_NEW)
            return code
        patched_r = patch_render_buttons(render, 12)  # header fab
        patched_r = patch_render_buttons(patched_r, 16)  # side rail
        RENDER_JS.write_text(patched_r, encoding='utf-8')
        zh_left = patched_r.count("setLang('zh')") + patched_r.count("setLang('ja')")
        vi_cnt  = patched_r.count("setLang('vi')")
        print(f"  ✓ render patched — ZH/JA remaining: {zh_left}, VI buttons: {vi_cnt}")
else:
    print("  ⚠ web-ui-render.precompiled.js not found, skipping")

print("\n✅ Patch complete! Restart codexmate — UI shows EN/VI only, default is VI.")
print("   node tools/codexmate/cli.js run")
