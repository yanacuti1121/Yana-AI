import AppKit
import SwiftUI

struct StudioRootView: View {
    @EnvironmentObject private var store: StudioStore

    var body: some View {
        Group {
            if store.requiresAuthentication {
                AccountEntrySurface()
            } else {
                workspace
            }
        }
        .background(Color.yanaCanvas)
        .tint(Color.yanaAccent)
        .preferredColorScheme(preferredColorScheme)
    }

    private var preferredColorScheme: ColorScheme? {
        switch store.appearance {
        case .system: nil
        case .dark: .dark
        case .light: .light
        }
    }

    private var workspace: some View {
        ZStack(alignment: .bottom) {
            HStack(spacing: 0) {
                NativeSidebar()
                Divider().overlay(Color.yanaLine)
                currentSurface
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            if let notice = store.notice {
                NoticeBanner(text: notice) {
                    store.notice = nil
                }
                .padding(18)
            }
        }
    }

    @ViewBuilder
    private var currentSurface: some View {
        switch store.selectedSurface {
        case .home: HomeSurface()
        case .chat: ChatSurface()
        case .files: FilesSurface()
        case .design: DesignSurface()
        case .git: GitSurface()
        case .tasks: TasksSurface()
        case .devices: DevicesSurface()
        case .permissions: PermissionsSurface()
        case .terminal: TerminalSurface()
        case .settings: SettingsSurface()
        }
    }
}

private struct GitSurface: View {
    @EnvironmentObject private var store: StudioStore

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 14) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Git")
                        .font(.title3.weight(.bold))
                    Text(store.selectedProject?.name ?? "Chọn project")
                        .font(.caption)
                        .foregroundStyle(Color.yanaMuted)
                }
                Spacer()
                Button(action: store.refreshGitStatus) {
                    Label("Làm mới", systemImage: "arrow.clockwise")
                }
                .buttonStyle(NativeSecondaryButton())
                .disabled(store.isRefreshingGit || store.selectedProject == nil)
            }
            .padding(.horizontal, 26)
            .padding(.vertical, 18)
            Divider().overlay(Color.yanaLine)

            VStack(alignment: .leading, spacing: 18) {
                if !store.gitState.branch.isEmpty {
                    Label(store.gitState.branch, systemImage: "point.3.connected.trianglepath.dotted")
                        .font(.headline)
                }
                Text(store.isRefreshingGit ? "Đang đọc trạng thái Git…" : store.gitState.message)
                    .foregroundStyle(Color.yanaMuted)
                if store.gitState.changes.isEmpty, !store.isRefreshingGit {
                    Spacer()
                } else {
                    HStack(spacing: 0) {
                        List(store.gitState.changes) { change in
                            Button {
                                store.showGitDiff(for: change)
                            } label: {
                                HStack(spacing: 12) {
                                    Text(change.status)
                                        .font(.system(.caption, design: .monospaced).weight(.bold))
                                        .foregroundStyle(Color.yanaAccent)
                                        .frame(width: 26, alignment: .leading)
                                    Text(change.path)
                                        .font(.system(.body, design: .monospaced))
                                        .lineLimit(1)
                                }
                                .padding(.vertical, 4)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(store.selectedGitChange == change ? Color.yanaSelection : .clear)
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                            }
                            .buttonStyle(.plain)
                        }
                        .listStyle(.plain)
                        .frame(minWidth: 260, maxWidth: 360)
                        Divider().overlay(Color.yanaLine)
                        VStack(alignment: .leading, spacing: 10) {
                            Text(store.selectedGitChange?.path ?? "Diff")
                                .font(.headline)
                            Text("Chỉ đọc · không stage, commit hoặc push")
                                .font(.caption)
                                .foregroundStyle(Color.yanaMuted)
                            if let change = store.selectedGitChange {
                                Button {
                                    store.openGitChangeInEditor(change)
                                } label: {
                                    Label("Mở trong editor", systemImage: "doc.text")
                                }
                                .buttonStyle(NativeSecondaryButton())
                                .disabled(change.status.contains("D"))
                            }
                            ScrollView([.horizontal, .vertical]) {
                                Text(store.isLoadingGitDiff ? "Đang đọc diff…" : store.gitDiff)
                                    .font(.system(.body, design: .monospaced))
                                    .textSelection(.enabled)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .padding(.vertical, 8)
                            }
                        }
                        .padding(.leading, 22)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .padding(28)
        }
    }
}

private struct TasksSurface: View {
    @EnvironmentObject private var store: StudioStore

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 16) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Công việc")
                        .font(.title3.weight(.bold))
                    Text(store.selectedProject?.name ?? "Chọn project để bắt đầu")
                        .font(.caption)
                        .foregroundStyle(Color.yanaMuted)
                }
                Spacer()
                Button(store.isRefreshingRuntimeTasks ? "Đang đọc…" : "Đọc task runtime") {
                    store.refreshRuntimeTasks()
                }
                .buttonStyle(NativeSecondaryButton())
                .disabled(store.isRefreshingRuntimeTasks || store.selectedProject == nil)
            }
            .padding(.horizontal, 26)
            .padding(.vertical, 18)
            Divider().overlay(Color.yanaLine)
            if store.hasLoadedRuntimeTasks {
                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        Label("Task từ Yana Runtime", systemImage: "bolt.circle")
                            .font(.subheadline.weight(.semibold))
                        Spacer()
                        Text("Project runtime")
                            .font(.caption)
                            .foregroundStyle(Color.yanaMuted)
                    }
                    HStack(alignment: .bottom, spacing: 10) {
                        TextField("Tên task runtime…", text: $store.runtimeTaskDraft, axis: .vertical)
                            .textFieldStyle(.roundedBorder)
                            .lineLimit(1...2)
                        TextField("Phạm vi", text: $store.runtimeTaskScope)
                            .textFieldStyle(.roundedBorder)
                            .frame(width: 150)
                        Button(store.isUpdatingRuntimeTasks ? "Đang tạo…" : "Tạo task") {
                            store.createRuntimeTask()
                        }
                        .buttonStyle(NativeSecondaryButton())
                        .disabled(
                            store.isUpdatingRuntimeTasks
                                || store.runtimeTaskDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                        )
                    }
                    Text("Tạo task sẽ ghi vào `.yana-ai/tasks.json` của project đang mở.")
                        .font(.caption)
                        .foregroundStyle(Color.yanaMuted)
                    if store.runtimeTasks.isEmpty {
                        Text("Runtime chưa có task nào.")
                            .font(.caption)
                            .foregroundStyle(Color.yanaMuted)
                    } else {
                        ForEach(store.runtimeTasks.prefix(6)) { task in
                            RuntimeTaskRow(task: task)
                        }
                    }
                    if store.runtimeTasks.count > 6 {
                        Text("Còn \(store.runtimeTasks.count - 6) task khác trong runtime.")
                            .font(.caption)
                            .foregroundStyle(Color.yanaMuted)
                    }
                }
                .padding(20)
                Divider().overlay(Color.yanaLine)
            }
            HStack(alignment: .bottom, spacing: 12) {
                TextField("Thêm công việc cho project này…", text: $store.taskDraft, axis: .vertical)
                    .textFieldStyle(.plain)
                    .lineLimit(1...3)
                    .padding(13)
                    .background(Color.yanaRaised)
                    .clipShape(RoundedRectangle(cornerRadius: 13))
                    .onSubmit { store.createTask() }
                Button("Thêm", action: store.createTask)
                    .buttonStyle(NativePrimaryButton())
                    .disabled(store.taskDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || store.selectedProject == nil)
            }
            .padding(20)
            Divider().overlay(Color.yanaLine)
            if store.tasks.isEmpty {
                VStack(spacing: 12) {
                    Image(systemName: "checklist")
                        .font(.system(size: 34))
                        .foregroundStyle(Color.yanaAccent)
                    Text("Chưa có công việc")
                        .font(.headline)
                    Text("Task được lưu local theo từng project.")
                        .font(.caption)
                        .foregroundStyle(Color.yanaMuted)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List(store.tasks) { task in
                    Button {
                        store.toggleTask(task)
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: task.isCompleted ? "checkmark.circle.fill" : "circle")
                                .foregroundStyle(task.isCompleted ? Color.yanaSuccess : Color.yanaMuted)
                            Text(task.title)
                                .strikethrough(task.isCompleted)
                                .foregroundStyle(task.isCompleted ? Color.yanaMuted : Color.yanaText)
                            Spacer()
                            Text(task.isCompleted ? "Hoàn tất" : "Đang mở")
                                .font(.caption)
                                .foregroundStyle(Color.yanaMuted)
                        }
                    }
                    .buttonStyle(.plain)
                }
                .listStyle(.plain)
            }
        }
    }
}

