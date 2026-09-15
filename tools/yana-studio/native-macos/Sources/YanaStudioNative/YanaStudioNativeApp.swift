import SwiftUI

@main
struct YanaStudioNativeApp: App {
    @StateObject private var store = StudioStore()

    var body: some Scene {
        WindowGroup {
            StudioRootView()
                .environmentObject(store)
                .frame(minWidth: 960, minHeight: 640)
        }
        .windowStyle(.hiddenTitleBar)
        .commands {
            CommandGroup(after: .newItem) {
                Button("Mở project…") {
                    store.chooseProject()
                }
                .keyboardShortcut("o", modifiers: [.command])
            }

            CommandMenu("Điều hướng") {
                Button("Không gian làm việc") {
                    store.selectedSurface = .home
                }
                .keyboardShortcut("1", modifiers: [.command, .option])

                Button("Trò chuyện") {
                    store.selectedSurface = .chat
                }
                .keyboardShortcut("2", modifiers: [.command, .option])

                Button("Tệp") {
                    store.selectedSurface = .files
                }
                .keyboardShortcut("3", modifiers: [.command, .option])

                Button("Thiết kế") {
                    store.selectedSurface = .design
                }
                .keyboardShortcut("4", modifiers: [.command, .option])

                Button("Git") {
                    store.selectedSurface = .git
                }
                .keyboardShortcut("5", modifiers: [.command, .option])

                Button("Công việc") {
                    store.selectedSurface = .tasks
                }
                .keyboardShortcut("6", modifiers: [.command, .option])

                Button("Thiết bị") {
                    store.selectedSurface = .devices
                }
                .keyboardShortcut("7", modifiers: [.command, .option])

                Button("Quyền hạn") {
                    store.selectedSurface = .permissions
                }
                .keyboardShortcut("8", modifiers: [.command, .option])

                Button("Terminal") {
                    store.selectedSurface = .terminal
                }
                .keyboardShortcut("9", modifiers: [.command, .option])

                Button("Cài đặt") {
                    store.selectedSurface = .settings
                }
                .keyboardShortcut(",", modifiers: [.command])

                Divider()

                Button("Cuộc trò chuyện mới") {
                    store.selectedSurface = .chat
                    store.createConversation()
                }
                .keyboardShortcut("n", modifiers: [.command, .shift])
            }
        }
    }
}
