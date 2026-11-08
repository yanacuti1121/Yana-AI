import AppKit
import SwiftTerm
import SwiftUI

// Yana's built-in terminal, laid out like macOS Terminal: tabs, a real login shell in the project folder,
// copy/select/scrollback, ⌘T new tab, ⌘W close tab, ⌘= / ⌘- text size. SwiftTerm (MIT) does the
// terminal emulation. The store lives on the root view, so switching pages never closes a tab: a shell
// only ends when its tab is closed or its program exits.

@MainActor
final class TerminalTab: NSObject, ObservableObject, Identifiable, LocalProcessTerminalViewDelegate {
	let id = UUID()
	let view: LocalProcessTerminalView
	@Published var title: String
	@Published var exited = false

	// A fixed program this tab runs instead of a shell (the runtime installer), with its title.
	struct Job {
		let executable: String
		let args: [String]
		let title: String
	}

	init(folder: String, fontSize: CGFloat, job: Job? = nil) {
		view = LocalProcessTerminalView(frame: NSRect(x: 0, y: 0, width: 800, height: 500))
		title = job?.title ?? URL(fileURLWithPath: folder).lastPathComponent
		super.init()
		TerminalStyle.apply(to: view, fontSize: fontSize)
		view.processDelegate = self
		if let job {
			let environment = Terminal.getEnvironmentVariables(termName: "xterm-256color", trueColor: true) + ["TERM_PROGRAM=Yana"]
			view.startProcess(executable: job.executable, args: job.args, environment: environment, execName: nil, currentDirectory: folder)
		} else {
			start(in: folder)
		}
	}

	func start(in folder: String) {
		let shell = ProcessInfo.processInfo.environment["SHELL"] ?? "/bin/zsh"
		var environment = Terminal.getEnvironmentVariables(termName: "xterm-256color", trueColor: true)
		environment += ["SHELL=\(shell)", "TERM_PROGRAM=Yana"]
		// "-zsh" as argv[0] makes it a login shell, the way macOS Terminal starts one (PATH from path_helper).
		let execName = "-" + URL(fileURLWithPath: shell).lastPathComponent
		exited = false
		view.startProcess(executable: shell, args: [], environment: environment, execName: execName, currentDirectory: folder)
	}

	func stop() { if view.process?.running == true { view.process.terminate() } }

	// SwiftTerm calls these from its own queue; state changes hop to the main actor.
	nonisolated func sizeChanged(source: LocalProcessTerminalView, newCols: Int, newRows: Int) {}
	nonisolated func setTerminalTitle(source: LocalProcessTerminalView, title: String) {
		DispatchQueue.main.async { MainActor.assumeIsolated { if !title.isEmpty { self.title = title } } }
	}
	nonisolated func hostCurrentDirectoryUpdate(source: TerminalView, directory: String?) {}
	nonisolated func processTerminated(source: TerminalView, exitCode: Int32?) {
		DispatchQueue.main.async { MainActor.assumeIsolated { self.exited = true } }
	}
}

@MainActor
final class TerminalStore: ObservableObject {
	@Published private(set) var tabs: [TerminalTab] = []
	// Set when the terminal should open in the chat page's right panel (start chooser, start page).
	@Published var wantsPanel = false
	@Published var selected: UUID?
	@Published private(set) var fontSize: CGFloat
	private static let fontKey = "yana.terminal.fontSize"
	private static let fontRange: ClosedRange<CGFloat> = 9 ... 28
	private static let defaultFont: CGFloat = 13

	init() {
		let saved = CGFloat(UserDefaults.standard.double(forKey: Self.fontKey))
		fontSize = Self.fontRange.contains(saved) ? saved : Self.defaultFont
	}

	var current: TerminalTab? { tabs.first { $0.id == selected } ?? tabs.last }

	func newTab(folder: String) {
		let tab = TerminalTab(folder: folder, fontSize: fontSize)
		tabs.append(tab)
		selected = tab.id
	}

	// Runs a fixed job in a new tab, so the user watches it while the app keeps working. `openPanel` also
	// opens the chat page's terminal panel; Settings passes false and shows the tab in place instead.
	@discardableResult
	func run(_ job: TerminalTab.Job, folder: String, openPanel: Bool = true) -> TerminalTab {
		let tab = TerminalTab(folder: folder, fontSize: fontSize, job: job)
		tabs.append(tab)
		selected = tab.id
		if openPanel { wantsPanel = true }
		return tab
	}