private struct PermissionsSurface: View {
    @EnvironmentObject private var store: StudioStore

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 16) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Quyền hạn")
                        .font(.title3.weight(.bold))
                    Text(store.selectedProject?.name ?? "Chọn project để bắt đầu")
                        .font(.caption)
                        .foregroundStyle(Color.yanaMuted)
                }
                Spacer()
                Button(isRefreshing ? "Đang đọc…" : "Làm mới") {
                    store.refreshRuntimePermissions()
                }
                .buttonStyle(NativeSecondaryButton())
                .disabled(isRefreshing || store.selectedProject == nil)
            }
            .padding(.horizontal, 26)
            .padding(.vertical, 18)
            Divider().overlay(Color.yanaLine)

            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Text("Mọi quyết định được runtime kiểm tra lại trước khi thực thi. Yana Studio không tự cấp quyền.")
                        .font(.caption)
                        .foregroundStyle(Color.yanaMuted)

                    VStack(alignment: .leading, spacing: 12) {
                        Label("Yêu cầu đang chờ", systemImage: "hand.raised")
                            .font(.headline)
                        if !store.hasLoadedRuntimeApprovals {
                            PermissionPlaceholder(
                                symbol: "hand.raised",
                                title: "Đọc yêu cầu từ runtime",
                                detail: "Chọn Làm mới để xem các yêu cầu cần anh quyết định."
                            )
                        } else if pendingApprovals.isEmpty {
                            PermissionPlaceholder(
                                symbol: "checkmark.shield",
                                title: "Không có yêu cầu đang chờ",
                                detail: "Runtime chưa cần một quyết định mới từ anh."
                            )
                        } else {
                            ForEach(pendingApprovals) { approval in
                                RuntimeApprovalRow(approval: approval)
                            }
                        }
                    }
                    .padding(18)
                    .background(GlassPanel(solid: Color.yanaRaised))
                    .clipShape(RoundedRectangle(cornerRadius: 16))

                    VStack(alignment: .leading, spacing: 12) {
                        Label("Quyền hạn đã cấp", systemImage: "shield")
                            .font(.headline)
                        if !store.hasLoadedRuntimeLeases {
                            PermissionPlaceholder(
                                symbol: "shield",
                                title: "Đọc quyền hạn từ runtime",
                                detail: "Danh sách lease được mở ở chế độ chỉ xem."
                            )
                        } else if store.runtimeLeases.isEmpty {
                            PermissionPlaceholder(
                                symbol: "checkmark.shield",
                                title: "Không có quyền hạn đang lưu",
                                detail: "Runtime chưa trả về lease nào cho project này."
                            )
                        } else {
                            ForEach(store.runtimeLeases) { lease in
                                VStack(alignment: .leading, spacing: 7) {
                                    HStack {
                                        Label("\(lease.subject) → \(lease.capability)", systemImage: lease.revoked ? "shield.slash" : "shield")
                                            .font(.headline)
                                        Spacer()
                                        Text(lease.statusTitle)
                                            .font(.caption.weight(.semibold))
                                            .foregroundStyle(lease.revoked ? Color.yanaMuted : Color.yanaSuccess)
                                    }
                                    if !lease.allow.isEmpty {
                                        Text("Cho phép: \(lease.allow.joined(separator: ", "))")
                                            .font(.caption)
                                            .foregroundStyle(Color.yanaMuted)
                                    }
                                    HStack(spacing: 12) {
                                        Text("Cấp bởi: \(lease.issuedBy)")
                                        if let remaining = lease.remaining {
                                            Text("Còn \(remaining) lượt")
                                        }
                                        if !lease.expiresAt.isEmpty {
                                            Text("Hết hạn: \(lease.expiresAt)")
                                        }
                                    }
                                    .font(.caption)
                                    .foregroundStyle(Color.yanaMuted)
                                }
                                .padding(14)
                                .background(Color.yanaCanvas.opacity(0.56))
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                            }
                        }
                    }
                    .padding(18)
                    .background(GlassPanel(solid: Color.yanaRaised))
                    .clipShape(RoundedRectangle(cornerRadius: 16))
                }
                .padding(24)
            }
        }
    }

    private var isRefreshing: Bool {
        store.isRefreshingRuntimeLeases || store.isRefreshingRuntimeApprovals
    }

    private var pendingApprovals: [RuntimePendingApproval] {
        store.runtimePendingApprovals.filter(\.isPending)
    }
}

private struct PermissionPlaceholder: View {
    let symbol: String
    let title: String
    let detail: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: symbol)
                .foregroundStyle(Color.yanaAccent)
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(Color.yanaMuted)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.yanaCanvas.opacity(0.56))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

private struct RuntimeApprovalRow: View {
    @EnvironmentObject private var store: StudioStore
    let approval: RuntimePendingApproval
    @State private var pendingDecision: Bool?
    @State private var isPresentingConfirmation = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "exclamationmark.shield.fill")
                    .foregroundStyle(Color.orange)
                VStack(alignment: .leading, spacing: 4) {
                    Text(approval.pendingCall.name)
                        .font(.headline)
                    Text(approval.authorityReason)
                        .font(.caption)
                        .foregroundStyle(Color.yanaMuted)
                }
                Spacer()
                Text("Chờ anh duyệt")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.orange)
            }

            Text(String(approval.pendingCall.argumentsJSON.prefix(1_600)))
                .font(.system(.caption, design: .monospaced))
                .foregroundStyle(Color.yanaText)
                .textSelection(.enabled)
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.yanaCanvas.opacity(0.72))
                .clipShape(RoundedRectangle(cornerRadius: 10))

            HStack(spacing: 12) {
                Text("Mã: \(approval.approvalID)")
                if !approval.expiresAt.isEmpty {
                    Text("Hết hạn: \(approval.expiresAt)")
                }
                Spacer()
                Button("Từ chối") {
                    pendingDecision = false
                    isPresentingConfirmation = true
                }
                .buttonStyle(NativeSecondaryButton())
                .disabled(store.isSending || store.isResolvingRuntimeApproval)
                Button("Cho phép") {
                    pendingDecision = true
                    isPresentingConfirmation = true
                }
                .buttonStyle(NativePrimaryButton())
                .disabled(store.isSending || store.isResolvingRuntimeApproval)
            }
            .font(.caption)
            .foregroundStyle(Color.yanaMuted)
        }
        .padding(14)
        .background(Color.yanaCanvas.opacity(0.56))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .alert("Xác nhận quyết định", isPresented: $isPresentingConfirmation) {
            Button("Hủy", role: .cancel) { pendingDecision = nil }
            if pendingDecision == true {
                Button("Cho phép") {
                    store.resolveRuntimeApproval(approval, allow: true)
                    pendingDecision = nil
                }
            } else {
                Button("Từ chối", role: .destructive) {
                    store.resolveRuntimeApproval(approval, allow: false)
                    pendingDecision = nil
                }
            }
        } message: {
            Text(confirmationDetail)
        }
    }

    private var confirmationDetail: String {
        if pendingDecision == true {
            return "Yana sẽ yêu cầu runtime tiếp tục lượt này. Runtime vẫn kiểm tra lại chính sách trước khi thực thi."
        }
        return "Yana sẽ ghi nhận việc từ chối và tiếp tục lượt AI với kết quả bị từ chối."
    }
}

