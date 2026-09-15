import AppKit
import Combine
import CryptoKit
import Darwin
import Foundation

enum StudioSurface: String, CaseIterable, Identifiable {
    case home
    case chat
    case files
    case design
    case git
    case tasks
    case devices
    case permissions
    case terminal
    case settings

    var id: String { rawValue }

    var title: String {
        switch self {
        case .home: "Không gian làm việc"
        case .chat: "Trò chuyện"
        case .files: "Tệp"
        case .design: "Thiết kế"
        case .git: "Git"
        case .tasks: "Công việc"
        case .devices: "Thiết bị"
        case .permissions: "Quyền hạn"
        case .terminal: "Terminal"
        case .settings: "Cài đặt"
        }
    }

    var symbol: String {
        switch self {
        case .home: "square.grid.2x2"
        case .chat: "message"
        case .files: "doc.text"
        case .design: "paintpalette"
        case .git: "point.3.connected.trianglepath.dotted"
        case .tasks: "checklist"
        case .devices: "desktopcomputer"
        case .permissions: "shield"
        case .terminal: "terminal"
        case .settings: "gearshape"
        }
    }
}

enum StudioAppearance: String, CaseIterable, Identifiable {
    case system
    case dark
    case light

    var id: String { rawValue }

    var title: String {
        switch self {
        case .system: "Theo hệ thống"
        case .dark: "Tối"
        case .light: "Sáng"
        }
    }
}

struct StudioProject: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let path: String
    let name: String
    let lastOpened: Date

    init(url: URL, lastOpened: Date = .now) {
        id = url.standardizedFileURL.path
        path = id
        name = url.lastPathComponent
        self.lastOpened = lastOpened
    }

    var url: URL { URL(fileURLWithPath: path) }
}

struct WorkspaceFile: Identifiable, Hashable {
    let url: URL
    let relativePath: String
    let isDirectory: Bool

    var id: String { url.path }
    var name: String { url.lastPathComponent }
}

struct GitFileChange: Identifiable, Equatable {
    let status: String
    let path: String

    var id: String { "\(status):\(path)" }
}

struct GitWorkspaceState: Equatable {
    let branch: String
    let changes: [GitFileChange]
    let message: String

    static let empty = GitWorkspaceState(branch: "", changes: [], message: "Chọn project để xem Git.")
}

struct StudioReadinessCheck: Identifiable, Equatable {
    let id: String
    let title: String
    let detail: String
    let isReady: Bool

    var symbol: String {
        isReady ? "checkmark.circle.fill" : "exclamationmark.triangle.fill"
    }
}

struct StudioHostProfile: Equatable, Sendable {
    let hostName: String
    let hardwareModel: String
    let processorName: String
    let architecture: String
    let operatingSystem: String
    let logicalCores: Int
    let physicalCores: Int?
    let memoryBytes: UInt64
    let uptime: TimeInterval

    var memoryLabel: String {
        ByteCountFormatter.string(fromByteCount: Int64(memoryBytes), countStyle: .memory)
    }

    var processorLabel: String {
        processorName.isEmpty ? "Không xác định" : processorName
    }

    var uptimeLabel: String {
        let totalMinutes = max(0, Int(uptime) / 60)
        let days = totalMinutes / 1_440
        let hours = (totalMinutes % 1_440) / 60
        let minutes = totalMinutes % 60
        if days > 0 { return "\(days) ngày \(hours) giờ" }
        if hours > 0 { return "\(hours) giờ \(minutes) phút" }
        return "\(minutes) phút"
    }
}

private enum StudioHostProfileReader {
    static func read() -> StudioHostProfile {
        let processInfo = ProcessInfo.processInfo
        return StudioHostProfile(
            hostName: processInfo.hostName,
            hardwareModel: sysctlString("hw.model") ?? "Mac",
            processorName: sysctlString("machdep.cpu.brand_string") ?? "Apple Silicon",
            architecture: sysctlString("hw.machine") ?? "arm64",
            operatingSystem: processInfo.operatingSystemVersionString,
            logicalCores: processInfo.processorCount,
            physicalCores: sysctlInt("hw.physicalcpu"),
            memoryBytes: processInfo.physicalMemory,
            uptime: processInfo.systemUptime
        )
    }

    private static func sysctlString(_ name: String) -> String? {
        var size: size_t = 0
        guard sysctlbyname(name, nil, &size, nil, 0) == 0, size > 0 else { return nil }
        var value = [CChar](repeating: 0, count: Int(size))
        guard sysctlbyname(name, &value, &size, nil, 0) == 0 else { return nil }
        let bytes = value.prefix { $0 != 0 }.map { UInt8(bitPattern: $0) }
        let result = String(decoding: bytes, as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines)
        return result.isEmpty ? nil : result
    }

    private static func sysctlInt(_ name: String) -> Int? {
        var value: Int32 = 0
        var size = MemoryLayout<Int32>.size
        guard sysctlbyname(name, &value, &size, nil, 0) == 0 else { return nil }
        return Int(value)
    }
}

struct StudioTask: Identifiable, Codable, Equatable {
    let id: UUID
    let title: String
    let createdAt: Date
    var completedAt: Date?

    init(id: UUID = UUID(), title: String, createdAt: Date = .now, completedAt: Date? = nil) {
        self.id = id
        self.title = title
        self.createdAt = createdAt
        self.completedAt = completedAt
    }

    var isCompleted: Bool { completedAt != nil }
}

struct RuntimeTask: Identifiable, Decodable {
    let id: String
    let name: String
    let status: String
    let scope: String?
    let createdAt: String
    let updatedAt: String
    let blocked: Bool

    private enum CodingKeys: String, CodingKey {
        case id, name, status, scope, blocked
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        name = try container.decode(String.self, forKey: .name)
        status = try container.decode(String.self, forKey: .status)
        scope = try container.decodeIfPresent(String.self, forKey: .scope)
        createdAt = try container.decode(String.self, forKey: .createdAt)
        updatedAt = try container.decode(String.self, forKey: .updatedAt)
        blocked = try container.decodeIfPresent(Bool.self, forKey: .blocked) ?? false
    }

    var statusTitle: String {
        if blocked { return "Bị chặn" }
        switch status {
        case "done": return "Hoàn tất"
        case "in_progress": return "Đang làm"
        default: return "Đang mở"
        }
    }

    var statusSymbol: String {
        if blocked { return "exclamationmark.triangle.fill" }
        switch status {
        case "done": return "checkmark.circle.fill"
        case "in_progress": return "play.circle.fill"
        default: return "circle"
        }
    }
}

private struct RuntimeTaskList: Decodable {
    let tasks: [RuntimeTask]
}

struct RuntimeLease: Identifiable, Decodable {
    let id: String
    let subject: String
    let capability: String
    let allow: [String]
    let issuedBy: String
    let expiresAt: String
    let remaining: Int?
    let revoked: Bool

    private enum CodingKeys: String, CodingKey {
        case id, subject, capability, allow, remaining, revoked
        case issuedBy = "issued_by"
        case expiresAt = "expires_at"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        subject = try container.decode(String.self, forKey: .subject)
        capability = try container.decode(String.self, forKey: .capability)
        allow = try container.decodeIfPresent([String].self, forKey: .allow) ?? []
        issuedBy = try container.decodeIfPresent(String.self, forKey: .issuedBy) ?? "runtime"
        expiresAt = try container.decodeIfPresent(String.self, forKey: .expiresAt) ?? ""
        remaining = try container.decodeIfPresent(Int.self, forKey: .remaining)
        revoked = try container.decodeIfPresent(Bool.self, forKey: .revoked) ?? false
    }

    var statusTitle: String {
        if revoked { return "Đã thu hồi" }
        if let remaining, remaining == 0 { return "Hết lượt" }
        return "Đang hiệu lực"
    }
}

struct RuntimeApprovalCall: Decodable {
    let id: String
    let name: String
    let argumentsJSON: String

    private enum CodingKeys: String, CodingKey {
        case id, name
        case argumentsJSON = "arguments_json"
    }
}

private struct RuntimeApprovalSession: Decodable {
    let sessionID: String?

    private enum CodingKeys: String, CodingKey {
        case sessionID = "session_id"
    }
}

private struct RuntimeApprovalContext: Decodable {
    let session: RuntimeApprovalSession?
}

struct RuntimePendingApproval: Identifiable, Decodable {
    let approvalID: String
    let pendingCall: RuntimeApprovalCall
    let authorityReason: String
    let createdAt: String
    let expiresAt: String
    let resolved: Bool
    let decision: Bool?
    let decidedBy: String?
    let sessionID: String?

    private enum CodingKeys: String, CodingKey {
        case approvalID = "approval_id"
        case pendingCall = "pending_call"
        case authorityReason = "authority_reason"
        case createdAt = "created_at"
        case expiresAt = "expires_at"
        case resolved, decision
        case decidedBy = "decided_by"
        case context
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        approvalID = try container.decode(String.self, forKey: .approvalID)
        pendingCall = try container.decode(RuntimeApprovalCall.self, forKey: .pendingCall)
        authorityReason = try container.decodeIfPresent(String.self, forKey: .authorityReason) ?? "Cần xác nhận của con người."
        createdAt = try container.decodeIfPresent(String.self, forKey: .createdAt) ?? ""
        expiresAt = try container.decodeIfPresent(String.self, forKey: .expiresAt) ?? ""
        resolved = try container.decodeIfPresent(Bool.self, forKey: .resolved) ?? false
        decision = try container.decodeIfPresent(Bool.self, forKey: .decision)
        decidedBy = try container.decodeIfPresent(String.self, forKey: .decidedBy)
        let context = try container.decodeIfPresent(RuntimeApprovalContext.self, forKey: .context)
        sessionID = context?.session?.sessionID
    }

    var id: String { approvalID }
    var isPending: Bool { !resolved }
}

private struct WorkspaceFileRevision: Equatable {
    let bytes: Int
    let digest: Data
}

private enum WorkspaceFileError: LocalizedError {
    case unavailableProject
    case unsafePath
    case sensitivePath
    case notRegularFile
    case fileTooLarge
    case binaryFile
    case invalidUTF8
    case changedOnDisk
    case writeFailed(String)

    var errorDescription: String? {
        switch self {
        case .unavailableProject:
            "Hãy mở lại project trước khi thao tác tệp."
        case .unsafePath:
            "Yana chỉ mở tệp thường nằm trong project đã chọn."
        case .sensitivePath:
            "Tệp nhạy cảm bị loại khỏi editor native."
        case .notRegularFile:
            "Chỉ có thể mở tệp văn bản thông thường."
        case .fileTooLarge:
            "Editor native hiện giới hạn tệp dưới 8 MB."
        case .binaryFile:
            "Tệp nhị phân không thể mở bằng editor văn bản."
        case .invalidUTF8:
            "Tệp không phải văn bản UTF-8 hợp lệ."
        case .changedOnDisk:
            "Tệp đã thay đổi trên ổ đĩa. Yana đã hủy lưu để giữ bản mới hơn."
        case .writeFailed(let detail):
            "Không thể lưu tệp: \(detail)"
        }
    }
}

