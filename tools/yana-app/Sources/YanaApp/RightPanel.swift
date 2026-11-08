import AppKit
import SwiftUI

// The panel on the right of the chat: tools, quick starts and live status. It switches in place to the
// project file list; the browser takes the same slot (ChatHome decides which one shows).
// Status values come from yana-rt and git; quick starts only fill the composer, the user still sends.

enum RightMode { case hidden, tools, files, browser, terminal }

struct PanelStatus {
	var version = "…"
	var branch = "…"
	var pending = 0
}

struct RightPanel: View {
	@EnvironmentObject private var engine: ChatEngine
	@EnvironmentObject private var editor: EditorLauncher
	@Binding var mode: RightMode
	let fill: (String, Bool) -> Void // (prompt, plan mode)
	let openApprovals: () -> Void
	@State private var status = PanelStatus()

	private let starts: [(key: String, icon: String, plan: Bool)] = [
		("start.explain", "compass", true),
		("start.bugs", "search", true),
		("start.tests", "check-circle", false),
		("start.plan", "list-ordered", true),
	]

	var body: some View {
		ScrollView {
			VStack(alignment: .leading, spacing: 18) {
				// No heading: the panel header already says "Tools".
				section(nil) {
					// Yana Studio starts only here, on demand, in its own window.
					// Two different tools, named apart on purpose: the editor leaves the app (↗ separate window),
					// the terminal opens right here in this panel.
					ToolRow(icon: "code", title: L("panel.editorExternal")) { editor.open(folder: engine.workspace) }
					if case .failed(let why) = editor.status {
						Text(why).font(.fbCaption).foregroundStyle(FB.errorText).padding(.horizontal, 10)
					}
					ToolRow(icon: "terminal", title: L("panel.terminalHere")) { mode = .terminal }
					ToolRow(icon: "globe", title: L("browser.show")) { mode = .browser }
					ToolRow(icon: "folder", title: L("panel.files")) { mode = .files }
					ToolRow(icon: "shield", title: L("nav.Tool approvals"), badge: status.pending, action: openApprovals)
				}
				section(L("panel.start")) {
					ForEach(starts, id: \.key) { item in
						ToolRow(icon: item.icon, title: L(item.key)) { fill(L(item.key), item.plan) }
					}
				}
				section(L("panel.status")) {
					fact("yana-rt", status.version)
					fact(L("panel.model"), engine.model.map { "\(engine.provider) · \($0)" } ?? L("model.choose"))
					fact(L("usage.thisChat"), "↑ \(engine.chatInputTokens)  ↓ \(engine.chatOutputTokens)")
					fact(L("home.branch"), status.branch)
					fact(L("home.waiting"), "\(status.pending)")
				}
			}
			.padding(16)
		}
		.task { await load() }
	}

	private func load() async {
		let workspace = engine.workspace
		status = await Task.detached { () -> PanelStatus in
			var result = PanelStatus()
			result.version = RtClient.versionString()
			result.branch = RtClient.gitBranch(in: workspace)
			result.pending = (try? RtClient.run(["authority", "pending-approvals"], as: [PendingApproval].self).count) ?? 0
			return result
		}.value
	}

	private func section<Content: View>(_ title: String?, @ViewBuilder content: () -> Content) -> some View {
		VStack(alignment: .leading, spacing: 4) {
			if let title {
				Text(title).font(.system(size: 12, weight: .semibold)).foregroundStyle(FB.textSecondary).padding(.horizontal, 6)
			}
			content()
		}
	}

	private func fact(_ title: String, _ value: String) -> some View {
		HStack {
			Text(title).font(.fbCaption).foregroundStyle(FB.textSecondary)
			Spacer(minLength: 8)
			Text(value).font(.fbCaption).foregroundStyle(FB.text).lineLimit(1).truncationMode(.middle)
		}
		.padding(.horizontal, 6).padding(.vertical, 3)
	}
}

struct ToolRow: View {
	let icon: String
	let title: String
	var badge = 0
	let action: () -> Void
	@State private var hover = false

	var body: some View {
		HStack(spacing: 10) {
			FBIcon(name: icon, size: 15, color: FB.textSecondary)
			Text(title).font(.system(size: 13)).foregroundStyle(FB.text).lineLimit(2)
			Spacer(minLength: 4)
			if badge > 0 {
				Text("\(badge)").font(.fb(12, .semibold)).foregroundStyle(FB.onPrimary)
					.padding(.horizontal, 6).frame(height: 18).background(Capsule().fill(FB.error))
			}
		}
		.padding(.horizontal, 10).padding(.vertical, 8)
		.background(RoundedRectangle(cornerRadius: 10).fill(hover ? FB.hoverOnCanvas : FB.canvas))
		.overlay(RoundedRectangle(cornerRadius: 10).stroke(FB.divider, lineWidth: 1))
		.contentShape(Rectangle())
		.onHover { hover = $0 }
		.onTapGesture(perform: action)
	}
}

// Files of the chat's workspace. Folders open in place (never above the workspace); a file opens in its
// default app. Hidden files are skipped; at most `limit` entries are listed per folder.
struct FilesPanel: View {
	@EnvironmentObject private var engine: ChatEngine
	@State private var folder: URL? = nil
	@State private var entries: [URL] = []
	private static let limit = 300

	private var root: URL { URL(fileURLWithPath: engine.workspace) }

	var body: some View {
		VStack(alignment: .leading, spacing: 6) {
			HStack(spacing: 6) {
				if let folder, folder.standardizedFileURL != root.standardizedFileURL {
					FBIconButton(icon: "arrow-left", variant: .ghost, size: .small, tooltip: L("browser.back")) { open(folder.deletingLastPathComponent()) }
				}
				Text((folder ?? root).lastPathComponent).font(.fbBodyMedium).foregroundStyle(FB.text).lineLimit(1)
				Spacer()
			}
			.padding(EdgeInsets(top: 12, leading: 12, bottom: 0, trailing: 8))
			ScrollView {
				LazyVStack(alignment: .leading, spacing: 0) {
					ForEach(entries, id: \.self) { url in
						let isDir = (try? url.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) ?? false
						SidebarRow(icon: isDir ? "folder" : "file", title: url.lastPathComponent, strong: false)
							.onTapGesture {
								if isDir { open(url) } else { NSWorkspace.shared.open(url) }
							}
					}
				}
				.padding(.horizontal, 6)
			}
		}
		.onAppear { open(folder ?? root) }
	}

	private func open(_ url: URL) {
		// Stay inside the workspace.
		guard url.standardizedFileURL.path.hasPrefix(root.standardizedFileURL.path) else { return }
		folder = url
		let items = (try? FileManager.default.contentsOfDirectory(at: url, includingPropertiesForKeys: [.isDirectoryKey],
		                                                          options: [.skipsHiddenFiles])) ?? []
		entries = items.sorted { a, b in
			let da = (try? a.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) ?? false
			let db = (try? b.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) ?? false
			return da != db ? da : a.lastPathComponent.localizedStandardCompare(b.lastPathComponent) == .orderedAscending
		}.prefix(Self.limit).map { $0 }
	}
}