private struct RuntimeTaskRow: View {
    @EnvironmentObject private var store: StudioStore
    let task: RuntimeTask
    @State private var evidence = ""
    @State private var isConfirmingCompletion = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                Image(systemName: task.statusSymbol)
                    .foregroundStyle(task.blocked ? Color.orange : task.status == "done" ? Color.yanaSuccess : Color.yanaAccent)
                VStack(alignment: .leading, spacing: 2) {
                    Text(task.name)
                        .lineLimit(1)
                    if let scope = task.scope, !scope.isEmpty {
                        Text(scope)
                            .font(.caption)
                            .foregroundStyle(Color.yanaMuted)
                            .lineLimit(1)
                    }
                }
                Spacer()
                Text(task.statusTitle)
                    .font(.caption)
                    .foregroundStyle(Color.yanaMuted)
                if task.status != "done" {
                    Button(isConfirmingCompletion ? "Hủy" : "Hoàn tất") {
                        isConfirmingCompletion.toggle()
                    }
                    .buttonStyle(NativeSecondaryButton())
                    .disabled(store.isUpdatingRuntimeTasks)
                }
            }
            if isConfirmingCompletion {
                HStack(spacing: 10) {
                    TextField("Bằng chứng hoàn tất…", text: $evidence, axis: .vertical)
                        .textFieldStyle(.roundedBorder)
                        .lineLimit(1...3)
                    Button("Xác nhận") {
                        store.completeRuntimeTask(task, evidence: evidence)
                        isConfirmingCompletion = false
                    }
                    .buttonStyle(NativePrimaryButton())
                    .disabled(evidence.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || store.isUpdatingRuntimeTasks)
                }
            }
        }
    }
}

private struct AccountEntrySurface: View {
    @EnvironmentObject private var store: StudioStore
    @State private var displayName = ""
    @State private var email = ""
    @State private var password = ""
    @State private var confirmation = ""

    var body: some View {
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 22) {
                HStack(spacing: 10) {
                    Text("Y")
                        .font(.system(size: 18, weight: .bold, design: .rounded))
                        .frame(width: 38, height: 38)
                        .background(LinearGradient(colors: [Color.yanaAccent, Color.yanaPink], startPoint: .topLeading, endPoint: .bottomTrailing))
                        .clipShape(RoundedRectangle(cornerRadius: 11))
                    Text("Yana Studio")
                        .font(.title3.weight(.bold))
                }

                Spacer()

                Text("Không gian làm việc\nlocal-first cho AI\ncó kiểm soát.")
                    .font(.system(size: 42, weight: .bold, design: .rounded))
                    .tracking(-1.2)
                Text("Project, chat và thông tin runtime ở trên máy anh. Yana không cần Yana cloud để bắt đầu.")
                    .foregroundStyle(Color.yanaMuted)
                    .frame(maxWidth: 470, alignment: .leading)

                Spacer()
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            .padding(64)
            .background(
                LinearGradient(
                    colors: [Color.yanaCanvas, Color.yanaSelection.opacity(0.26)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )

            VStack(alignment: .leading, spacing: 18) {
                Text(store.accountStatus.locked ? "Mở khóa Yana Studio" : "Tạo hồ sơ để bắt đầu")
                    .font(.title2.weight(.bold))
                Text(accountDetail)
                    .font(.subheadline)
                    .foregroundStyle(Color.yanaMuted)

                if let error = store.accountError {
                    Text(error)
                        .font(.subheadline)
                        .foregroundStyle(Color.yanaDanger)
                        .padding(12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.yanaDanger.opacity(0.12))
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }

                if store.accountStatus.locked {
                    Text(store.accountStatus.displayName)
                        .font(.headline)
                    SecureField("Mật khẩu", text: $password)
                        .textFieldStyle(.roundedBorder)
                        .onSubmit(unlock)
                    Button(store.isAuthenticating ? "Đang mở khóa…" : "Mở khóa", action: unlock)
                        .buttonStyle(NativePrimaryButton())
                        .disabled(store.isAuthenticating || password.isEmpty)
                } else {
                    TextField("Tên hiển thị", text: $displayName)
                        .textFieldStyle(.roundedBorder)
                    TextField("Email", text: $email)
                        .textFieldStyle(.roundedBorder)
                    SecureField("Mật khẩu", text: $password)
                        .textFieldStyle(.roundedBorder)
                    SecureField("Nhập lại mật khẩu", text: $confirmation)
                        .textFieldStyle(.roundedBorder)
                        .onSubmit(createAccount)
                    Text("Tối thiểu 10 ký tự. Mật khẩu không được lưu ở dạng có thể đọc.")
                        .font(.caption)
                        .foregroundStyle(Color.yanaMuted)
                    Button(store.isAuthenticating ? "Đang tạo hồ sơ…" : "Tạo hồ sơ local", action: createAccount)
                        .buttonStyle(NativePrimaryButton())
                        .disabled(store.isAuthenticating || !canCreate)
                }

                Divider().overlay(Color.yanaLine)
                Text("Google và GitHub chỉ xuất hiện khi OAuth native đã có callback và Keychain thật. Bản Swift không giả nút đăng nhập chưa hoạt động.")
                    .font(.caption)
                    .foregroundStyle(Color.yanaMuted)
            }
            .frame(width: 410)
            .frame(maxHeight: .infinity, alignment: .center)
            .padding(44)
            .background(Color.yanaSidebar)
        }
    }

    private var accountDetail: String {
        if store.accountStatus.locked {
            "Hồ sơ local của anh đang được khóa trên máy này."
        } else {
            "Hồ sơ dùng để khóa/mở khóa Yana Studio trên máy này."
        }
    }

    private var canCreate: Bool {
        !displayName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && password.count >= 10
            && password == confirmation
    }

    private func createAccount() {
        guard password == confirmation else { return }
        store.createLocalAccount(displayName: displayName, email: email, password: password)
        if !store.requiresAuthentication {
            password = ""
            confirmation = ""
        }
    }

    private func unlock() {
        store.unlockStudio(password: password)
        if !store.requiresAuthentication { password = "" }
    }
}

private struct NativeSidebar: View {
    @EnvironmentObject private var store: StudioStore

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 10) {
                Text("Y")
                    .font(.system(size: 15, weight: .bold, design: .rounded))
                    .frame(width: 30, height: 30)
                    .background(LinearGradient(colors: [Color.yanaAccent, Color.yanaPink], startPoint: .topLeading, endPoint: .bottomTrailing))
                    .clipShape(RoundedRectangle(cornerRadius: 9))
                Text("Yana Studio")
                    .font(.headline)
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 22)