struct StudioMessage: Identifiable, Equatable, Codable {
    enum Role: String, Codable {
        case user
        case assistant
        case system
    }

    let id: UUID
    let role: Role
    let content: String

    init(id: UUID = UUID(), role: Role, content: String) {
        self.id = id
        self.role = role
        self.content = content
    }
}

struct StudioChatAttachment: Identifiable, Equatable {
    let relativePath: String
    let text: String

    var id: String { relativePath }
}

func makeRuntimeTask(message: String, attachments: [StudioChatAttachment]) -> String {
    guard !attachments.isEmpty else { return message }
    let context = attachments.map { attachment in
        "[Tệp đính kèm: \(attachment.relativePath)]\n```\n\(attachment.text)\n```"
    }
    return "\(context.joined(separator: "\n\n"))\n\n\(message)"
}

struct StudioConversation: Identifiable, Equatable, Codable {
    let id: UUID
    var title: String
    var updatedAt: Date

    init(id: UUID = UUID(), title: String = "Cuộc trò chuyện mới", updatedAt: Date = .now) {
        self.id = id
        self.title = title
        self.updatedAt = updatedAt
    }
}

struct RuntimeProfile: Sendable {
    let provider: String
    let model: String
    let apiKey: String
    let baseURL: String
}

struct RuntimeHistoryItem: Sendable {
    let role: String
    let content: String
}

@MainActor
final class StudioStore: ObservableObject {
    @Published var selectedSurface: StudioSurface = .home
    @Published private(set) var accountStatus = StudioAccountStatus.empty
    @Published private(set) var accountError: String?
    @Published private(set) var isAuthenticating = false
    @Published private(set) var projects: [StudioProject] = []
    @Published var selectedProjectID: String?
    @Published private(set) var workspaceFiles: [WorkspaceFile] = []
    @Published private(set) var designTokens: [DesignToken] = []
    @Published private(set) var isScanningDesignTokens = false
    @Published private(set) var hasScannedDesignTokens = false
    @Published var selectedFile: WorkspaceFile?
    @Published var selectedFileText = "Chọn một tệp để xem nội dung."
    @Published private(set) var selectedFileIsEditable = false
    @Published private(set) var hasUnsavedFileChanges = false
    @Published private(set) var gitState = GitWorkspaceState.empty
    @Published private(set) var isRefreshingGit = false
    @Published private(set) var selectedGitChange: GitFileChange?
    @Published private(set) var gitDiff = "Chọn một tệp đã thay đổi để xem diff chỉ đọc."
    @Published private(set) var isLoadingGitDiff = false
    @Published private(set) var tasks: [StudioTask] = []
    @Published private(set) var runtimeTasks: [RuntimeTask] = []
    @Published private(set) var isRefreshingRuntimeTasks = false
    @Published private(set) var isUpdatingRuntimeTasks = false
    @Published private(set) var hasLoadedRuntimeTasks = false
    @Published private(set) var runtimeLeases: [RuntimeLease] = []
    @Published private(set) var isRefreshingRuntimeLeases = false
    @Published private(set) var hasLoadedRuntimeLeases = false
    @Published private(set) var runtimePendingApprovals: [RuntimePendingApproval] = []
    @Published private(set) var isRefreshingRuntimeApprovals = false
    @Published private(set) var hasLoadedRuntimeApprovals = false
    @Published private(set) var isResolvingRuntimeApproval = false
    @Published private(set) var hostProfile: StudioHostProfile?
    @Published private(set) var isRefreshingHostProfile = false
    @Published private(set) var readinessChecks: [StudioReadinessCheck] = []
    @Published var taskDraft = ""
    @Published var runtimeTaskDraft = ""
    @Published var runtimeTaskScope = ""
    @Published private(set) var conversations: [StudioConversation] = []
    @Published private(set) var selectedConversationID: UUID?
    @Published var messages: [StudioMessage] = []
    @Published var draft = ""
    @Published private(set) var chatAttachments: [StudioChatAttachment] = []
    @Published var terminalCommand = ""
    @Published private(set) var terminalOutput = "Chạy một lệnh trong project đã mở. Output được giữ trong phiên hiện tại."
    @Published private(set) var isTerminalRunning = false
    @Published private(set) var isTerminalSessionOpen = false
    @Published var runtimePath = ""
    @Published var provider = "ollama"
    @Published var model = ""
    @Published var sessionKey = ""
    @Published var customBaseURL = ""
    @Published var appearance: StudioAppearance = .system
    @Published var glassStrength = 0.62
    @Published private(set) var localModels: [String] = []
    @Published private(set) var isDiscoveringLocalModels = false
    @Published var isSending = false
    @Published var notice: String?

    private let maxRecentProjects = 20
    private let defaultsKey = "yana-studio-native.projects.v1"
    private let selectedProjectKey = "yana-studio-native.selected-project.v1"
    private let runtimePathKey = "yana-studio-native.runtime-path.v1"
    private let runtimeProviderKey = "yana-studio-native.runtime-provider.v1"
    private let runtimeModelKey = "yana-studio-native.runtime-model.v1"
    private let customBaseURLKey = "yana-studio-native.custom-base-url.v1"
    private let appearanceKey = "yana-studio-native.appearance.v1"
    private let glassStrengthKey = "yana-studio-native.glass-strength.v1"
    private let chatHistoryPrefix = "yana-studio-native.chat-history.v1."
    private let conversationListPrefix = "yana-studio-native.conversation-list.v1."
    private let selectedConversationPrefix = "yana-studio-native.selected-conversation.v1."
    private let conversationHistoryPrefix = "yana-studio-native.conversation-history.v1."
    private let taskListPrefix = "yana-studio-native.tasks.v1."
    private let maxEditableFileBytes = 8 * 1024 * 1024
    private let maxTerminalOutputBytes = 4 * 1024 * 1024
    private let maxRuntimeTaskBytes = 40_000
    private let maxRuntimeHistoryBytes = 400_000
    private let maxChatAttachments = 4
    private let maxChatAttachmentBytes = 8 * 1024
    private var localAccountStore: LocalAccountStore?
    private var selectedFileRevision: WorkspaceFileRevision?
    private var terminalProcess: Process?
    private var terminalSessionProcess: Process?
    private var terminalSessionInput: FileHandle?
    private var runtimeTaskProcess: Process?
    private var runtimeLeaseProcess: Process?
    private var runtimeApprovalProcess: Process?
    private var chatProcess: Process?
    private var chatOutputBuffer = ""
    private var chatErrorBuffer = ""
    private var chatWasStopped = false
    private var chatReceivedTerminalEvent = false
    private var chatRuntimeError = ""
    private var activeAssistantMessageID: UUID?
    private var chatWatchdog: DispatchWorkItem?

    init() {
        do {
            let accountStore = try LocalAccountStore()
            localAccountStore = accountStore
            accountStatus = accountStore.status
        } catch {
            accountError = error.localizedDescription
        }
        appearance = StudioAppearance(rawValue: UserDefaults.standard.string(forKey: appearanceKey) ?? "") ?? .system
        glassStrength = UserDefaults.standard.object(forKey: glassStrengthKey) as? Double ?? 0.62
        loadRuntimeConfiguration()
        loadProjects()
        refreshReadiness()
    }

    var requiresAuthentication: Bool {
        !accountStatus.configured || accountStatus.locked
    }

    var selectedProject: StudioProject? {
        projects.first(where: { $0.id == selectedProjectID })
    }

    var activeConversationTitle: String {
        conversations.first(where: { $0.id == selectedConversationID })?.title ?? "Cuộc trò chuyện mới"
    }

    var hasRuntimeConfiguration: Bool {
        let normalizedBaseURL = customBaseURL.trimmingCharacters(in: .whitespacesAndNewlines)
        return !runtimePath.isEmpty
            && !model.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && (provider != "custom" || isValidCustomBaseURL(normalizedBaseURL))
    }

    var canSaveSelectedFile: Bool {
        selectedFileIsEditable && hasUnsavedFileChanges && selectedFileRevision != nil
    }

    func createLocalAccount(displayName: String, email: String, password: String) {
        guard let localAccountStore else {
            accountError = "Hồ sơ local không khả dụng trên máy này."
            return
        }
        isAuthenticating = true
        defer { isAuthenticating = false }
        do {
            accountStatus = try localAccountStore.create(
                displayName: displayName,
                email: email,
                password: password
            )
            accountError = nil
            notice = "Đã tạo hồ sơ local. Dữ liệu vẫn ở trên máy anh."
            refreshReadiness()
        } catch {
            accountError = error.localizedDescription
        }
    }

    func unlockStudio(password: String) {
        guard let localAccountStore else {
            accountError = "Hồ sơ local không khả dụng trên máy này."
            return
        }
        isAuthenticating = true
        defer { isAuthenticating = false }
        do {
            accountStatus = try localAccountStore.unlock(password: password)
            accountError = nil
            notice = "Yana Studio đã được mở khóa."
            refreshReadiness()
        } catch {
            accountError = error.localizedDescription
        }
    }

    func lockStudio() {
        guard let localAccountStore else { return }
        accountStatus = localAccountStore.lock()
        selectedSurface = .home
        refreshReadiness()
    }

    func refreshHostProfile() {
        guard !isRefreshingHostProfile else { return }
        isRefreshingHostProfile = true
        Task {
            let profile = await Task.detached(priority: .userInitiated) {
                StudioHostProfileReader.read()
            }.value
            hostProfile = profile
            isRefreshingHostProfile = false
        }
    }

    func refreshReadiness() {
        let projectReady: Bool
        let projectDetail: String
        if let project = selectedProject {
            var isDirectory: ObjCBool = false
            projectReady = FileManager.default.fileExists(atPath: project.path, isDirectory: &isDirectory)
                && isDirectory.boolValue
                && FileManager.default.isReadableFile(atPath: project.path)
            projectDetail = projectReady ? project.name : "Project đã chọn không còn đọc được."
        } else {
            projectReady = false
            projectDetail = "Chọn một thư mục project local."
        }

        let runtimeReady = !runtimePath.isEmpty && FileManager.default.isExecutableFile(atPath: runtimePath)
        let runtimeDetail: String
        if runtimePath.isEmpty {
            runtimeDetail = "Chọn binary yana-rt trong Cài đặt."
        } else if runtimeReady {
            runtimeDetail = URL(fileURLWithPath: runtimePath).lastPathComponent
        } else {
            runtimeDetail = "Binary đã chọn không còn có quyền thực thi."
        }

        let modelReady = !model.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        readinessChecks = [
            StudioReadinessCheck(
                id: "profile",
                title: "Hồ sơ local",
                detail: accountStatus.configured
                    ? (accountStatus.locked ? "Hồ sơ đang khóa." : "\(accountStatus.displayName) · đã mở khóa.")
                    : "Tạo một hồ sơ local để tiếp tục.",
                isReady: accountStatus.configured && !accountStatus.locked
            ),
            StudioReadinessCheck(id: "project", title: "Project", detail: projectDetail, isReady: projectReady),
            StudioReadinessCheck(id: "runtime", title: "Yana Runtime", detail: runtimeDetail, isReady: runtimeReady),
            StudioReadinessCheck(
                id: "model",
                title: "Model",
                detail: modelReady ? "\(provider) · \(model)" : "Chọn model để gửi chat qua runtime.",
                isReady: modelReady
            ),
        ]
    }

