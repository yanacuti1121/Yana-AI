import SwiftUI
import AppKit

struct RootView: View {
	@State private var selected: String
	@ObservedObject private var loc = Loc.shared
	// One chat for the window, shared by the chat page and its sidebar. Lives here so a language switch
	// (which rebuilds the subtree below) keeps the conversation.
	@StateObject private var engine = ChatEngine()
	// Whether the chat list sidebar is shown; remembered between launches.
	@AppStorage("yana.ui.chatSidebar") private var chatSidebar = true
	@StateObject private var runtime = RuntimeUpdater()
	// Opens Yana Studio (the IDE layer) on demand; it never starts with this app.
	@StateObject private var editor = EditorLauncher()
	// Terminal tabs live here so their shells keep running across page switches.
	@StateObject private var terminals = TerminalStore()
	// Models the user's keys can reach, asked from each provider (shared by the chat bar and Settings).
	@StateObject private var models = ModelCatalog()
	// New versions of this app, from GitHub Releases (app-vX.Y.Z).
	@StateObject private var appUpdater = AppUpdater()
	private let rendering: Bool

	// YANA_PAGE opens a given page at launch (used to check pages in the live window).
	// YANA_PAGE wins; otherwise the start page from Settings ("ask" shows the start chooser).
	init(page: String? = ProcessInfo.processInfo.environment["YANA_PAGE"], rendering: Bool = false) {
		let start = AppSettings.shared.startPage
		let wanted = page ?? (start == "ask" ? "Start" : start)
		// The terminal lives in the chat page's right panel, so "Terminal" opens Chat with that panel.
		openTerminal = wanted == "Terminal"
		_selected = State(initialValue: openTerminal ? "Chat" : wanted)
		self.rendering = rendering
	}
	private let openTerminal: Bool

	@ViewBuilder
	private var page: some View {
		switch selected {
		case "Chat":
			// The "show chat list" button sits on the chat column itself (ChatHome), so a full-width
			// browser never has it drawn over its own toolbar.
			ChatHome(openSettings: { selected = "Settings" }, openApprovals: { selected = "Tool approvals" })
		case "Settings": SettingsPage { selected = $0 }
		case "Tool approvals": ApprovalsPage().padding(.top, 30)
		case "Overview": HomePage().padding(.top, 30)
		case "Tasks": TasksPage().padding(.top, 30)
		case "Skills": SkillsPage().padding(.top, 30)
		case "Plugins": PluginStorePage().padding(.top, 30)
		case "Health": HealthPage().padding(.top, 30)
		case "Usage": UsagePage().padding(.top, 30)
		default:
			if let feature = features.first(where: { $0.title == selected }) {
				FeaturePage(feature: feature).padding(.top, 30)
			} else {
				HomePage().padding(.top, 30)
			}
		}
	}