            Menu {
                Button {
                    store.chooseProject()
                } label: {
                    Label("Mở project khác…", systemImage: "folder.badge.plus")
                }

                if !store.projects.isEmpty {
                    Divider()
                    ForEach(store.projects) { project in
                        Button {
                            store.selectProject(project)
                        } label: {
                            HStack {
                                Label(project.name, systemImage: "folder")
                                if store.selectedProjectID == project.id {
                                    Image(systemName: "checkmark")
                                }
                            }
                        }
                    }
                }
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: store.selectedProject == nil ? "folder.badge.plus" : "folder")
                    Text(store.selectedProject?.name ?? "Mở project")
                        .lineLimit(1)
                    Spacer()
                    Image(systemName: "chevron.down")
                        .font(.caption)
                }
                .padding(11)
                .background(Color.yanaRaised)
                .clipShape(RoundedRectangle(cornerRadius: 11))
            }
            .menuStyle(.borderlessButton)
            .padding(.horizontal, 12)

            Text("KHÔNG GIAN LÀM VIỆC")
                .font(.system(size: 10, weight: .bold))
                .tracking(1.1)
                .foregroundStyle(Color.yanaMuted)
                .padding(.horizontal, 18)
                .padding(.top, 30)
                .padding(.bottom, 8)

            ForEach(StudioSurface.allCases) { surface in
                Button {
                    store.selectedSurface = surface
                } label: {
                    Label(surface.title, systemImage: surface.symbol)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 9)
                        .background(store.selectedSurface == surface ? Color.yanaSelection : .clear)
                        .clipShape(RoundedRectangle(cornerRadius: 9))
                }
                .buttonStyle(.plain)
                .foregroundStyle(store.selectedSurface == surface ? Color.white : Color.yanaText)
                .padding(.horizontal, 8)
            }

            Spacer()
            VStack(alignment: .leading, spacing: 5) {
                Label(store.accountStatus.displayName, systemImage: "person.crop.circle")
                    .font(.caption.weight(.semibold))
                Text("Hồ sơ local · Apple Silicon")
                    .font(.caption2)
                    .foregroundStyle(Color.yanaMuted)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.yanaRaised.opacity(0.7))
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .padding(12)
        }
        .frame(width: 246)
        .background(GlassPanel(solid: Color.yanaSidebar))
    }
}

private struct HomeSurface: View {
    @EnvironmentObject private var store: StudioStore

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 32) {
                HStack {
                    VStack(alignment: .leading, spacing: 9) {
                        Text("YANA STUDIO NATIVE")
                            .font(.system(size: 11, weight: .bold))
                            .tracking(1.4)
                            .foregroundStyle(Color.yanaAccent)
                        Text("Mình xây gì tiếp hôm nay?")
                            .font(.system(size: 38, weight: .bold, design: .rounded))
                            .tracking(-1.1)
                        Text(store.selectedProject.map { "Đang làm việc trong \($0.name)." } ?? "Chọn một project để bắt đầu một không gian local-first.")
                            .foregroundStyle(Color.yanaMuted)
                    }
                    Spacer()
                    Button(store.selectedProject == nil ? "Mở project" : "Đổi project", action: store.chooseProject)
                        .buttonStyle(NativePrimaryButton())
                }

                HStack(spacing: 14) {
                    StatCard(title: "Project", value: store.selectedProject?.name ?? "Chưa chọn", detail: "Dữ liệu ở máy anh", symbol: "folder")
                    StatCard(title: "Runtime", value: store.runtimePath.isEmpty ? "Chưa cấu hình" : "Sẵn sàng", detail: store.runtimePath.isEmpty ? "Chọn yana-rt" : "Chạy tách biệt", symbol: "cpu")
                    StatCard(title: "Quyền", value: "Anh kiểm soát", detail: "Không tự thực thi", symbol: "checkmark.shield")
                }

                VStack(alignment: .leading, spacing: 16) {
                    Text("Bắt đầu nhanh")
                        .font(.title3.weight(.bold))
                    HStack(spacing: 14) {
                        QuickAction(title: "Trò chuyện", detail: "Gửi qua yana-rt", symbol: "message") { store.selectedSurface = .chat }
                        QuickAction(title: "Tệp", detail: "Xem mã nguồn local", symbol: "doc.text") { store.selectedSurface = .files }
                        QuickAction(title: "Cài đặt", detail: "Chọn runtime và model", symbol: "slider.horizontal.3") { store.selectedSurface = .settings }
                    }
                }
            }
            .padding(40)
        }
    }
}

private struct DesignSurface: View {
    @EnvironmentObject private var store: StudioStore

    private let columns = [GridItem(.adaptive(minimum: 190), spacing: 14)]

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 14) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Thiết kế")
                        .font(.title3.weight(.bold))
                    Text(store.selectedProject?.name ?? "Mở project để quét màu và token giao diện")
                        .font(.caption)
                        .foregroundStyle(Color.yanaMuted)
                }
                Spacer()
                Button(store.isScanningDesignTokens ? "Đang quét…" : "Quét màu") {
                    store.scanDesignTokens()
                }
                .buttonStyle(NativeSecondaryButton())
                .disabled(store.selectedProject == nil || store.isScanningDesignTokens)
            }
            .padding(.horizontal, 26)
            .padding(.vertical, 18)
            Divider().overlay(Color.yanaLine)

            ScrollView {
                if store.selectedProject == nil {
                    EmptyProjectState()
                        .frame(minHeight: 340)
                } else if store.isScanningDesignTokens {
                    VStack(spacing: 12) {
                        ProgressView()
                        Text("Đang đọc tệp giao diện an toàn trong project…")
                            .foregroundStyle(Color.yanaMuted)
                    }
                    .frame(maxWidth: .infinity, minHeight: 340)
                } else if !store.hasScannedDesignTokens {
                    DesignEmptyState(
                        title: "Quét token thiết kế của project",
                        detail: "Studio chỉ đọc các tệp giao diện văn bản như CSS, HTML, SVG, Swift và TypeScript; bỏ qua tệp ẩn, symlink và tên tệp nhạy cảm."
                    )
                } else if store.designTokens.isEmpty {
                    DesignEmptyState(
                        title: "Chưa tìm thấy mã màu",
                        detail: "Không có mã màu hex trong các tệp giao diện đủ điều kiện. Chỉnh giao diện trong Editor rồi quét lại khi cần."
                    )
                } else {
                    VStack(alignment: .leading, spacing: 18) {
                        Text("\(store.designTokens.count) mã màu tìm thấy")
                            .font(.headline)
                        LazyVGrid(columns: columns, spacing: 14) {
                            ForEach(store.designTokens) { token in
                                DesignTokenCard(token: token) {
                                    store.openDesignToken(token)
                                }
                            }
                        }
                    }
                    .padding(24)
                }
            }
        }
    }
}

private struct DesignEmptyState: View {
    let title: String
    let detail: String

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "paintpalette")
                .font(.system(size: 32))
                .foregroundStyle(Color.yanaAccent)
            Text(title)
                .font(.headline)
            Text(detail)
                .font(.caption)
                .multilineTextAlignment(.center)
                .foregroundStyle(Color.yanaMuted)
                .frame(maxWidth: 500)
        }
        .frame(maxWidth: .infinity, minHeight: 340)
        .padding(24)
    }
}

private struct DesignTokenCard: View {
    let token: DesignToken
    let open: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            RoundedRectangle(cornerRadius: 13)
                .fill(Color(yanaHex: token.hex) ?? Color.yanaMuted)
                .frame(height: 74)
                .overlay(
                    Text(token.hex)
                        .font(.system(.caption, design: .monospaced).weight(.bold))
                        .foregroundStyle(Color.white)
                        .shadow(color: .black.opacity(0.55), radius: 2)
                )
            Text(token.relativePath)
                .font(.caption.weight(.semibold))
                .lineLimit(1)
            Text("Dòng \(token.line)")
                .font(.caption)
                .foregroundStyle(Color.yanaMuted)
            Button("Mở tệp", action: open)
                .buttonStyle(NativeSecondaryButton())
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(GlassPanel(solid: Color.yanaRaised))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }
}

private struct DevicesSurface: View {
    @EnvironmentObject private var store: StudioStore