    func revealLocalData() {
        guard let localAccountStore else {
            notice = "Không tìm được thư mục dữ liệu local."
            return
        }
        NSWorkspace.shared.activateFileViewerSelecting([localAccountStore.storageDirectoryURL])
    }

    func chooseProject() {
        let panel = NSOpenPanel()
        panel.title = "Chọn project cho Yana Studio"
        panel.prompt = "Mở project"
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = false
        guard panel.runModal() == .OK, let url = panel.url else { return }
        addProject(url)
    }

    func chooseRuntime() {
        let panel = NSOpenPanel()
        panel.title = "Chọn binary yana-rt"
        panel.prompt = "Chọn runtime"
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = false
        guard panel.runModal() == .OK, let url = panel.url else { return }
        guard FileManager.default.isExecutableFile(atPath: url.path) else {
            notice = "Hãy chọn binary yana-rt có quyền thực thi."
            return
        }
        runtimePath = url.path
        notice = "Đã chọn runtime: \(url.lastPathComponent)"
        refreshReadiness()
    }

    func selectProject(_ project: StudioProject) {
        guard !isSending else {
            notice = "Đợi lượt trả lời hiện tại xong rồi chuyển project."
            return
        }
        let openedProject = StudioProject(url: project.url)
        projects.removeAll { $0.id == openedProject.id }
        projects.insert(openedProject, at: 0)
        projects = Array(projects.prefix(maxRecentProjects))
        selectedProjectID = openedProject.id
        persistProjects()
        loadWorkspaceFiles()
        refreshGitStatus()
        loadMessages()
        loadTasks()
        runtimeTasks = []
        hasLoadedRuntimeTasks = false
        runtimeLeases = []
        hasLoadedRuntimeLeases = false
        runtimePendingApprovals = []
        hasLoadedRuntimeApprovals = false
        designTokens = []
        hasScannedDesignTokens = false
        refreshReadiness()
    }

    func selectConversation(_ conversation: StudioConversation) {
        guard !isSending else {
            notice = "Đợi lượt trả lời hiện tại xong rồi chuyển cuộc trò chuyện."
            return
        }
        guard selectedConversationID != conversation.id, let project = selectedProject else { return }
        persistMessages()
        selectedConversationID = conversation.id
        UserDefaults.standard.set(conversation.id.uuidString, forKey: selectedConversationKey(for: project))
        messages = loadMessages(for: conversation, project: project)
    }

    func createConversation() {
        guard let project = selectedProject else {
            notice = "Hãy mở project trước khi tạo cuộc trò chuyện."
            return
        }
        guard !isSending else {
            notice = "Đợi lượt trả lời hiện tại xong rồi tạo cuộc trò chuyện mới."
            return
        }
        persistMessages()
        let conversation = StudioConversation()
        conversations.insert(conversation, at: 0)
        selectedConversationID = conversation.id
        messages = []
        persistConversations(for: project)
        UserDefaults.standard.set(conversation.id.uuidString, forKey: selectedConversationKey(for: project))
        persistMessages()
    }

    func chooseChatAttachments() {
        guard let project = selectedProject else {
            notice = "Hãy mở project trước khi đính kèm tệp."
            return
        }
        guard !isSending else { return }
        let remainingSlots = maxChatAttachments - chatAttachments.count
        guard remainingSlots > 0 else {
            notice = "Mỗi tin nhắn chỉ có tối đa \(maxChatAttachments) tệp đính kèm."
            return
        }

        let panel = NSOpenPanel()
        panel.title = "Đính kèm tệp từ project"
        panel.prompt = "Đính kèm"
        panel.directoryURL = project.url
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = true
        guard panel.runModal() == .OK else { return }

        let root = project.url.resolvingSymlinksInPath().standardizedFileURL
        let rootPath = root.path.hasSuffix("/") ? root.path : root.path + "/"
        let existing = Set(chatAttachments.map(\.relativePath))
        var additions: [StudioChatAttachment] = []

        for url in panel.urls where additions.count < remainingSlots {
            do {
                let file = WorkspaceFile(url: url, relativePath: url.lastPathComponent, isDirectory: false)
                let resolved = try resolvedProjectFile(for: file)
                let data = try Data(contentsOf: resolved, options: .mappedIfSafe)
                guard data.count <= maxChatAttachmentBytes else { continue }
                guard !data.contains(0), let text = String(data: data, encoding: .utf8) else { continue }
                let relativePath = String(resolved.path.dropFirst(rootPath.count))
                guard !existing.contains(relativePath), !additions.contains(where: { $0.relativePath == relativePath }) else {
                    continue
                }
                additions.append(StudioChatAttachment(relativePath: relativePath, text: text))
            } catch {
                continue
            }
        }

        guard !additions.isEmpty else {
            notice = "Không có tệp văn bản an toàn nào để đính kèm. Mỗi tệp phải nằm trong project và dưới 8 KB."
            return
        }
        chatAttachments += additions
        notice = "Đã đính kèm \(additions.count) tệp cho tin nhắn tiếp theo."
    }

    func removeChatAttachment(_ attachment: StudioChatAttachment) {
        chatAttachments.removeAll { $0.id == attachment.id }
    }

    func scanDesignTokens() {
        guard let project = selectedProject else {
            notice = "Hãy mở project trước khi quét màu thiết kế."
            return
        }
        guard !isScanningDesignTokens else { return }
        isScanningDesignTokens = true
        let projectID = project.id
        let root = project.url

        Task {
            do {
                let tokens = try await Task.detached(priority: .userInitiated) {
                    try DesignTokenScanner.scan(projectRoot: root)
                }.value
                isScanningDesignTokens = false
                guard selectedProjectID == projectID else { return }
                designTokens = tokens
                hasScannedDesignTokens = true
                notice = tokens.isEmpty
                    ? "Không tìm thấy mã màu trong các tệp giao diện an toàn."
                    : "Đã tìm thấy \(tokens.count) màu trong project."
            } catch {
                isScanningDesignTokens = false
                guard selectedProjectID == projectID else { return }
                designTokens = []
                hasScannedDesignTokens = true
                notice = error.localizedDescription
            }
        }
    }

    func openDesignToken(_ token: DesignToken) {
        guard let file = workspaceFiles.first(where: { $0.relativePath == token.relativePath && !$0.isDirectory }) else {
            notice = "Tệp nguồn của màu này không còn nằm trong danh sách project."
            return
        }
        openFile(file)
        selectedSurface = .files
    }

    func openFile(_ file: WorkspaceFile) {
        guard !file.isDirectory else { return }
        selectedFile = file
        selectedFileIsEditable = false
        hasUnsavedFileChanges = false
        selectedFileRevision = nil
        do {
            let resolved = try resolvedProjectFile(for: file)
            let data = try Data(contentsOf: resolved, options: .mappedIfSafe)
            guard data.count <= maxEditableFileBytes else { throw WorkspaceFileError.fileTooLarge }
            guard !data.contains(0) else { throw WorkspaceFileError.binaryFile }
            guard let text = String(data: data, encoding: .utf8) else {
                throw WorkspaceFileError.invalidUTF8
            }
            selectedFileText = text
            selectedFileRevision = revision(for: data)
            selectedFileIsEditable = true
        } catch {
            selectedFileText = "Không thể đọc tệp này như văn bản UTF-8."
            notice = error.localizedDescription
        }
    }

    func updateSelectedFileText(_ text: String) {
        guard selectedFileIsEditable else { return }
        selectedFileText = text
        hasUnsavedFileChanges = true
    }

    func saveSelectedFile() {
        guard let file = selectedFile, let expectedRevision = selectedFileRevision else { return }
        do {
            let resolved = try resolvedProjectFile(for: file)
            let data = Data(selectedFileText.utf8)
            guard data.count <= maxEditableFileBytes else { throw WorkspaceFileError.fileTooLarge }
            let current = try Data(contentsOf: resolved, options: .mappedIfSafe)
            guard revision(for: current) == expectedRevision else {
                throw WorkspaceFileError.changedOnDisk
            }
            try atomicallyWrite(data, replacing: resolved, expectedRevision: expectedRevision)
            selectedFileRevision = revision(for: data)
            hasUnsavedFileChanges = false
            notice = "Đã lưu \(file.name)."
        } catch {
            notice = error.localizedDescription
        }
    }

    func createTask() {
        guard let project = selectedProject else {
            notice = "Hãy mở project trước khi tạo công việc."
            return
        }
        let title = taskDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty, title.count <= 240 else {
            notice = "Tên công việc cần từ 1 đến 240 ký tự."
            return
        }
        tasks.insert(StudioTask(title: title), at: 0)
        taskDraft = ""
        persistTasks(for: project)
    }

    func toggleTask(_ task: StudioTask) {
        guard let index = tasks.firstIndex(where: { $0.id == task.id }), let project = selectedProject else { return }
        tasks[index].completedAt = tasks[index].completedAt == nil ? .now : nil
        persistTasks(for: project)
    }

    func refreshRuntimeTasks() {
        guard let project = selectedProject else {
            runtimeTasks = []
            return
        }
        guard !isRefreshingRuntimeTasks else { return }
        guard FileManager.default.isExecutableFile(atPath: runtimePath) else {
            notice = "Chọn yana-rt trong Cài đặt để đọc task từ runtime."
            selectedSurface = .settings
            return
        }

        let outputURL = FileManager.default.temporaryDirectory.appendingPathComponent(
            "yana-studio-runtime-tasks-\(UUID().uuidString).json"
        )
        guard FileManager.default.createFile(
            atPath: outputURL.path,
            contents: nil,
            attributes: [.posixPermissions: 0o600]
        ) else {
            notice = "Không thể tạo vùng đọc task runtime."
            return
        }

        do {
            let outputHandle = try FileHandle(forWritingTo: outputURL)
            let process = Process()
            process.executableURL = URL(fileURLWithPath: runtimePath)
            process.currentDirectoryURL = project.url
            process.arguments = ["task", "list", "--json"]
            process.standardOutput = outputHandle
            process.standardError = outputHandle
            process.terminationHandler = { [weak self] completedProcess in
                try? outputHandle.synchronize()
                try? outputHandle.close()
                let output = Self.readTerminalOutput(from: outputURL, limit: 1_024 * 1_024)
                try? FileManager.default.removeItem(at: outputURL)
                Task { @MainActor [weak self] in
                    self?.finishRuntimeTaskRefresh(output: output, terminationStatus: completedProcess.terminationStatus)
                }
            }
            runtimeTaskProcess = process
            isRefreshingRuntimeTasks = true
            try process.run()
        } catch {
            try? FileManager.default.removeItem(at: outputURL)
            runtimeTaskProcess = nil
            isRefreshingRuntimeTasks = false
            notice = "Không thể chạy yana-rt task list: \(error.localizedDescription)"
        }
    }

