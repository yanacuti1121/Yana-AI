import SwiftUI

// The menu bar. Each item posts one named action; RootView (which owns the pages, the chat, the terminal
// and the editor launcher) performs it, so the menu never needs its own copy of app state.
// Titles are read when the menu is built: after a language change they update on the next launch.

enum MenuAction: String {
	case settings, checkUpdates, newChat, openFolder, openStudio, terminal, toggleChatList, uninstall
	case page1, page2, page3, page4, page5, page6, page7
}

extension Notification.Name {
	static let yanaMenu = Notification.Name("ai.yana.menu")
}

private func post(_ action: MenuAction) {
	NotificationCenter.default.post(name: .yanaMenu, object: action.rawValue)
}

struct YanaCommands: Commands {
	var body: some Commands {
		CommandGroup(replacing: .appSettings) {
			Button(L("nav.Settings") + "…") { post(.settings) }.keyboardShortcut(",", modifiers: .command)
			Button(L("menu.checkUpdates")) { post(.checkUpdates) }
			Divider()
			Button(L("menu.uninstall")) { post(.uninstall) }
		}
		CommandGroup(replacing: .newItem) {
			Button(L("chat.new")) { post(.newChat) }.keyboardShortcut("n", modifiers: .command)
			Button(L("menu.openFolder")) { post(.openFolder) }.keyboardShortcut("o", modifiers: .command)
			Divider()
			Button(L("menu.openStudio")) { post(.openStudio) }.keyboardShortcut("e", modifiers: [.command, .shift])
		}
		CommandGroup(before: .sidebar) {
			Button(L("nav.Terminal")) { post(.terminal) }.keyboardShortcut("`", modifiers: .control)
			Button(L("menu.toggleChatList")) { post(.toggleChatList) }.keyboardShortcut("s", modifiers: [.command, .control])
			Divider()
			ForEach(Array(railEntries.prefix(7).enumerated()), id: \.offset) { index, entry in
				Button(L("nav.\(entry.id)")) { post(MenuAction(rawValue: "page\(index + 1)") ?? .page1) }
					.keyboardShortcut(KeyEquivalent(Character("\(index + 1)")), modifiers: .command)
			}
			Divider()
		}
	}
}