    private let columns = [GridItem(.adaptive(minimum: 190), spacing: 14)]

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 14) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Thiết bị")
                        .font(.title3.weight(.bold))
                    Text("Thông tin chỉ đọc từ macOS của máy đang chạy Studio")
                        .font(.caption)
                        .foregroundStyle(Color.yanaMuted)
                }
                Spacer()
                Button(store.isRefreshingHostProfile ? "Đang đọc…" : "Làm mới") {
                    store.refreshHostProfile()
                }
                .buttonStyle(NativeSecondaryButton())
                .disabled(store.isRefreshingHostProfile)
            }
            .padding(.horizontal, 26)
            .padding(.vertical, 18)
            Divider().overlay(Color.yanaLine)

            ScrollView {
                if let profile = store.hostProfile {
                    VStack(alignment: .leading, spacing: 20) {
                        HStack(alignment: .top, spacing: 16) {
                            Image(systemName: "laptopcomputer")
                                .font(.system(size: 30, weight: .medium))
                                .foregroundStyle(Color.yanaAccent)
                                .frame(width: 54, height: 54)
                                .background(Color.yanaSelection.opacity(0.32))
                                .clipShape(RoundedRectangle(cornerRadius: 15))
                            VStack(alignment: .leading, spacing: 5) {
                                Text(profile.processorLabel)
                                    .font(.title2.weight(.bold))
                                Text("\(profile.hardwareModel) · \(profile.architecture)")
                                    .font(.subheadline)
                                    .foregroundStyle(Color.yanaMuted)
                                Text(profile.hostName)
                                    .font(.caption)
                                    .foregroundStyle(Color.yanaMuted)
                            }
                            Spacer()
                            Label("Máy đang dùng", systemImage: "checkmark.circle.fill")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(Color.yanaSuccess)
                        }
                        .padding(22)
                        .background(GlassPanel(solid: Color.yanaRaised))
                        .clipShape(RoundedRectangle(cornerRadius: 18))

                        LazyVGrid(columns: columns, alignment: .leading, spacing: 14) {
                            DeviceMetric(title: "Bộ nhớ", value: profile.memoryLabel, detail: "RAM vật lý", symbol: "memorychip")
                            DeviceMetric(
                                title: "CPU",
                                value: "\(profile.logicalCores) luồng",
                                detail: profile.physicalCores.map { "\($0) nhân vật lý" } ?? "Số nhân vật lý không có dữ liệu",
                                symbol: "cpu"
                            )
                            DeviceMetric(title: "Đã chạy", value: profile.uptimeLabel, detail: "Từ lần khởi động gần nhất", symbol: "clock")
                        }

                        DeviceDetailRow(title: "macOS", detail: profile.operatingSystem, symbol: "macwindow")
                        DeviceDetailRow(
                            title: "Workspace",
                            detail: store.selectedProject.map(\.path) ?? "Chưa mở project local",
                            symbol: "folder"
                        )
                        DeviceDetailRow(
                            title: "Yana Runtime",
                            detail: store.runtimePath.isEmpty ? "Chưa chọn yana-rt" : store.runtimePath,
                            symbol: "cpu"
                        )
                    }
                    .padding(28)
                } else {
                    VStack(spacing: 12) {
                        ProgressView()
                        Text("Đang đọc thông tin thiết bị…")
                            .foregroundStyle(Color.yanaMuted)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .padding(48)
                }
            }
        }
        .task {
            if store.hostProfile == nil {
                store.refreshHostProfile()
            }
        }
    }
}

private struct DeviceMetric: View {
    let title: String
    let value: String
    let detail: String
    let symbol: String

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Image(systemName: symbol)
                .foregroundStyle(Color.yanaAccent)
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(Color.yanaMuted)
            Text(value)
                .font(.title3.weight(.bold))
            Text(detail)
                .font(.caption)
                .foregroundStyle(Color.yanaMuted)
        }
        .frame(maxWidth: .infinity, minHeight: 130, alignment: .topLeading)
        .padding(18)
        .background(GlassPanel(solid: Color.yanaRaised))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }
}

private struct DeviceDetailRow: View {
    let title: String
    let detail: String
    let symbol: String

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: symbol)
                .foregroundStyle(Color.yanaAccent)
                .frame(width: 24)
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(Color.yanaMuted)
                    .textSelection(.enabled)
                    .lineLimit(2)
            }
            Spacer()
        }
        .padding(16)
        .background(Color.yanaRaised)
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}

private struct ChatSurface: View {
    @EnvironmentObject private var store: StudioStore

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 14) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Trò chuyện")
                        .font(.title3.weight(.bold))
                    Text(store.selectedProject?.name ?? "Chọn project trước khi bắt đầu")
                        .font(.caption)
                        .foregroundStyle(Color.yanaMuted)
                }
                Spacer()
                Menu {
                    ForEach(store.conversations) { conversation in
                        Button(conversation.title) {
                            store.selectConversation(conversation)
                        }
                    }
                } label: {
                    Label(store.activeConversationTitle, systemImage: "bubble.left.and.bubble.right")
                        .lineLimit(1)
                }
                .disabled(store.isSending || store.conversations.isEmpty)
                Button(action: store.createConversation) {
                    Label("Cuộc trò chuyện mới", systemImage: "plus")
                }
                .buttonStyle(NativeSecondaryButton())
                .disabled(store.isSending || store.selectedProject == nil)
            }
            .padding(.horizontal, 26)
            .padding(.vertical, 18)
            Divider().overlay(Color.yanaLine)
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 14) {
                        if store.messages.isEmpty {
                            EmptyChatState()
                                .padding(.top, 64)
                        } else {
                            ForEach(store.messages) { message in
                                MessageBubble(message: message)
                            }
                        }
                        Color.clear
                            .frame(height: 1)
                            .id("chat-bottom")
                    }
                    .padding(30)
                }
                .onChange(of: store.messages.count) { _, _ in
                    scrollToLatestMessage(using: proxy)
                }
                .onChange(of: store.messages.last?.content ?? "") { _, _ in
                    scrollToLatestMessage(using: proxy)
                }
            }
            Divider().overlay(Color.yanaLine)
            VStack(alignment: .leading, spacing: 10) {
                if !store.chatAttachments.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(store.chatAttachments) { attachment in
                                ChatAttachmentChip(attachment: attachment) {
                                    store.removeChatAttachment(attachment)
                                }
                            }
                        }
                    }
                }
                HStack(alignment: .bottom, spacing: 12) {
                    Button(action: store.chooseChatAttachments) {
                        Image(systemName: "paperclip")
                            .frame(width: 28, height: 36)
                    }
                    .buttonStyle(NativeSecondaryButton())
                    .help("Đính kèm tối đa 4 tệp văn bản dưới 8 KB từ project")
                    .disabled(store.isSending || store.selectedProject == nil || store.chatAttachments.count >= 4)
                    TextField("Hỏi Yana về project này…", text: $store.draft, axis: .vertical)
                        .textFieldStyle(.plain)
                        .lineLimit(1...5)
                        .padding(13)
                        .background(Color.yanaRaised)
                        .clipShape(RoundedRectangle(cornerRadius: 13))
                        .onSubmit { store.sendMessage() }
                        .disabled(store.isSending)
                    if store.isSending {
                        Button("Dừng", action: store.stopChat)
                            .buttonStyle(NativeSecondaryButton())
                    } else {
                        Button(action: store.sendMessage) {
                            Image(systemName: "arrow.up")
                                .frame(width: 36, height: 36)
                        }
                        .buttonStyle(NativePrimaryButton())
                        .disabled(store.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                }
            }
            .padding(20)
        }
    }

    private func scrollToLatestMessage(using proxy: ScrollViewProxy) {
        withAnimation(.easeOut(duration: 0.18)) {
            proxy.scrollTo("chat-bottom", anchor: .bottom)
        }
    }
}

private struct ChatAttachmentChip: View {
    let attachment: StudioChatAttachment
    let remove: () -> Void

    var body: some View {
        HStack(spacing: 7) {
            Image(systemName: "doc")
            Text(attachment.relativePath)
                .lineLimit(1)
            Button(action: remove) {
                Image(systemName: "xmark")
                    .font(.caption.weight(.bold))
            }
            .buttonStyle(.plain)
            .help("Bỏ tệp đính kèm")
        }
        .font(.caption.weight(.medium))
        .padding(.horizontal, 10)
        .padding(.vertical, 7)
        .background(Color.yanaSelection.opacity(0.35))
        .clipShape(Capsule())
    }
}