    private func finishRuntimeTaskRefresh(output: String, terminationStatus: Int32) {
        isRefreshingRuntimeTasks = false
        runtimeTaskProcess = nil
        guard terminationStatus == 0 else {
            notice = output.isEmpty ? "yana-rt không thể đọc task runtime." : output
            return
        }
        guard let data = output.data(using: .utf8) else {
            notice = "Runtime trả về dữ liệu task không đọc được."
            return
        }
        do {
            runtimeTasks = try JSONDecoder().decode(RuntimeTaskList.self, from: data).tasks
            hasLoadedRuntimeTasks = true
        } catch {
            notice = "Không đọc được danh sách task từ runtime: \(error.localizedDescription)"
        }
    }

    func createRuntimeTask() {
        let title = runtimeTaskDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        let scope = runtimeTaskScope.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty, title.count <= 500 else {
            notice = "Tên task runtime cần từ 1 đến 500 ký tự."
            return
        }
        guard scope.count <= 200 else {
            notice = "Phạm vi task runtime tối đa 200 ký tự."
            return
        }

        var arguments = ["task", "create", title, "--json"]
        if !scope.isEmpty {
            arguments.append(contentsOf: ["--scope", scope])
        }
        runRuntimeTaskMutation(arguments: arguments, successMessage: "Đã tạo task trong Yana Runtime.")
    }

    func completeRuntimeTask(_ task: RuntimeTask, evidence: String) {
        let normalizedEvidence = evidence.trimmingCharacters(in: .whitespacesAndNewlines)
        guard task.status != "done" else { return }
        guard !normalizedEvidence.isEmpty, normalizedEvidence.count <= 4_000 else {
            notice = "Cần bằng chứng từ 1 đến 4.000 ký tự để hoàn tất task runtime."
            return
        }
        runRuntimeTaskMutation(
            arguments: ["task", "done", task.id, "--evidence", normalizedEvidence, "--json"],
            successMessage: "Đã đánh dấu task hoàn tất trong Yana Runtime."
        )
    }

    private func runRuntimeTaskMutation(arguments: [String], successMessage: String) {
        guard let project = selectedProject else {
            notice = "Hãy mở project trước khi thao tác task runtime."
            return
        }
        guard !isRefreshingRuntimeTasks, !isUpdatingRuntimeTasks else { return }
        guard FileManager.default.isExecutableFile(atPath: runtimePath) else {
            notice = "Chọn yana-rt trong Cài đặt trước khi thao tác task runtime."
            selectedSurface = .settings
            return
        }

        let outputURL = FileManager.default.temporaryDirectory.appendingPathComponent(
            "yana-studio-runtime-task-write-\(UUID().uuidString).json"
        )
        guard FileManager.default.createFile(
            atPath: outputURL.path,
            contents: nil,
            attributes: [.posixPermissions: 0o600]
        ) else {
            notice = "Không thể tạo vùng thao tác task runtime."
            return
        }

        do {
            let outputHandle = try FileHandle(forWritingTo: outputURL)
            let process = Process()
            process.executableURL = URL(fileURLWithPath: runtimePath)
            process.currentDirectoryURL = project.url
            process.arguments = arguments
            process.standardOutput = outputHandle
            process.standardError = outputHandle
            process.terminationHandler = { [weak self] completedProcess in
                try? outputHandle.synchronize()
                try? outputHandle.close()
                let output = Self.readTerminalOutput(from: outputURL, limit: 1_024 * 1_024)
                try? FileManager.default.removeItem(at: outputURL)
                Task { @MainActor [weak self] in
                    self?.finishRuntimeTaskMutation(
                        output: output,
                        terminationStatus: completedProcess.terminationStatus,
                        successMessage: successMessage
                    )
                }
            }
            runtimeTaskProcess = process
            isUpdatingRuntimeTasks = true
            try process.run()
        } catch {
            try? FileManager.default.removeItem(at: outputURL)
            runtimeTaskProcess = nil
            isUpdatingRuntimeTasks = false
            notice = "Không thể chạy yana-rt task: \(error.localizedDescription)"
        }
    }

    private func finishRuntimeTaskMutation(output: String, terminationStatus: Int32, successMessage: String) {
        isUpdatingRuntimeTasks = false
        runtimeTaskProcess = nil
        guard terminationStatus == 0 else {
            notice = output.isEmpty ? "yana-rt không thể cập nhật task runtime." : output
            return
        }
        runtimeTaskDraft = ""
        runtimeTaskScope = ""
        notice = successMessage
        refreshRuntimeTasks()
    }

    func refreshRuntimeLeases() {
        guard let project = selectedProject else {
            runtimeLeases = []
            hasLoadedRuntimeLeases = false
            return
        }
        guard !isRefreshingRuntimeLeases else { return }
        guard FileManager.default.isExecutableFile(atPath: runtimePath) else {
            notice = "Chọn yana-rt trong Cài đặt để đọc quyền hạn runtime."
            selectedSurface = .settings
            return
        }

        let outputURL = FileManager.default.temporaryDirectory.appendingPathComponent(
            "yana-studio-runtime-leases-\(UUID().uuidString).json"
        )
        guard FileManager.default.createFile(
            atPath: outputURL.path,
            contents: nil,
            attributes: [.posixPermissions: 0o600]
        ) else {
            notice = "Không thể tạo vùng đọc quyền hạn runtime."
            return
        }

        do {
            let outputHandle = try FileHandle(forWritingTo: outputURL)
            let process = Process()
            process.executableURL = URL(fileURLWithPath: runtimePath)
            process.currentDirectoryURL = project.url
            process.arguments = ["lease", "list", "--json"]
            process.standardOutput = outputHandle
            process.standardError = outputHandle
            process.terminationHandler = { [weak self] completedProcess in
                try? outputHandle.synchronize()
                try? outputHandle.close()
                let output = Self.readTerminalOutput(from: outputURL, limit: 1_024 * 1_024)
                try? FileManager.default.removeItem(at: outputURL)
                Task { @MainActor [weak self] in
                    self?.finishRuntimeLeaseRefresh(output: output, terminationStatus: completedProcess.terminationStatus)
                }
            }
            runtimeLeaseProcess = process
            isRefreshingRuntimeLeases = true
            try process.run()
        } catch {
            try? FileManager.default.removeItem(at: outputURL)
            runtimeLeaseProcess = nil
            isRefreshingRuntimeLeases = false
            notice = "Không thể chạy yana-rt lease list: \(error.localizedDescription)"
        }
    }

    func refreshRuntimePermissions() {
        refreshRuntimeLeases()
        refreshRuntimePendingApprovals()
    }

    func refreshRuntimePendingApprovals() {
        guard let project = selectedProject else {
            runtimePendingApprovals = []
            hasLoadedRuntimeApprovals = false
            return
        }
        guard !isRefreshingRuntimeApprovals else { return }
        guard FileManager.default.isExecutableFile(atPath: runtimePath) else {
            notice = "Chọn yana-rt trong Cài đặt để đọc yêu cầu phê duyệt."
            selectedSurface = .settings
            return
        }

        let outputURL = FileManager.default.temporaryDirectory.appendingPathComponent(
            "yana-studio-pending-approvals-\(UUID().uuidString).json"
        )
        guard FileManager.default.createFile(
            atPath: outputURL.path,
            contents: nil,
            attributes: [.posixPermissions: 0o600]
        ) else {
            notice = "Không thể tạo vùng đọc yêu cầu phê duyệt."
            return
        }

        do {
            let outputHandle = try FileHandle(forWritingTo: outputURL)
            let process = Process()
            process.executableURL = URL(fileURLWithPath: runtimePath)
            process.currentDirectoryURL = project.url
            process.arguments = ["authority", "pending-approvals", "--json"]
            process.standardOutput = outputHandle
            process.standardError = outputHandle
            process.terminationHandler = { [weak self] completedProcess in
                try? outputHandle.synchronize()
                try? outputHandle.close()
                let output = Self.readTerminalOutput(from: outputURL, limit: 1_024 * 1_024)
                try? FileManager.default.removeItem(at: outputURL)
                Task { @MainActor [weak self] in
                    self?.finishRuntimeApprovalRefresh(output: output, terminationStatus: completedProcess.terminationStatus)
                }
            }
            runtimeApprovalProcess = process
            isRefreshingRuntimeApprovals = true
            try process.run()
        } catch {
            try? FileManager.default.removeItem(at: outputURL)
            runtimeApprovalProcess = nil
            isRefreshingRuntimeApprovals = false
            notice = "Không thể chạy yana-rt authority pending-approvals: \(error.localizedDescription)"
        }
    }

    private func finishRuntimeApprovalRefresh(output: String, terminationStatus: Int32) {
        isRefreshingRuntimeApprovals = false
        runtimeApprovalProcess = nil
        guard terminationStatus == 0 else {
            notice = output.isEmpty ? "yana-rt không thể đọc yêu cầu phê duyệt." : output
            return
        }
        guard let data = output.data(using: .utf8) else {
            notice = "Runtime trả về dữ liệu phê duyệt không đọc được."
            return
        }
        do {
            runtimePendingApprovals = try JSONDecoder().decode([RuntimePendingApproval].self, from: data)
            hasLoadedRuntimeApprovals = true
        } catch {
            notice = "Không đọc được yêu cầu phê duyệt: \(error.localizedDescription)"
        }
    }

    private func finishRuntimeLeaseRefresh(output: String, terminationStatus: Int32) {
        isRefreshingRuntimeLeases = false
        runtimeLeaseProcess = nil
        guard terminationStatus == 0 else {
            notice = output.isEmpty ? "yana-rt không thể đọc quyền hạn runtime." : output
            return
        }
        guard let data = output.data(using: .utf8) else {
            notice = "Runtime trả về dữ liệu quyền hạn không đọc được."
            return
        }
        do {
            runtimeLeases = try JSONDecoder().decode([RuntimeLease].self, from: data)
            hasLoadedRuntimeLeases = true
        } catch {
            notice = "Không đọc được quyền hạn runtime: \(error.localizedDescription)"
        }
    }