	func close(_ id: UUID) {
		guard let index = tabs.firstIndex(where: { $0.id == id }) else { return }
		tabs[index].stop()
		tabs.remove(at: index)
		if selected == id { selected = tabs.isEmpty ? nil : tabs[max(0, index - 1)].id }
	}

	func zoom(_ step: CGFloat) { setFontSize(fontSize + step) }

	func setFontSize(_ size: CGFloat) {
		fontSize = min(max(size, Self.fontRange.lowerBound), Self.fontRange.upperBound)
		UserDefaults.standard.set(Double(fontSize), forKey: Self.fontKey)
		restyle()
	}

	// Re-applies font, colors and the ⌥ setting to every open tab (after a Settings change).
	func restyle() { for tab in tabs { TerminalStyle.apply(to: tab.view, fontSize: fontSize) } }
}

// Light theme on Yana's tokens. The 16 ANSI colors are macOS Terminal's "Basic" profile, which is made
// for a white background (the xterm defaults put yellow and white text on white).
enum TerminalStyle {
	private static let basic: [(UInt16, UInt16, UInt16)] = [
		(0x00, 0x00, 0x00), (0x99, 0x00, 0x00), (0x00, 0xA6, 0x00), (0x99, 0x99, 0x00),
		(0x00, 0x00, 0xB2), (0xB2, 0x00, 0xB2), (0x00, 0xA6, 0xB2), (0xBF, 0xBF, 0xBF),
		(0x66, 0x66, 0x66), (0xE5, 0x00, 0x00), (0x00, 0xD9, 0x00), (0xE5, 0xE5, 0x00),
		(0x00, 0x00, 0xFF), (0xE5, 0x00, 0xE5), (0x00, 0xE5, 0xE5), (0xE5, 0xE5, 0xE5),
	]

	@MainActor
	static func apply(to view: LocalProcessTerminalView, fontSize: CGFloat) {
		view.font = NSFont.monospacedSystemFont(ofSize: fontSize, weight: .regular) // SF Mono
		view.nativeBackgroundColor = NSColor(FB.canvas)
		view.nativeForegroundColor = NSColor(FB.text)
		view.caretColor = NSColor(FB.primary)
		view.selectedTextBackgroundColor = NSColor(FB.primarySubtleHover)
		view.installColors(basic.map { SwiftTerm.Color(red8: $0.0, green8: $0.1, blue8: $0.2) })
		// Off by default: ⌥ types accented letters, like macOS Terminal. Settings can switch it to Meta.
		view.optionAsMetaKey = AppSettings.shared.terminalOptionAsMeta
	}
}

// Hosts the selected tab's AppKit view. Tabs keep their own views, so switching only swaps the child.
// Also used by Settings > Updates to show the install tab in place.
struct TerminalHost: NSViewRepresentable {
	let tab: TerminalTab

	func makeNSView(context: Context) -> NSView { NSView() }

	func updateNSView(_ container: NSView, context: Context) {
		guard container.subviews.first !== tab.view else { return }
		container.subviews.forEach { $0.removeFromSuperview() }
		tab.view.frame = container.bounds
		tab.view.autoresizingMask = [.width, .height]
		container.addSubview(tab.view)
		DispatchQueue.main.async { tab.view.window?.makeFirstResponder(tab.view) }
	}
}

// Shown in the chat page's right-hand panel, in the same slot as the browser (it is its own tool, not
// the code editor: Yana Studio opens in a separate window). Expand fills the page; close hides the panel
// without ending any shell.
struct TerminalPage: View {
	@EnvironmentObject private var store: TerminalStore
	@EnvironmentObject private var engine: ChatEngine
	@Binding var expanded: Bool
	let close: () -> Void

	var body: some View {
		VStack(spacing: 0) {
			tabBar
			FB.divider.frame(height: 1)
			if let tab = store.current {
				TerminalHost(tab: tab)
					.padding(EdgeInsets(top: 8, leading: 12, bottom: 8, trailing: 4))
					.overlay(alignment: .bottom) { if tab.exited { exitedBar(tab) } }
					.id(tab.id)
			} else {
				Spacer()
			}
		}
		.background(FB.canvas)
		.onAppear { if store.tabs.isEmpty { store.newTab(folder: engine.workspace) } }
		.background { shortcuts }
	}