private struct FilesSurface: View {
    @EnvironmentObject private var store: StudioStore
    @State private var fileQuery = ""

    var body: some View {
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 0) {
                SurfaceHeader(title: "Tệp", subtitle: store.selectedProject?.name ?? "Chọn project")
                Divider().overlay(Color.yanaLine)
                TextField("Tìm tệp trong project…", text: $fileQuery)
                    .textFieldStyle(.roundedBorder)
                    .padding(12)
                if store.workspaceFiles.isEmpty {
                    EmptyProjectState()
                } else {
                    List(filteredFiles) { file in
                        Button {
                            store.openFile(file)
                        } label: {
                            Label(file.relativePath, systemImage: file.isDirectory ? "folder" : "doc")
                                .lineLimit(1)
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(file.isDirectory ? Color.yanaMuted : Color.yanaText)
                    }
                    .listStyle(.sidebar)
                }
            }
            .frame(width: 300)
            Divider().overlay(Color.yanaLine)
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 14) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(store.selectedFile?.name ?? "Editor")
                            .font(.title3.weight(.bold))
                        Text(store.selectedFile?.relativePath ?? "Chọn tệp văn bản trong project")
                            .font(.caption)
                            .foregroundStyle(Color.yanaMuted)
                    }
                    Spacer()
                    if store.hasUnsavedFileChanges {
                        Text("Chưa lưu")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(Color.yanaAccent)
                    }
                    Button(action: store.saveSelectedFile) {
                        Label("Lưu", systemImage: "square.and.arrow.down")
                    }
                    .buttonStyle(NativeSecondaryButton())
                    .disabled(!store.canSaveSelectedFile)
                }
                .padding(.horizontal, 26)
                .padding(.vertical, 18)
                Divider().overlay(Color.yanaLine)
                if store.selectedFileIsEditable {
                    SyntaxTextEditor(text: Binding(
                        get: { store.selectedFileText },
                        set: { store.updateSelectedFileText($0) }
                    ), fileName: store.selectedFile?.name ?? "untitled")
                } else {
                    ScrollView([.horizontal, .vertical]) {
                        Text(store.selectedFileText)
                            .font(.system(.body, design: .monospaced))
                            .foregroundStyle(Color.yanaText)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(28)
                    }
                }
            }
        }
    }

    private var filteredFiles: [WorkspaceFile] {
        let query = fileQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !query.isEmpty else { return store.workspaceFiles }
        return store.workspaceFiles.filter { file in
            file.relativePath.localizedCaseInsensitiveContains(query)
        }
    }
}

private struct TerminalSurface: View {
    @EnvironmentObject private var store: StudioStore

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 16) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Terminal")
                        .font(.title3.weight(.bold))
                    Text(store.selectedProject?.name ?? "Mở project để chạy lệnh")
                        .font(.caption)
                        .foregroundStyle(Color.yanaMuted)
                }
                Spacer()
                if store.isTerminalSessionOpen {
                    Button("Đóng PTY", action: store.closeTerminalSession)
                        .buttonStyle(NativeSecondaryButton())
                } else {
                    Button("Mở PTY", action: store.startTerminalSession)
                        .buttonStyle(NativeSecondaryButton())
                        .disabled(store.isTerminalRunning || store.selectedProject == nil)
                }
            }
            .padding(.horizontal, 26)
            .padding(.vertical, 18)
            Divider().overlay(Color.yanaLine)
            HStack(alignment: .bottom, spacing: 12) {
                TextField(store.isTerminalSessionOpen ? "Nhập lệnh cho phiên PTY…" : "Ví dụ: git status", text: $store.terminalCommand, axis: .vertical)
                    .textFieldStyle(.plain)
                    .font(.system(.body, design: .monospaced))
                    .lineLimit(1...3)
                    .padding(13)
                    .background(Color.yanaRaised)
                    .clipShape(RoundedRectangle(cornerRadius: 13))
                    .onSubmit {
                        if store.isTerminalSessionOpen {
                            store.sendTerminalSessionCommand()
                        } else {
                            store.runTerminalCommand()
                        }
                    }
                if store.isTerminalSessionOpen {
                    Button("Gửi", action: store.sendTerminalSessionCommand)
                        .buttonStyle(NativePrimaryButton())
                        .disabled(store.terminalCommand.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    Button("Ctrl-C", action: store.interruptTerminalSession)
                        .buttonStyle(NativeSecondaryButton())
                } else if store.isTerminalRunning {
                    Button("Dừng", action: store.stopTerminalCommand)
                        .buttonStyle(NativeSecondaryButton())
                } else {
                    Button("Chạy", action: store.runTerminalCommand)
                        .buttonStyle(NativePrimaryButton())
                        .disabled(store.terminalCommand.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || store.selectedProject == nil)
                }
            }
            .padding(20)
            Divider().overlay(Color.yanaLine)
            ScrollView([.horizontal, .vertical]) {
                Text(store.terminalOutput)
                    .font(.system(.body, design: .monospaced))
                    .textSelection(.enabled)
                    .foregroundStyle(Color.yanaText)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(24)
            }
            Text(store.isTerminalSessionOpen
                ? "Phiên PTY đang chạy trong project. Gửi lệnh liên tiếp được; ứng dụng toàn màn hình như vim vẫn cần terminal renderer riêng."
                : "Runner one-shot chạy lệnh thật trong project. Mở PTY để giữ một shell sống và gửi nhiều lệnh.")
                .font(.caption)
                .foregroundStyle(Color.yanaMuted)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 20)
                .padding(.vertical, 12)
                .background(Color.yanaSidebar)
        }
    }
}