    func refreshGitStatus() {
        guard let project = selectedProject else {
            gitState = .empty
            return
        }
        guard !isRefreshingGit else { return }
        let outputURL = FileManager.default.temporaryDirectory.appendingPathComponent(
            "yana-studio-git-\(UUID().uuidString).log"
        )
        guard FileManager.default.createFile(
            atPath: outputURL.path,
            contents: nil,
            attributes: [.posixPermissions: 0o600]
        ) else {
            gitState = GitWorkspaceState(branch: "", changes: [], message: "Không thể tạo log Git.")
            return
        }

        do {
            let outputHandle = try FileHandle(forWritingTo: outputURL)
            let process = Process()
            process.executableURL = URL(fileURLWithPath: "/usr/bin/git")
            process.currentDirectoryURL = project.url
            process.arguments = ["status", "--porcelain=v1", "--branch", "--untracked-files=normal"]
            process.standardOutput = outputHandle
            process.standardError = outputHandle
            process.terminationHandler = { [weak self] completedProcess in
                try? outputHandle.synchronize()
                try? outputHandle.close()
                let output = Self.readTerminalOutput(from: outputURL, limit: 1_024 * 1_024)
                try? FileManager.default.removeItem(at: outputURL)
                Task { @MainActor [weak self] in
                    self?.finishGitRefresh(output: output, terminationStatus: completedProcess.terminationStatus)
                }
            }
            try process.run()
            isRefreshingGit = true
        } catch {
            try? FileManager.default.removeItem(at: outputURL)
            gitState = GitWorkspaceState(branch: "", changes: [], message: "Không thể chạy Git: \(error.localizedDescription)")
        }
    }

    func showGitDiff(for change: GitFileChange) {
        guard let project = selectedProject else { return }
        guard !isLoadingGitDiff else { return }
        selectedGitChange = change

        if change.status.trimmingCharacters(in: .whitespacesAndNewlines) == "??" {
            gitDiff = "Tệp mới chưa được Git theo dõi nên chưa có diff với HEAD."
            return
        }

        let outputURL = FileManager.default.temporaryDirectory.appendingPathComponent(
            "yana-studio-git-diff-\(UUID().uuidString).log"
        )
        guard FileManager.default.createFile(
            atPath: outputURL.path,
            contents: nil,
            attributes: [.posixPermissions: 0o600]
        ) else {
            gitDiff = "Không thể tạo log Git diff."
            return
        }

        do {
            let outputHandle = try FileHandle(forWritingTo: outputURL)
            let process = Process()
            process.executableURL = URL(fileURLWithPath: "/usr/bin/git")
            process.currentDirectoryURL = project.url
            process.arguments = ["diff", "--no-ext-diff", "--no-color", "HEAD", "--", change.path]
            process.standardOutput = outputHandle
            process.standardError = outputHandle
            process.terminationHandler = { [weak self] completedProcess in
                try? outputHandle.synchronize()
                try? outputHandle.close()
                let output = Self.readTerminalOutput(from: outputURL, limit: 4 * 1024 * 1024)
                try? FileManager.default.removeItem(at: outputURL)
                Task { @MainActor [weak self] in
                    self?.finishGitDiff(output: output, terminationStatus: completedProcess.terminationStatus)
                }
            }
            gitDiff = "Đang đọc diff…"
            isLoadingGitDiff = true
            try process.run()
        } catch {
            try? FileManager.default.removeItem(at: outputURL)
            isLoadingGitDiff = false
            gitDiff = "Không thể chạy Git diff: \(error.localizedDescription)"
        }
    }

    func sendMessage() {
        let message = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !message.isEmpty else { return }
        let attachments = chatAttachments
        let task = makeRuntimeTask(message: message, attachments: attachments)
        guard task.utf8.count <= maxRuntimeTaskBytes else {
            notice = "Tin nhắn và tệp đính kèm quá dài. Hãy giữ dưới 40.000 ký tự UTF-8."
            return
        }
        guard let project = selectedProject else {
            notice = "Hãy mở một project trước khi gửi cho Yana."
            return
        }
        guard hasRuntimeConfiguration else {
            notice = "Chọn yana-rt và model trong Cài đặt trước khi chat."
            selectedSurface = .settings
            return
        }
        guard FileManager.default.isExecutableFile(atPath: runtimePath) else {
            notice = "Không chạy được yana-rt. Hãy chọn lại file runtime trong Cài đặt."
            selectedSurface = .settings
            return
        }

        let binary = URL(fileURLWithPath: runtimePath)
        let profile = RuntimeProfile(
            provider: provider,
            model: model.trimmingCharacters(in: .whitespacesAndNewlines),
            apiKey: sessionKey,
            baseURL: customBaseURL.trimmingCharacters(in: .whitespacesAndNewlines)
        )
        let shouldNameConversation = messages.isEmpty
        let history = compactRuntimeHistory(from: messages)
        let sessionID = selectedConversationID?.uuidString ?? "native-(project.id)"
        draft = ""
        chatAttachments = []
        messages.append(StudioMessage(role: .user, content: message))
        if shouldNameConversation { renameActiveConversation(using: message) }
        let assistant = StudioMessage(role: .assistant, content: "")
        messages.append(assistant)
        persistMessages()
        isSending = true
        activeAssistantMessageID = assistant.id
        chatOutputBuffer = ""
        chatErrorBuffer = ""
        chatWasStopped = false
        chatReceivedTerminalEvent = false
        chatRuntimeError = ""
        scheduleChatWatchdog(for: assistant.id)

        startRuntimeChat(
            binary: binary,
            project: project.url,
            profile: profile,
            task: task,
            history: history,
            sessionID: sessionID
        )
    }

    func stopChat() {
        guard let process = chatProcess, process.isRunning else { return }
        chatWasStopped = true
        process.terminate()
    }

    private func startRuntimeChat(
        binary: URL,
        project: URL,
        profile: RuntimeProfile,
        task: String,
        history: [RuntimeHistoryItem],
        sessionID: String
    ) {
        do {
            let process = Process()
            let input = Pipe()
            let output = Pipe()
            let errors = Pipe()
            process.executableURL = binary
            process.currentDirectoryURL = project
            process.arguments = ["chat", "--headless", "--provider", profile.provider, "--model", profile.model]
            process.standardInput = input
            process.standardOutput = output
            process.standardError = errors

            output.fileHandleForReading.readabilityHandler = { [weak self] handle in
                let data = handle.availableData
                guard !data.isEmpty else {
                    handle.readabilityHandler = nil
                    return
                }
                let chunk = String(decoding: data, as: UTF8.self)
                Task { @MainActor [weak self] in
                    self?.receiveRuntimeOutput(chunk)
                }
            }
            errors.fileHandleForReading.readabilityHandler = { [weak self] handle in
                let data = handle.availableData
                guard !data.isEmpty else {
                    handle.readabilityHandler = nil
                    return
                }
                let chunk = String(decoding: data, as: UTF8.self)
                Task { @MainActor [weak self] in
                    self?.receiveRuntimeErrorOutput(chunk)
                }
            }
            process.terminationHandler = { [weak self] completedProcess in
                output.fileHandleForReading.readabilityHandler = nil
                errors.fileHandleForReading.readabilityHandler = nil
                let remainingOutput = String(decoding: output.fileHandleForReading.availableData, as: UTF8.self)
                let remainingErrors = String(decoding: errors.fileHandleForReading.availableData, as: UTF8.self)
                Task { @MainActor [weak self] in
                    self?.receiveRuntimeOutput(remainingOutput)
                    self?.receiveRuntimeErrorOutput(remainingErrors)
                    self?.finishRuntimeChat(terminationStatus: completedProcess.terminationStatus)
                }
            }

            var request: [String: Any] = [
                "task": task,
                "history": history.map { ["role": $0.role, "content": $0.content] },
                "session_id": sessionID,
                "api_key": profile.apiKey,
            ]
            if profile.provider == "custom" {
                request["base_url"] = profile.baseURL
                request["custom_keyless"] = profile.apiKey.isEmpty
            }
            let requestData = try JSONSerialization.data(withJSONObject: request)
            chatProcess = process
            try process.run()
            input.fileHandleForWriting.write(requestData)
            input.fileHandleForWriting.closeFile()
        } catch {
            finishRuntimeChat(startError: error.localizedDescription)
        }
    }

    func resolveRuntimeApproval(_ approval: RuntimePendingApproval, allow: Bool) {
        guard approval.isPending else {
            notice = "Yêu cầu này đã được xử lý hoặc đã hết hạn."
            refreshRuntimePendingApprovals()
            return
        }
        guard !isSending, !isResolvingRuntimeApproval else {
            notice = "Hãy chờ lượt runtime đang chạy kết thúc trước khi phê duyệt."
            return
        }
        guard let project = selectedProject else {
            notice = "Hãy mở project trước khi phê duyệt yêu cầu."
            return
        }
        guard hasRuntimeConfiguration else {
            notice = "Chọn yana-rt và provider trong Cài đặt trước khi phê duyệt."
            selectedSurface = .settings
            return
        }
        guard provider != "custom" else {
            notice = "Runtime chưa hỗ trợ tiếp tục approval với Custom Base URL. Hãy dùng provider đã cấu hình sẵn."
            return
        }
        guard FileManager.default.isExecutableFile(atPath: runtimePath) else {
            notice = "Không chạy được yana-rt. Hãy chọn lại file runtime trong Cài đặt."
            selectedSurface = .settings
            return
        }

        if let sessionID = approval.sessionID,
           let conversationID = UUID(uuidString: sessionID),
           conversations.contains(where: { $0.id == conversationID }) {
            selectedConversationID = conversationID
            loadMessages()
        } else {
            createConversation()
        }

        let assistant = StudioMessage(role: .assistant, content: "")
        messages.append(assistant)
        persistMessages()
        isSending = true
        isResolvingRuntimeApproval = true
        activeAssistantMessageID = assistant.id
        chatOutputBuffer = ""
        chatErrorBuffer = ""
        chatWasStopped = false
        chatReceivedTerminalEvent = false
        chatRuntimeError = ""
        scheduleChatWatchdog(for: assistant.id)

        let profile = RuntimeProfile(
            provider: provider,
            model: model.trimmingCharacters(in: .whitespacesAndNewlines),
            apiKey: sessionKey,
            baseURL: customBaseURL.trimmingCharacters(in: .whitespacesAndNewlines)
        )
        startRuntimeApprovalResume(
            binary: URL(fileURLWithPath: runtimePath),
            project: project.url,
            profile: profile,
            approvalID: approval.approvalID,
            allow: allow
        )
    }