	private var tabBar: some View {
		HStack(spacing: 6) {
			ScrollView(.horizontal, showsIndicators: false) {
				HStack(spacing: 6) {
					ForEach(store.tabs) { tab in
						TerminalTabChip(tab: tab, selected: tab.id == store.current?.id,
						                select: { store.selected = tab.id }, close: { store.close(tab.id) })
					}
				}
			}
			FBIconButton(icon: "plus", variant: .ghost, size: .small, tooltip: L("term.new")) { store.newTab(folder: engine.workspace) }
			FBIconButton(icon: "maximize", variant: .ghost, size: .small,
			             tooltip: expanded ? L("browser.restore") : L("browser.expand")) { expanded.toggle() }
			FBIconButton(icon: "close", variant: .ghost, size: .small, tooltip: L("term.hidePanel"), action: close)
		}
		.padding(EdgeInsets(top: titleBarClearance, leading: 14, bottom: 8, trailing: 14))
		.background(FB.chrome)
	}

	private func exitedBar(_ tab: TerminalTab) -> some View {
		HStack(spacing: 10) {
			Text(L("term.exited")).font(.fbCaption).foregroundStyle(FB.textSecondary)
			FBButton(title: L("term.restart"), variant: .secondary, size: .small) { tab.start(in: engine.workspace) }
		}
		.padding(10)
		.glassCard(radius: 12)
		.padding(14)
	}

	// Keyboard shortcuts, active while this page is shown.
	private var shortcuts: some View {
		Group {
			Button("") { store.newTab(folder: engine.workspace) }.keyboardShortcut("t", modifiers: .command)
			Button("") { if let id = store.current?.id { store.close(id) } }.keyboardShortcut("w", modifiers: .command)
			Button("") { store.zoom(1) }.keyboardShortcut("=", modifiers: .command)
			Button("") { store.zoom(-1) }.keyboardShortcut("-", modifiers: .command)
		}
		.opacity(0)
		.allowsHitTesting(false)
	}
}

private struct TerminalTabChip: View {
	@ObservedObject var tab: TerminalTab
	let selected: Bool
	let select: () -> Void
	let close: () -> Void
	@State private var hover = false

	var body: some View {
		HStack(spacing: 6) {
			FBIcon(name: "terminal", size: 13, color: selected ? FB.primaryText : FB.textSecondary)
			Text(tab.title).font(.system(size: 12, weight: selected ? .semibold : .regular))
				.foregroundStyle(tab.exited ? FB.textSecondary : FB.text).lineLimit(1)
			FBIcon(name: "close", size: 11, color: FB.textSecondary)
				.opacity(hover || selected ? 1 : 0)
				.onTapGesture(perform: close)
				.help(L("term.close"))
		}
		.padding(.horizontal, 10)
		.frame(height: 28)
		.frame(maxWidth: 220)
		.background(RoundedRectangle(cornerRadius: 8).fill(selected ? FB.canvas : hover ? FB.hoverOnChrome : .clear))
		.overlay(RoundedRectangle(cornerRadius: 8).stroke(selected ? FB.divider : .clear, lineWidth: 1))
		.contentShape(Rectangle())
		.onTapGesture(perform: select)
		.onHover { hover = $0 }
	}
}

// The install tab shown in place (Settings > Updates): a framed terminal with its state above it.
struct InstallTerminal: View {
	@ObservedObject var tab: TerminalTab
	static let height: CGFloat = 300

	var body: some View {
		VStack(alignment: .leading, spacing: 8) {
			Label(L(tab.exited ? "rt.installEnded" : "rt.installRunning"),
			      systemImage: tab.exited ? "checkmark.circle" : "terminal")
				.font(.fbCaption).foregroundStyle(tab.exited ? FB.successText : FB.textSecondary)
			TerminalHost(tab: tab)
				.frame(height: Self.height)
				.clipShape(RoundedRectangle(cornerRadius: FB.radiusLG))
				.overlay(RoundedRectangle(cornerRadius: FB.radiusLG).stroke(FB.border, lineWidth: 1))
		}
	}
}