private struct SettingsSurface: View {
    @EnvironmentObject private var store: StudioStore

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 30) {
                SurfaceHeader(title: "Cài đặt", subtitle: "Kết nối runtime local, không có Yana cloud")
                SettingsBlock(title: "Hồ sơ local", detail: "\(store.accountStatus.displayName) · \(store.accountStatus.email)") {
                    HStack {
                        Label("Được bảo vệ bằng mật khẩu local", systemImage: "lock.shield")
                            .foregroundStyle(Color.yanaSuccess)
                        Spacer()
                        Button("Khóa Studio", action: store.lockStudio)
                        .buttonStyle(NativeSecondaryButton())
                    }
                }
                SettingsBlock(title: "Sẵn sàng để thử", detail: "Kiểm tra cục bộ trạng thái hồ sơ, project, runtime và model trước khi gửi yêu cầu đầu tiên.") {
                    VStack(alignment: .leading, spacing: 10) {
                        ForEach(store.readinessChecks) { check in
                            HStack(alignment: .top, spacing: 10) {
                                Image(systemName: check.symbol)
                                    .foregroundStyle(check.isReady ? Color.yanaSuccess : Color.orange)
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(check.title)
                                        .font(.subheadline.weight(.semibold))
                                    Text(check.detail)
                                        .font(.caption)
                                        .foregroundStyle(Color.yanaMuted)
                                }
                            }
                        }
                    }
                    Button("Kiểm tra lại", action: store.refreshReadiness)
                        .buttonStyle(NativeSecondaryButton())
                }
                SettingsBlock(title: "Dữ liệu local", detail: "Hồ sơ và thiết lập Studio chỉ nằm trong Application Support của macOS. Không tự đồng bộ lên Yana cloud.") {
                    HStack {
                        Label("Mở để xem trong Finder", systemImage: "folder")
                            .foregroundStyle(Color.yanaMuted)
                        Spacer()
                        Button("Mở thư mục dữ liệu", action: store.revealLocalData)
                            .buttonStyle(NativeSecondaryButton())
                    }
                }
                SettingsBlock(title: "Yana Runtime", detail: "Chọn binary yana-rt; app chỉ gọi qua stdin/NDJSON.") {
                    HStack {
                        Text(store.runtimePath.isEmpty ? "Chưa chọn runtime" : store.runtimePath)
                            .font(.system(.caption, design: .monospaced))
                            .lineLimit(1)
                            .foregroundStyle(store.runtimePath.isEmpty ? Color.yanaMuted : Color.yanaText)
                        Spacer()
                        Button("Chọn yana-rt", action: store.chooseRuntime)
                            .buttonStyle(NativeSecondaryButton())
                    }
                }
                SettingsBlock(title: "Giao diện", detail: "Chọn màu và mức liquid glass. Kéo về 0 để dùng giao diện đặc, kéo cao để nền trong hơn.") {
                    Grid(alignment: .leading, horizontalSpacing: 16, verticalSpacing: 14) {
                        GridRow {
                            Text("Chế độ").foregroundStyle(Color.yanaMuted)
                            Picker("Chế độ", selection: $store.appearance) {
                                ForEach(StudioAppearance.allCases) { appearance in
                                    Text(appearance.title).tag(appearance)
                                }
                            }
                            .labelsHidden()
                            .frame(width: 220, alignment: .leading)
                        }
                        GridRow {
                            Text("Liquid glass").foregroundStyle(Color.yanaMuted)
                            VStack(alignment: .leading, spacing: 5) {
                                Slider(value: $store.glassStrength, in: 0...1)
                                    .frame(width: 280)
                                Text("\(Int(store.glassStrength * 100))% trong")
                                    .font(.caption)
                                    .foregroundStyle(Color.yanaMuted)
                            }
                        }
                    }
                }
                SettingsBlock(title: "Model", detail: "Thông tin dùng cho lệnh chat. API key được giữ trong Keychain macOS, không nằm trong project. Provider Custom cần Base URL HTTP/HTTPS.") {
                    Grid(alignment: .leading, horizontalSpacing: 16, verticalSpacing: 14) {
                        GridRow {
                            Text("Provider").foregroundStyle(Color.yanaMuted)
                            Picker("Provider", selection: $store.provider) {
                                Text("Ollama").tag("ollama")
                                Text("OpenAI").tag("openai")
                                Text("Anthropic").tag("anthropic")
                                Text("Gemini").tag("gemini")
                                Text("Custom").tag("custom")
                            }
                            .labelsHidden()
                            .frame(width: 220, alignment: .leading)
                        }
                        GridRow {
                            Text("Model").foregroundStyle(Color.yanaMuted)
                            TextField("Ví dụ: llama3.2 hoặc gpt-5", text: $store.model)
                                .textFieldStyle(.roundedBorder)
                                .frame(width: 360)
                        }
                        if store.provider == "custom" {
                            GridRow {
                                Text("Base URL").foregroundStyle(Color.yanaMuted)
                                TextField("https://api.example.com/v1", text: $store.customBaseURL)
                                    .textFieldStyle(.roundedBorder)
                                    .frame(width: 360)
                            }
                        }
                        if store.provider == "ollama" {
                            GridRow {
                                Text("Ollama local").foregroundStyle(Color.yanaMuted)
                                HStack(spacing: 10) {
                                    Button(store.isDiscoveringLocalModels ? "Đang tìm…" : "Tìm model") {
                                        store.discoverOllamaModels()
                                    }
                                    .buttonStyle(NativeSecondaryButton())
                                    .disabled(store.isDiscoveringLocalModels)
                                    if !store.localModels.isEmpty {
                                        Menu(store.model.isEmpty ? "Chọn model local" : store.model) {
                                            ForEach(store.localModels, id: \.self) { localModel in
                                                Button(localModel) { store.model = localModel }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        GridRow {
                            Text("API key").foregroundStyle(Color.yanaMuted)
                            SecureField("Lưu tùy chọn vào Keychain macOS", text: $store.sessionKey)
                                .textFieldStyle(.roundedBorder)
                                .frame(width: 360)
                        }
                    }
                    HStack {
                        Button("Lưu cấu hình", action: store.saveRuntimeConfiguration)
                            .buttonStyle(NativePrimaryButton())
                        Text("Key không được ghi vào UserDefaults hay project.")
                            .font(.caption)
                            .foregroundStyle(Color.yanaMuted)
                    }
                }
                SettingsBlock(title: "Trạng thái native", detail: "Bản SwiftUI có hồ sơ local, Keychain, project picker, editor ghi tệp, chat nhiều phiên, quét màu thiết kế, Git trạng thái/diff, terminal PTY và duyệt yêu cầu runtime. OAuth, connector bên thứ ba và Git ghi thay đổi vẫn cần lớp native hoặc cấu hình provider riêng.") {
                    Label("Giữ bản Electron trong giai đoạn đối chiếu trước phát hành.", systemImage: "checkmark.shield")
                        .foregroundStyle(Color.yanaSuccess)
                }
            }
            .padding(40)
        }
        .onChange(of: store.provider) { _, _ in
            store.loadCredentialForCurrentProvider()
        }
        .onChange(of: store.appearance) { _, _ in
            store.saveAppearanceSettings()
        }
        .onChange(of: store.glassStrength) { _, _ in
            store.saveAppearanceSettings()
        }
        .onAppear {
            store.refreshReadiness()
        }
    }
}

private struct SurfaceHeader: View {
    let title: String
    let subtitle: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.title3.weight(.bold))
            Text(subtitle)
                .font(.caption)
                .foregroundStyle(Color.yanaMuted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 26)
        .padding(.vertical, 18)
    }
}

private struct StatCard: View {
    let title: String
    let value: String
    let detail: String
    let symbol: String

    var body: some View {
        VStack(alignment: .leading, spacing: 13) {
            Image(systemName: symbol)
                .foregroundStyle(Color.yanaAccent)
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(Color.yanaMuted)
            Text(value)
                .font(.headline)
                .lineLimit(1)
            Text(detail)
                .font(.caption)
                .foregroundStyle(Color.yanaMuted)
        }
        .frame(maxWidth: .infinity, minHeight: 142, alignment: .topLeading)
        .padding(20)
        .background(GlassPanel(solid: Color.yanaRaised))
        .clipShape(RoundedRectangle(cornerRadius: 17))
    }
}

private struct GlassPanel: View {
    @AppStorage("yana-studio-native.glass-strength.v1") private var glassStrength = 0.62
    let solid: Color

    var body: some View {
        ZStack {
            solid.opacity(1 - (glassStrength * 0.9))
            if glassStrength > 0.01 {
                Rectangle()
                    .fill(.ultraThinMaterial)
                    .opacity(glassStrength)
            }
        }
    }
}

private struct QuickAction: View {
    let title: String
    let detail: String
    let symbol: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 14) {
                Image(systemName: symbol)
                    .font(.title3)
                    .foregroundStyle(Color.yanaAccent)
                Text(title).font(.headline)
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(Color.yanaMuted)
                Spacer()
                Image(systemName: "arrow.up.right")
                    .foregroundStyle(Color.yanaMuted)
            }
            .frame(maxWidth: .infinity, minHeight: 150, alignment: .topLeading)
            .padding(20)
            .background(Color.yanaRaised)
            .clipShape(RoundedRectangle(cornerRadius: 17))
        }
        .buttonStyle(.plain)
    }
}

private struct MessageBubble: View {
    @EnvironmentObject private var store: StudioStore
    let message: StudioMessage
    @State private var isEditing = false
    @State private var editedContent = ""