    private func startRuntimeApprovalResume(
        binary: URL,
        project: URL,
        profile: RuntimeProfile,
        approvalID: String,
        allow: Bool
    ) {
        do {
            let process = Process()
            let input = Pipe()
            let output = Pipe()
            let errors = Pipe()
            process.executableURL = binary
            process.currentDirectoryURL = project
            process.arguments = ["chat", "--resume-approval", "--provider", profile.provider]
            process.standardInput = input
            process.standardOutput = output
            process.standardError = errors

            output.fileHandleForReading.readabilityHandler = { [weak self] handle in
                let data = handle.availableData
                guard !data.isEmpty else {
                    handle.readabilityHandler = nil
                    return
                }
                let chunk = String(decoding: data, as: UTF8.self)
                Task { @MainActor [weak self] in
                    self?.receiveRuntimeOutput(chunk)
                }
            }
            errors.fileHandleForReading.readabilityHandler = { [weak self] handle in
                let data = handle.availableData
                guard !data.isEmpty else {
                    handle.readabilityHandler = nil
                    return
                }
                let chunk = String(decoding: data, as: UTF8.self)
                Task { @MainActor [weak self] in
                    self?.receiveRuntimeErrorOutput(chunk)
                }
            }
            process.terminationHandler = { [weak self] completedProcess in
                output.fileHandleForReading.readabilityHandler = nil
                errors.fileHandleForReading.readabilityHandler = nil
                let remainingOutput = String(decoding: output.fileHandleForReading.availableData, as: UTF8.self)
                let remainingErrors = String(decoding: errors.fileHandleForReading.availableData, as: UTF8.self)
                Task { @MainActor [weak self] in
                    self?.receiveRuntimeOutput(remainingOutput)
                    self?.receiveRuntimeErrorOutput(remainingErrors)
                    self?.finishRuntimeChat(terminationStatus: completedProcess.terminationStatus)
                }
            }

            let request: [String: Any] = [
                "approval_id": approvalID,
                "decision": allow,
                "decided_by": "human:yana-studio-native",
                "api_key": profile.apiKey,
            ]
            let requestData = try JSONSerialization.data(withJSONObject: request)
            chatProcess = process
            try process.run()
            input.fileHandleForWriting.write(requestData)
            input.fileHandleForWriting.closeFile()
        } catch {
            finishRuntimeChat(startError: error.localizedDescription)
        }
    }

    func openGitChangeInEditor(_ change: GitFileChange) {
        guard let project = selectedProject else { return }
        let path = change.path.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !path.isEmpty, !change.status.contains("D") else {
            notice = "Tệp đã xoá không thể mở trong editor."
            return
        }
        let file = WorkspaceFile(
            url: project.url.appendingPathComponent(path),
            relativePath: path,
            isDirectory: false
        )
        openFile(file)
        selectedSurface = .files
    }

    private func receiveRuntimeOutput(_ chunk: String) {
        guard isSending, !chunk.isEmpty else { return }
        chatOutputBuffer += chunk
        guard chatOutputBuffer.utf8.count <= 1_024 * 1_024 else {
            chatRuntimeError = "Runtime gửi một dòng giao thức quá lớn."
            chatProcess?.terminate()
            return
        }

        while let boundary = chatOutputBuffer.firstIndex(of: "\n") {
            let line = String(chatOutputBuffer[..<boundary])
            chatOutputBuffer.removeSubrange(...boundary)
            processRuntimeLine(line)
        }
    }

    private func compactRuntimeHistory(from source: [StudioMessage]) -> [RuntimeHistoryItem] {
        var retained: [RuntimeHistoryItem] = []
        var totalBytes = 0

        for message in source.suffix(40).reversed() {
            let messageBytes = message.content.utf8.count
            guard messageBytes <= maxRuntimeHistoryBytes - totalBytes else { continue }
            retained.append(RuntimeHistoryItem(role: message.role.rawValue, content: message.content))
            totalBytes += messageBytes
        }

        return Array(retained.reversed())
    }

    private func receiveRuntimeErrorOutput(_ chunk: String) {
        guard !chunk.isEmpty else { return }
        chatErrorBuffer = String((chatErrorBuffer + chunk).suffix(4_000))
    }

    private func processRuntimeLine(_ line: String) {
        let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        guard
            let data = trimmed.data(using: .utf8),
            let event = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let type = event["type"] as? String
        else {
            chatRuntimeError = "Runtime gửi sự kiện không hợp lệ."
            chatProcess?.terminate()
            return
        }

        switch type {
        case "text_delta":
            appendAssistantText(event["text"] as? String ?? "")
        case "completed":
            chatReceivedTerminalEvent = true
            if let message = event["message"] as? String, !message.isEmpty {
                replaceAssistantText(message)
            }
        case "error":
            chatReceivedTerminalEvent = true
            chatRuntimeError = event["message"] as? String ?? "Runtime báo lỗi."
        case "cancelled":
            chatReceivedTerminalEvent = true
            chatWasStopped = true
        case "awaiting_approval":
            chatReceivedTerminalEvent = true
            chatRuntimeError = "Runtime đang chờ phê duyệt. Mở Quyền hạn để xem nội dung và quyết định."
            refreshRuntimePendingApprovals()
            chatProcess?.terminate()
        default:
            break
        }
    }

    private func appendAssistantText(_ text: String) {
        guard !text.isEmpty,
              let id = activeAssistantMessageID,
              let index = messages.firstIndex(where: { $0.id == id })
        else { return }
        let content = String((messages[index].content + text).prefix(500_000))
        messages[index] = StudioMessage(id: id, role: .assistant, content: content)
    }

    private func replaceAssistantText(_ text: String) {
        guard let id = activeAssistantMessageID,
              let index = messages.firstIndex(where: { $0.id == id })
        else { return }
        messages[index] = StudioMessage(id: id, role: .assistant, content: String(text.prefix(500_000)))
    }

    private func finishRuntimeChat(startError: String? = nil, terminationStatus: Int32? = nil) {
        let shouldRefreshApprovals = isResolvingRuntimeApproval || hasLoadedRuntimeApprovals
        chatWatchdog?.cancel()
        chatWatchdog = nil
        if !chatOutputBuffer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            processRuntimeLine(chatOutputBuffer)
        }

        let assistantIsEmpty = activeAssistantMessageID.flatMap { id in
            messages.first(where: { $0.id == id })?.content.isEmpty
        } ?? true
        if assistantIsEmpty, let id = activeAssistantMessageID {
            messages.removeAll { $0.id == id }
        }

        let fallback = chatErrorBuffer.trimmingCharacters(in: .whitespacesAndNewlines)
        if let startError {
            messages.append(StudioMessage(role: .system, content: "Không thể khởi chạy runtime: \(startError)"))
        } else if chatWasStopped {
            messages.append(StudioMessage(role: .system, content: "Đã dừng theo yêu cầu. Nội dung đã nhận được được giữ lại."))
        } else if !chatRuntimeError.isEmpty {
            messages.append(StudioMessage(role: .system, content: chatRuntimeError))
        } else if !chatReceivedTerminalEvent {
            let status = terminationStatus.map(String.init) ?? "không rõ"
            let detail = fallback.isEmpty ? "Runtime kết thúc mà không có sự kiện hoàn tất (mã \(status))." : fallback
            messages.append(StudioMessage(role: .system, content: detail))
        }