	var body: some View {
		HStack(spacing: 0) {
			if selected == "Start" {
				StartChooser {
					terminals.wantsPanel = true
					selected = "Chat"
				}
			} else {
				IconRail(selected: $selected)
				if selected == "Chat" && chatSidebar { ChatSidebar { chatSidebar = false } }
				page
					.frame(maxWidth: .infinity, maxHeight: .infinity)
					.background(FB.canvas)
			}
		}
		// A new id on a language change rebuilds the whole tree so every L(...) is read again.
		// `selected` lives on RootView, outside this subtree, so the open page is kept.
		.task {
			guard !rendering else { return }
			if ProcessInfo.processInfo.environment["YANA_UPDATE_DEMO"] == "1" { appUpdater.demo(); return }
			appUpdater.showWhatsNewIfUpdated()
			guard AppSettings.shared.checkUpdatesOnLaunch else { return }
			await runtime.check()
			await appUpdater.check()
		}
		.sheet(isPresented: $appUpdater.showSheet) { UpdateSheet(updater: appUpdater) }
		.sheet(isPresented: Binding(get: { appUpdater.whatsNew != nil && !appUpdater.showSheet },
		                            set: { if !$0 { appUpdater.whatsNew = nil } })) {
			if let release = appUpdater.whatsNew { WhatsNewSheet(release: release) { appUpdater.whatsNew = nil } }
		}
		.id(loc.lang)
		.environmentObject(engine)
		.environmentObject(editor)
		.environmentObject(terminals)
		.environmentObject(models)
		.environmentObject(runtime)
		.environmentObject(appUpdater)
		// Draw under the hidden title bar too, so the sidebars run to the top edge without a band.
		.ignoresSafeArea()
		.frame(minWidth: rendering ? 1536 : 1040, idealWidth: 1360, maxWidth: rendering ? 1536 : .infinity,
		       minHeight: rendering ? 1024 : 680, idealHeight: 860, maxHeight: rendering ? 1024 : .infinity)
		// Light only: without this, a Mac in dark mode gives the window a dark title area.
		.preferredColorScheme(.light)
		.onAppear {
			if openTerminal { terminals.wantsPanel = true }
			NSApplication.shared.appearance = NSAppearance(named: .aqua)
			// Launched from a terminal the app starts without focus; bring it to the front.
			NSApplication.shared.setActivationPolicy(.regular)
			NSApplication.shared.activate(ignoringOtherApps: true)
		}
		.onReceive(NotificationCenter.default.publisher(for: .yanaMenu)) { note in
			guard let raw = note.object as? String, let action = MenuAction(rawValue: raw) else { return }
			perform(action)
		}
	}

	// Menu bar actions (AppCommands.swift).
	private func perform(_ action: MenuAction) {
		switch action {
		case .settings: selected = "Settings"
		case .checkUpdates: Task { await runtime.check(); await appUpdater.check(userAsked: true) }
		case .newChat: engine.reset(); selected = "Chat"
		case .openFolder:
			let panel = NSOpenPanel()
			panel.canChooseDirectories = true
			panel.canChooseFiles = false
			if panel.runModal() == .OK, let url = panel.url { engine.workspace = url.path }
		case .openStudio: editor.open(folder: engine.workspace)
		case .terminal: terminals.wantsPanel = true; selected = "Chat"
		case .toggleChatList: chatSidebar.toggle(); selected = "Chat"
		default:
			let index = (Int(action.rawValue.dropFirst(4)) ?? 1) - 1
			if railEntries.indices.contains(index) { selected = railEntries[index].id }
		}
	}
}

// `YanaApp --render out.png [page]` draws the window to a 1536 x 1024 image and exits, without opening a window.
@MainActor
func renderPNG(to path: String, page: String) {
	isRenderingForImage = true
	let renderer = ImageRenderer(content: RootView(page: page, rendering: true))
	renderer.scale = 1
	guard let image = renderer.nsImage,
	      let tiff = image.tiffRepresentation,
	      let rep = NSBitmapImageRep(data: tiff),
	      let png = rep.representation(using: .png, properties: [:]) else {
		FileHandle.standardError.write(Data("render failed\n".utf8))
		exit(1)
	}
	do { try png.write(to: URL(fileURLWithPath: path)) } catch {
		FileHandle.standardError.write(Data("cannot write \(path): \(error)\n".utf8))
		exit(1)
	}
	print("wrote \(path)")
}

@main
struct YanaApp: App {
	init() {
		let args = CommandLine.arguments
		if let index = args.firstIndex(of: "--render"), index + 1 < args.count {
			// Optional third argument picks the page, e.g. `--render out.png "Tool approvals"`.
			renderPNG(to: args[index + 1], page: index + 2 < args.count ? args[index + 2] : "Chat")
			exit(0)
		}
	}

	var body: some Scene {
		WindowGroup("Yana") { RootView() }
			.windowStyle(.hiddenTitleBar)
			.commands { YanaCommands() }
	}
}