    var body: some View {
        HStack {
            if message.role == .assistant { Spacer(minLength: 72) }
            VStack(alignment: .leading, spacing: 8) {
                if isEditing {
                    TextField("Nội dung câu hỏi", text: $editedContent, axis: .vertical)
                        .textFieldStyle(.plain)
                        .lineLimit(2...8)
                        .padding(10)
                        .background(Color.white.opacity(0.15))
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                    HStack(spacing: 12) {
                        Button("Hủy") {
                            isEditing = false
                            editedContent = message.content
                        }
                        Button("Lưu") {
                            store.updateUserMessage(id: message.id, content: editedContent)
                            isEditing = false
                        }
                        Button("Gửi lại") {
                            store.resendUserMessage(id: message.id, content: editedContent)
                            isEditing = false
                        }
                    }
                    .buttonStyle(.plain)
                    .font(.caption.weight(.semibold))
                } else {
                    Text(message.content)
                        .textSelection(.enabled)
                }
                if message.role == .assistant {
                    Button(action: copyMessage) {
                        Label("Sao chép", systemImage: "doc.on.doc")
                    }
                    .buttonStyle(.plain)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.yanaMuted)
                }
                if message.role == .user && !isEditing {
                    Button {
                        editedContent = message.content
                        isEditing = true
                    } label: {
                        Label("Chỉnh sửa", systemImage: "pencil")
                    }
                    .buttonStyle(.plain)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.white.opacity(0.78))
                }
            }
            .padding(15)
            .background(background)
            .foregroundStyle(foreground)
            .clipShape(RoundedRectangle(cornerRadius: 15))
            if message.role != .assistant { Spacer(minLength: 72) }
        }
    }

    private var background: Color {
        switch message.role {
        case .user: .yanaSelection
        case .assistant: .yanaRaised
        case .system: .yanaWarning
        }
    }

    private var foreground: Color {
        message.role == .user ? .white : .yanaText
    }

    private func copyMessage() {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(message.content, forType: .string)
    }
}

private struct EmptyChatState: View {
    var body: some View {
        VStack(spacing: 13) {
            Image(systemName: "sparkles")
                .font(.system(size: 32))
                .foregroundStyle(Color.yanaAccent)
            Text("Bắt đầu với công việc thật.")
                .font(.title3.weight(.bold))
            Text("Chọn project, runtime và model trong Cài đặt. Yana gửi yêu cầu qua runtime local thay vì gọi provider trực tiếp từ giao diện.")
                .multilineTextAlignment(.center)
                .foregroundStyle(Color.yanaMuted)
                .frame(maxWidth: 480)
        }
        .frame(maxWidth: .infinity)
    }
}

private struct EmptyProjectState: View {
    @EnvironmentObject private var store: StudioStore

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "folder.badge.plus")
                .font(.title)
                .foregroundStyle(Color.yanaAccent)
            Text("Chưa có project")
                .font(.headline)
            Button("Mở project", action: store.chooseProject)
                .buttonStyle(NativeSecondaryButton())
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

private struct SettingsBlock<Content: View>: View {
    let title: String
    let detail: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 5) {
                Text(title).font(.headline)
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(Color.yanaMuted)
            }
            content
        }
        .padding(22)
        .background(Color.yanaRaised)
        .clipShape(RoundedRectangle(cornerRadius: 17))
    }
}

private struct NoticeBanner: View {
    let text: String
    let dismiss: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "info.circle.fill")
            Text(text)
                .font(.subheadline)
            Button(action: dismiss) {
                Image(systemName: "xmark")
            }
            .buttonStyle(.plain)
        }
        .padding(12)
        .background(.regularMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.2), radius: 20, y: 8)
    }
}

private struct NativePrimaryButton: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.bold))
            .foregroundStyle(Color.yanaCanvas)
            .padding(.horizontal, 15)
            .padding(.vertical, 10)
            .background(configuration.isPressed ? Color.yanaAccent.opacity(0.75) : Color.yanaAccent)
            .clipShape(RoundedRectangle(cornerRadius: 11))
    }
}

private struct NativeSecondaryButton: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.semibold))
            .padding(.horizontal, 13)
            .padding(.vertical, 9)
            .background(configuration.isPressed ? Color.yanaLine : Color.yanaCanvas)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.yanaLine))
    }
}

private extension Color {
    static let yanaCanvas = adaptive(dark: NSColor(red: 0.055, green: 0.065, blue: 0.11, alpha: 1), light: NSColor(red: 0.965, green: 0.96, blue: 0.95, alpha: 1))
    static let yanaSidebar = adaptive(dark: NSColor(red: 0.075, green: 0.085, blue: 0.14, alpha: 1), light: NSColor(red: 0.93, green: 0.93, blue: 0.97, alpha: 1))
    static let yanaRaised = adaptive(dark: NSColor(red: 0.105, green: 0.12, blue: 0.19, alpha: 1), light: NSColor.white)
    static let yanaSelection = adaptive(dark: NSColor(red: 0.36, green: 0.40, blue: 0.84, alpha: 1), light: NSColor(red: 0.83, green: 0.86, blue: 1, alpha: 1))
    static let yanaAccent = adaptive(dark: NSColor(red: 0.58, green: 0.64, blue: 1, alpha: 1), light: NSColor(red: 0.27, green: 0.34, blue: 0.8, alpha: 1))
    static let yanaPink = adaptive(dark: NSColor(red: 0.84, green: 0.45, blue: 0.63, alpha: 1), light: NSColor(red: 0.72, green: 0.24, blue: 0.47, alpha: 1))
    static let yanaText = adaptive(dark: NSColor(red: 0.94, green: 0.95, blue: 0.99, alpha: 1), light: NSColor(red: 0.12, green: 0.13, blue: 0.18, alpha: 1))
    static let yanaMuted = adaptive(dark: NSColor(red: 0.61, green: 0.64, blue: 0.73, alpha: 1), light: NSColor(red: 0.36, green: 0.39, blue: 0.47, alpha: 1))
    static let yanaLine = adaptive(dark: NSColor.white.withAlphaComponent(0.09), light: NSColor.black.withAlphaComponent(0.1))
    static let yanaSuccess = adaptive(dark: NSColor(red: 0.48, green: 0.83, blue: 0.66, alpha: 1), light: NSColor(red: 0.05, green: 0.48, blue: 0.31, alpha: 1))
    static let yanaWarning = adaptive(dark: NSColor(red: 0.34, green: 0.23, blue: 0.21, alpha: 1), light: NSColor(red: 1, green: 0.91, blue: 0.87, alpha: 1))
    static let yanaDanger = adaptive(dark: NSColor(red: 0.95, green: 0.50, blue: 0.48, alpha: 1), light: NSColor(red: 0.75, green: 0.12, blue: 0.12, alpha: 1))

    init?(yanaHex rawValue: String) {
        let value = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard value.hasPrefix("#") else { return nil }
        let rawHex = String(value.dropFirst())
        let expandedHex: String
        switch rawHex.count {
        case 3, 4:
            expandedHex = rawHex.map { "\($0)\($0)" }.joined()
        case 6, 8:
            expandedHex = rawHex
        default:
            return nil
        }
        guard let number = UInt64(expandedHex, radix: 16) else { return nil }

        let red: Double
        let green: Double
        let blue: Double
        let opacity: Double
        if expandedHex.count == 8 {
            red = Double((number >> 24) & 0xFF) / 255
            green = Double((number >> 16) & 0xFF) / 255
            blue = Double((number >> 8) & 0xFF) / 255
            opacity = Double(number & 0xFF) / 255
        } else {
            red = Double((number >> 16) & 0xFF) / 255
            green = Double((number >> 8) & 0xFF) / 255
            blue = Double(number & 0xFF) / 255
            opacity = 1
        }
        self.init(.sRGB, red: red, green: green, blue: blue, opacity: opacity)
    }

    private static func adaptive(dark: NSColor, light: NSColor) -> Color {
        Color(nsColor: NSColor(name: nil) { appearance in
            appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? dark : light
        })
    }
}