        chatProcess = nil
        activeAssistantMessageID = nil
        chatOutputBuffer = ""
        chatErrorBuffer = ""
        chatWasStopped = false
        chatReceivedTerminalEvent = false
        chatRuntimeError = ""
        isSending = false
        isResolvingRuntimeApproval = false
        persistMessages()
        if shouldRefreshApprovals {
            refreshRuntimePendingApprovals()
        }
    }

    private func scheduleChatWatchdog(for assistantMessageID: UUID) {
        chatWatchdog?.cancel()
        let watchdog = DispatchWorkItem { [weak self] in
            guard let self,
                  self.isSending,
                  self.activeAssistantMessageID == assistantMessageID else {
                return
            }
            self.chatRuntimeError = "Runtime không phản hồi trong 10 phút nên Yana đã dừng phiên. Nội dung đã nhận được được giữ lại."
            self.chatProcess?.terminate()
        }
        chatWatchdog = watchdog
        DispatchQueue.main.asyncAfter(deadline: .now() + 600, execute: watchdog)
    }

    func updateUserMessage(id: UUID, content: String) {
        let editedContent = content.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !editedContent.isEmpty, editedContent.utf8.count <= 40_000 else { return }
        guard let index = messages.firstIndex(where: { $0.id == id && $0.role == .user }) else { return }
        messages[index] = StudioMessage(id: id, role: .user, content: editedContent)
        if index == 0 { renameActiveConversation(using: editedContent) }
        persistMessages()
    }

    func resendUserMessage(id: UUID, content: String) {
        let editedContent = content.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !editedContent.isEmpty, editedContent.utf8.count <= 40_000 else { return }
        guard let index = messages.firstIndex(where: { $0.id == id && $0.role == .user }) else { return }
        messages.removeSubrange(index...)
        draft = editedContent
        if index == 0 { renameActiveConversation(using: editedContent) }
        persistMessages()
        sendMessage()
    }

    func runTerminalCommand() {
        let command = terminalCommand.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !command.isEmpty, !command.contains("\0") else { return }
        guard command.utf8.count <= 8_000 else {
            notice = "Lệnh terminal quá dài."
            return
        }
        guard let project = selectedProject else {
            notice = "Hãy mở project trước khi chạy lệnh."
            return
        }
        guard !isTerminalRunning, !isTerminalSessionOpen else { return }

        do {
            let process = Process()
            let output = Pipe()
            process.executableURL = URL(fileURLWithPath: "/bin/zsh")
            process.currentDirectoryURL = project.url
            process.arguments = ["-lc", command]
            process.standardOutput = output
            process.standardError = output
            output.fileHandleForReading.readabilityHandler = { [weak self] handle in
                let data = handle.availableData
                guard !data.isEmpty else {
                    handle.readabilityHandler = nil
                    return
                }
                let chunk = String(decoding: data, as: UTF8.self)
                Task { @MainActor [weak self] in
                    self?.appendTerminalOutput(chunk)
                }
            }
            process.terminationHandler = { [weak self] completedProcess in
                output.fileHandleForReading.readabilityHandler = nil
                let remainder = output.fileHandleForReading.availableData
                let remainingText = String(decoding: remainder, as: UTF8.self)
                Task { @MainActor [weak self] in
                    self?.appendTerminalOutput(remainingText)
                    self?.finishTerminalCommand(
                        command: command,
                        terminationStatus: completedProcess.terminationStatus
                    )
                }
            }
            try process.run()
            terminalProcess = process
            isTerminalRunning = true
            terminalOutput = "$ \(command)\n\nĐang chạy…"
        } catch {
            notice = "Không thể chạy lệnh: \(error.localizedDescription)"
        }
    }

    func stopTerminalCommand() {
        guard let process = terminalProcess, process.isRunning else { return }
        process.interrupt()
        notice = "Đã gửi yêu cầu dừng lệnh."
    }

    func startTerminalSession() {
        guard let project = selectedProject else {
            notice = "Hãy mở project trước khi tạo phiên terminal."
            return
        }
        guard !isTerminalRunning, !isTerminalSessionOpen else { return }

        do {
            let process = Process()
            let input = Pipe()
            let output = Pipe()
            var environment = ProcessInfo.processInfo.environment
            environment["TERM"] = "xterm-256color"
            process.environment = environment
            process.executableURL = URL(fileURLWithPath: "/usr/bin/script")
            process.currentDirectoryURL = project.url
            process.arguments = ["-q", "/dev/null", "/bin/zsh", "-l"]
            process.standardInput = input
            process.standardOutput = output
            process.standardError = output
            output.fileHandleForReading.readabilityHandler = { [weak self] handle in
                let data = handle.availableData
                guard !data.isEmpty else {
                    handle.readabilityHandler = nil
                    return
                }
                let chunk = String(decoding: data, as: UTF8.self)
                Task { @MainActor [weak self] in
                    self?.appendTerminalOutput(chunk)
                }
            }
            process.terminationHandler = { [weak self] completedProcess in
                output.fileHandleForReading.readabilityHandler = nil
                let remainingText = String(decoding: output.fileHandleForReading.availableData, as: UTF8.self)
                Task { @MainActor [weak self] in
                    self?.appendTerminalOutput(remainingText)
                    self?.finishTerminalSession(terminationStatus: completedProcess.terminationStatus)
                }
            }
            terminalSessionProcess = process
            terminalSessionInput = input.fileHandleForWriting
            isTerminalSessionOpen = true
            terminalOutput = "Yana PTY · zsh · \(project.name)\n\n"
            try process.run()
        } catch {
            terminalSessionProcess = nil
            terminalSessionInput = nil
            isTerminalSessionOpen = false
            notice = "Không thể tạo phiên PTY: \(error.localizedDescription)"
        }
    }

    func sendTerminalSessionCommand() {
        let command = terminalCommand.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !command.isEmpty, !command.contains("\0") else { return }
        guard command.utf8.count <= 8_000 else {
            notice = "Lệnh terminal quá dài."
            return
        }
        guard isTerminalSessionOpen, let input = terminalSessionInput else { return }
        input.write(Data("\(command)\n".utf8))
        terminalCommand = ""
    }

    func interruptTerminalSession() {
        guard let process = terminalSessionProcess, process.isRunning else { return }
        process.interrupt()
        notice = "Đã gửi Ctrl-C tới phiên PTY."
    }

    func closeTerminalSession() {
        guard let process = terminalSessionProcess, process.isRunning else { return }
        terminalSessionInput?.write(Data("exit\n".utf8))
        process.terminate()
        notice = "Đang đóng phiên PTY."
    }

    func loadCredentialForCurrentProvider() {
        do {
            sessionKey = try KeychainStore.read(account: credentialAccount) ?? ""
        } catch {
            sessionKey = ""
            notice = error.localizedDescription
        }
    }

    func saveAppearanceSettings() {
        UserDefaults.standard.set(appearance.rawValue, forKey: appearanceKey)
        UserDefaults.standard.set(glassStrength, forKey: glassStrengthKey)
    }

    func discoverOllamaModels() {
        guard provider == "ollama" else { return }
        guard !isDiscoveringLocalModels else { return }
        isDiscoveringLocalModels = true

        Task {
            defer { isDiscoveringLocalModels = false }
            do {
                let discovered = try await OllamaModelDiscovery.fetch()
                localModels = discovered
                if model.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    model = discovered.first ?? ""
                }
                notice = discovered.isEmpty
                    ? "Ollama đang chạy nhưng chưa có model local."
                    : "Đã tìm thấy \(discovered.count) model Ollama local."
            } catch {
                localModels = []
                notice = "Không kết nối được Ollama local: \(error.localizedDescription)"
            }
        }
    }

    func saveRuntimeConfiguration() {
        defer { refreshReadiness() }
        let normalizedModel = model.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedKey = sessionKey.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedBaseURL = customBaseURL.trimmingCharacters(in: .whitespacesAndNewlines)
        guard normalizedKey.count <= 16_000, !normalizedKey.contains("\0") else {
            notice = "API key không hợp lệ."
            return
        }
        guard provider != "custom" || isValidCustomBaseURL(normalizedBaseURL) else {
            notice = "Provider Custom cần Base URL HTTP/HTTPS hợp lệ."
            return
        }

        UserDefaults.standard.set(runtimePath, forKey: runtimePathKey)
        UserDefaults.standard.set(provider, forKey: runtimeProviderKey)
        UserDefaults.standard.set(normalizedModel, forKey: runtimeModelKey)
        UserDefaults.standard.set(normalizedBaseURL, forKey: customBaseURLKey)
        model = normalizedModel
        customBaseURL = normalizedBaseURL

        do {
            if normalizedKey.isEmpty {
                try KeychainStore.delete(account: credentialAccount)
                notice = "Đã lưu cấu hình runtime. Không có API key nào được giữ lại."
            } else {
                try KeychainStore.save(normalizedKey, account: credentialAccount)
                notice = "Đã lưu cấu hình runtime và API key vào Keychain macOS."
            }
        } catch {
            notice = error.localizedDescription
        }
    }

    func loadWorkspaceFiles() {
        guard let project = selectedProject else {
            workspaceFiles = []
            return
        }
        let root = project.url.standardizedFileURL
        let options: FileManager.DirectoryEnumerationOptions = [.skipsHiddenFiles, .skipsPackageDescendants]
        guard let enumerator = FileManager.default.enumerator(at: root, includingPropertiesForKeys: [.isDirectoryKey], options: options) else {
            workspaceFiles = []
            return
        }

        var files: [WorkspaceFile] = []
        while let url = enumerator.nextObject() as? URL, files.count < 1_000 {
            let values = try? url.resourceValues(forKeys: [.isDirectoryKey])
            if isSymbolicLink(url) {
                if values?.isDirectory == true { enumerator.skipDescendants() }
                continue
            }
            let relative = url.path.replacingOccurrences(of: root.path + "/", with: "")
            files.append(WorkspaceFile(url: url, relativePath: relative, isDirectory: values?.isDirectory ?? false))
        }
        workspaceFiles = files.sorted { left, right in
            if left.isDirectory != right.isDirectory { return left.isDirectory }
            return left.relativePath.localizedStandardCompare(right.relativePath) == .orderedAscending
        }
    }

    private func addProject(_ url: URL) {
        let project = StudioProject(url: url)
        selectProject(project)
        notice = "Đã mở \(project.name)."
    }

    private func loadProjects() {
        guard
            let data = UserDefaults.standard.data(forKey: defaultsKey),
            let saved = try? JSONDecoder().decode([StudioProject].self, from: data)
        else { return }
        projects = saved.filter { FileManager.default.fileExists(atPath: $0.path) }
        let previous = UserDefaults.standard.string(forKey: selectedProjectKey)
        selectedProjectID = projects.contains(where: { $0.id == previous }) ? previous : projects.first?.id
        loadWorkspaceFiles()
        refreshGitStatus()
        loadMessages()
        loadTasks()
    }

    private func persistProjects() {
        guard let data = try? JSONEncoder().encode(projects) else { return }
        UserDefaults.standard.set(data, forKey: defaultsKey)
        UserDefaults.standard.set(selectedProjectID, forKey: selectedProjectKey)
    }

    private func loadMessages() {
        guard let project = selectedProject else {
            conversations = []
            selectedConversationID = nil
            messages = []
            return
        }
        let savedConversations = UserDefaults.standard.data(forKey: conversationListKey(for: project))
            .flatMap { try? JSONDecoder().decode([StudioConversation].self, from: $0) }
            ?? []
        let legacyMessages = UserDefaults.standard.data(forKey: chatHistoryKey(for: project))
            .flatMap { try? JSONDecoder().decode([StudioMessage].self, from: $0) }
            ?? []

        if savedConversations.isEmpty {
            let title = legacyMessages.first(where: { $0.role == .user }).map { conversationTitle(from: $0.content) }
                ?? "Cuộc trò chuyện mới"
            let conversation = StudioConversation(title: title)
            conversations = [conversation]
            selectedConversationID = conversation.id
            messages = Array(legacyMessages.suffix(200))
            persistConversations(for: project)
            UserDefaults.standard.set(conversation.id.uuidString, forKey: selectedConversationKey(for: project))
            persistMessages()
            return
        }

        conversations = savedConversations.sorted { $0.updatedAt > $1.updatedAt }
        let storedID = UserDefaults.standard.string(forKey: selectedConversationKey(for: project)).flatMap(UUID.init(uuidString:))
        let active = conversations.first(where: { $0.id == storedID }) ?? conversations[0]
        selectedConversationID = active.id
        messages = loadMessages(for: active, project: project)
    }

    private func persistMessages() {
        guard let project = selectedProject,
              let conversationID = selectedConversationID,
              let data = try? JSONEncoder().encode(Array(messages.suffix(200)))
        else { return }
        UserDefaults.standard.set(data, forKey: conversationHistoryKey(for: conversationID, project: project))
    }

    private func loadMessages(for conversation: StudioConversation, project: StudioProject) -> [StudioMessage] {
        guard
            let data = UserDefaults.standard.data(forKey: conversationHistoryKey(for: conversation.id, project: project)),
            let saved = try? JSONDecoder().decode([StudioMessage].self, from: data)
        else { return [] }
        return Array(saved.suffix(200))
    }

    private func persistConversations(for project: StudioProject) {
        guard let data = try? JSONEncoder().encode(conversations) else { return }
        UserDefaults.standard.set(data, forKey: conversationListKey(for: project))
    }

    private func renameActiveConversation(using content: String) {
        guard let index = conversations.firstIndex(where: { $0.id == selectedConversationID }) else { return }
        conversations[index].title = conversationTitle(from: content)
        conversations[index].updatedAt = .now
        if let project = selectedProject { persistConversations(for: project) }
    }

    private func conversationTitle(from content: String) -> String {
        let compact = content.replacingOccurrences(of: "\\n", with: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return String(compact.prefix(45))
    }

    private func chatHistoryKey(for project: StudioProject) -> String {
        let digest = SHA256.hash(data: Data(project.id.utf8))
        return chatHistoryPrefix + digest.map { String(format: "%02x", $0) }.joined()
    }

    private func conversationListKey(for project: StudioProject) -> String {
        let digest = SHA256.hash(data: Data(project.id.utf8))
        return conversationListPrefix + digest.map { String(format: "%02x", $0) }.joined()
    }

    private func selectedConversationKey(for project: StudioProject) -> String {
        let digest = SHA256.hash(data: Data(project.id.utf8))
        return selectedConversationPrefix + digest.map { String(format: "%02x", $0) }.joined()
    }

    private func conversationHistoryKey(for id: UUID, project: StudioProject) -> String {
        let projectDigest = SHA256.hash(data: Data(project.id.utf8))
        return conversationHistoryPrefix
            + projectDigest.map { String(format: "%02x", $0) }.joined()
            + "."
            + id.uuidString.lowercased()
    }

    private func loadTasks() {
        guard let project = selectedProject else {
            tasks = []
            return
        }
        guard
            let data = UserDefaults.standard.data(forKey: taskListKey(for: project)),
            let saved = try? JSONDecoder().decode([StudioTask].self, from: data)
        else {
            tasks = []
            return
        }
        tasks = saved
    }

    private func persistTasks(for project: StudioProject) {
        guard let data = try? JSONEncoder().encode(tasks) else { return }
        UserDefaults.standard.set(data, forKey: taskListKey(for: project))
    }

    private func taskListKey(for project: StudioProject) -> String {
        let digest = SHA256.hash(data: Data(project.id.utf8))
        return taskListPrefix + digest.map { String(format: "%02x", $0) }.joined()
    }

    private func resolvedProjectFile(for file: WorkspaceFile) throws -> URL {
        guard let project = selectedProject else { throw WorkspaceFileError.unavailableProject }
        let raw = file.url.standardizedFileURL
        guard !isSymbolicLink(raw) else { throw WorkspaceFileError.unsafePath }
        let root = project.url.resolvingSymlinksInPath().standardizedFileURL
        let resolved = raw.resolvingSymlinksInPath().standardizedFileURL
        let rootPath = root.path.hasSuffix("/") ? root.path : root.path + "/"
        guard resolved.path.hasPrefix(rootPath) else { throw WorkspaceFileError.unsafePath }
        let relative = String(resolved.path.dropFirst(rootPath.count))
        guard !relative.split(separator: "/").contains(where: { isSensitiveComponent(String($0)) }) else {
            throw WorkspaceFileError.sensitivePath
        }
        let attributes = try FileManager.default.attributesOfItem(atPath: resolved.path)
        guard attributes[.type] as? FileAttributeType == .typeRegular else {
            throw WorkspaceFileError.notRegularFile
        }
        return resolved
    }

    private func revision(for data: Data) -> WorkspaceFileRevision {
        WorkspaceFileRevision(bytes: data.count, digest: Data(SHA256.hash(data: data)))
    }

    private func atomicallyWrite(
        _ data: Data,
        replacing file: URL,
        expectedRevision: WorkspaceFileRevision
    ) throws {
        let attributes = try FileManager.default.attributesOfItem(atPath: file.path)
        let permissions = (attributes[.posixPermissions] as? NSNumber)?.intValue ?? 0o600
        let temporary = file.deletingLastPathComponent().appendingPathComponent(
            ".\(file.lastPathComponent).yana-studio-\(UUID().uuidString).tmp"
        )
        defer { try? FileManager.default.removeItem(at: temporary) }

        guard FileManager.default.createFile(
            atPath: temporary.path,
            contents: data,
            attributes: [.posixPermissions: permissions]
        ) else {
            throw WorkspaceFileError.writeFailed("không thể tạo tệp tạm")
        }
        let handle = try FileHandle(forWritingTo: temporary)
        try handle.synchronize()
        try handle.close()

        let current = try Data(contentsOf: file, options: .mappedIfSafe)
        guard revision(for: current) == expectedRevision else {
            throw WorkspaceFileError.changedOnDisk
        }
        guard rename(temporary.path, file.path) == 0 else {
            throw WorkspaceFileError.writeFailed(String(cString: strerror(errno)))
        }
    }

    private func isSymbolicLink(_ url: URL) -> Bool {
        (try? FileManager.default.destinationOfSymbolicLink(atPath: url.path)) != nil
    }

    private func isSensitiveComponent(_ name: String) -> Bool {
        name.range(
            of: #"^(\.env($|\.)|\.git$|\.ssh$|\.aws$|\.gnupg$)|(^|[._-])(credentials?|secrets?)([._-]|$)|\.(pem|key|p12|pfx)$"#,
            options: .regularExpression
        ) != nil
    }

    private var credentialAccount: String {
        "model-api-key.\(provider)"
    }

    private func loadRuntimeConfiguration() {
        runtimePath = UserDefaults.standard.string(forKey: runtimePathKey) ?? ""
        provider = UserDefaults.standard.string(forKey: runtimeProviderKey) ?? provider
        model = UserDefaults.standard.string(forKey: runtimeModelKey) ?? ""
        customBaseURL = UserDefaults.standard.string(forKey: customBaseURLKey) ?? ""
        loadCredentialForCurrentProvider()
    }

    private func isValidCustomBaseURL(_ value: String) -> Bool {
        guard let url = URL(string: value),
              let scheme = url.scheme?.lowercased(),
              ["http", "https"].contains(scheme),
              url.host != nil else {
            return false
        }
        return true
    }

    private func appendTerminalOutput(_ output: String) {
        guard !output.isEmpty else { return }
        let remainingBytes = maxTerminalOutputBytes - terminalOutput.utf8.count
        guard remainingBytes > 0 else { return }
        let prefix = output.utf8.prefix(remainingBytes)
        terminalOutput += String(decoding: prefix, as: UTF8.self)
        if output.utf8.count > remainingBytes {
            terminalOutput += "\n\n[Output được cắt ở 4 MB]"
        }
    }

    private func finishTerminalCommand(command: String, terminationStatus: Int32) {
        terminalProcess = nil
        isTerminalRunning = false
        terminalOutput += "\n\nKết thúc với mã \(terminationStatus)."
    }

    private func finishTerminalSession(terminationStatus: Int32) {
        try? terminalSessionInput?.close()
        terminalSessionInput = nil
        terminalSessionProcess = nil
        isTerminalSessionOpen = false
        terminalOutput += "\n\nPhiên PTY kết thúc với mã \(terminationStatus)."
    }

    private func finishGitRefresh(output: String, terminationStatus: Int32) {
        isRefreshingGit = false
        guard terminationStatus == 0 else {
            let detail = output.isEmpty ? "Project này chưa có Git repository." : output
            gitState = GitWorkspaceState(branch: "", changes: [], message: detail)
            return
        }
        let lines = output.split(separator: "\n", omittingEmptySubsequences: false)
        let branchLine = lines.first(where: { $0.hasPrefix("## ") })
        let branch = branchLine
            .map { String($0.dropFirst(3)).split(separator: " ", maxSplits: 1).first.map(String.init) ?? "detached HEAD" }
            ?? "detached HEAD"
        let changes = lines.compactMap { line -> GitFileChange? in
            guard !line.hasPrefix("## "), line.count >= 4 else { return nil }
            return GitFileChange(
                status: String(line.prefix(2)),
                path: String(line.dropFirst(3))
            )
        }
        gitState = GitWorkspaceState(
            branch: branch,
            changes: changes,
            message: changes.isEmpty ? "Working tree sạch." : "\(changes.count) tệp có thay đổi."
        )
    }

    private func finishGitDiff(output: String, terminationStatus: Int32) {
        isLoadingGitDiff = false
        guard terminationStatus == 0 else {
            gitDiff = output.isEmpty ? "Git không thể tạo diff cho tệp này." : output
            return
        }
        gitDiff = output.isEmpty ? "Không có khác biệt nội dung với HEAD." : output
    }

    nonisolated private static func readTerminalOutput(from url: URL, limit: Int) -> String {
        guard let attributes = try? FileManager.default.attributesOfItem(atPath: url.path),
              let size = attributes[.size] as? NSNumber
        else { return "Không thể đọc log lệnh." }
        guard let handle = try? FileHandle(forReadingFrom: url) else {
            return "Không thể đọc log lệnh."
        }
        defer { try? handle.close() }
        let data = (try? handle.read(upToCount: limit)) ?? Data()
        var output = String(decoding: data, as: UTF8.self)
        if size.intValue > limit { output += "\n\n[Output được cắt ở 4 MB]" }
        return output.trimmingCharacters(in: .newlines)
    }
}

enum RuntimeClient {
    static func send(
        binary: URL,
        project: URL,
        profile: RuntimeProfile,
        task: String,
        history: [RuntimeHistoryItem]
    ) async throws -> String {
        try await Task.detached(priority: .userInitiated) {
            let process = Process()
            let input = Pipe()
            let output = Pipe()
            let errors = Pipe()

            process.executableURL = binary
            process.currentDirectoryURL = project
            process.arguments = ["chat", "--headless", "--provider", profile.provider, "--model", profile.model]
            process.standardInput = input
            process.standardOutput = output
            process.standardError = errors

            let request: [String: Any] = [
                "task": task,
                "history": history.map { ["role": $0.role, "content": $0.content] },
                "api_key": profile.apiKey,
            ]
            let requestData = try JSONSerialization.data(withJSONObject: request)
            try process.run()
            input.fileHandleForWriting.write(requestData)
            input.fileHandleForWriting.closeFile()
            process.waitUntilExit()

            let outputData = output.fileHandleForReading.readDataToEndOfFile()
            let errorData = errors.fileHandleForReading.readDataToEndOfFile()
            let outputText = String(decoding: outputData, as: UTF8.self)
            let errorText = String(decoding: errorData, as: UTF8.self)
            let reply = RuntimeClient.parseReply(from: outputText)

            if let reply, !reply.isEmpty { return reply }
            let reason = errorText.trimmingCharacters(in: .whitespacesAndNewlines)
            if !reason.isEmpty { throw RuntimeError.failed(reason) }
            throw RuntimeError.failed("Runtime không trả về nội dung. Mã thoát: \(process.terminationStatus).")
        }.value
    }

    private static func parseReply(from output: String) -> String? {
        var deltas: [String] = []
        for line in output.split(separator: "\n") {
            guard
                let data = line.data(using: .utf8),
                let event = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                let type = event["type"] as? String
            else { continue }
            if type == "completed", let message = event["message"] as? String, !message.isEmpty {
                return message
            }
            if type == "text_delta", let text = event["text"] as? String {
                deltas.append(text)
            }
            if type == "error", let message = event["message"] as? String {
                return "Runtime báo lỗi: \(message)"
            }
        }
        let result = deltas.joined()
        return result.isEmpty ? nil : result
    }
}

private enum OllamaModelDiscovery {
    private struct Response: Decodable {
        let models: [Model]
    }

    private struct Model: Decodable {
        let name: String
    }

    static func fetch() async throws -> [String] {
        var request = URLRequest(url: URL(string: "http://127.0.0.1:11434/api/tags")!)
        request.timeoutInterval = 5
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw RuntimeError.failed("Ollama không phản hồi hợp lệ.")
        }
        let catalog = try JSONDecoder().decode(Response.self, from: data)
        return Array(Set(catalog.models.map(\.name))).sorted()
    }
}

enum RuntimeError: LocalizedError {
    case failed(String)

    var errorDescription: String? {
        switch self {
        case .failed(let message): message
        }
    }
}
