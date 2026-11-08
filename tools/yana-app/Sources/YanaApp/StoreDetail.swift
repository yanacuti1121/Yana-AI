import AppKit
import SwiftUI

// One plugin's page, App Store style: icon, name, developer, the main button, then what it is, what it adds,
// and where it comes from. "Get" (installing for real, with supply-chain checks through yana-rt) is step 2 of
// Program L; until then the button says so, and links open the plugin's own page.

struct StoreDetailSheet: View {
	let item: StoreItem
	let close: () -> Void
	@EnvironmentObject private var engine: ChatEngine
	@EnvironmentObject private var terminals: TerminalStore
	@State private var preview: McpInstaller.Entry?
	@State private var problem: String?
	@State private var installed = false

	var body: some View {
		VStack(alignment: .leading, spacing: 0) {
			HStack(alignment: .top, spacing: 18) {
				AppIconTile(name: item.name, size: 96)
				VStack(alignment: .leading, spacing: 6) {
					Text(item.name).font(.system(size: 24, weight: .bold)).foregroundStyle(FB.text)
					Text(item.author ?? item.feedLabel).font(.fbBody).foregroundStyle(FB.textSecondary)
					HStack(spacing: 8) {
						SourceBadge(item: item)
						Text(StoreCategories.label(item.category)).font(.fbCaption).foregroundStyle(FB.textSecondary)
					}
					HStack(spacing: 8) {
						mainButton
						if let link = item.link {
							FBButton(title: L(item.kind == .awesomeList ? "store.openChatGPT" : "store.openPage"), variant: .secondary, size: .small) {
								NSWorkspace.shared.open(link)
							}
						}
					}
					.padding(.top, 6)
				}
				Spacer()
				Button(action: close) { Image(systemName: "xmark").font(.system(size: 12, weight: .semibold)) }
					.buttonStyle(.plain).foregroundStyle(FB.textSecondary)
					.frame(width: 28, height: 28).background(Circle().fill(FB.surfaceTertiary))
			}
			.padding(24)
			FB.divider.frame(height: 1)
			ScrollView {
				VStack(alignment: .leading, spacing: 18) {
					if let problem { FBAlert(kind: .error, text: problem, closable: false) }
					if let preview { previewPanel(preview) }
					Text(item.summary.isEmpty ? L("store.noDescription") : item.summary).font(.system(size: 14)).foregroundStyle(FB.text)
						.textSelection(.enabled).fixedSize(horizontal: false, vertical: true)
					if !item.parts.isEmpty {
						section(L(item.kind == .mcpRegistry ? "store.connectHow" : "store.adds")) {
							ForEach(item.parts, id: \.self) { part in
								Text(part).font(.system(size: 12, design: .monospaced)).foregroundStyle(FB.text).textSelection(.enabled)
							}
						}
					}
					section(L("store.info")) {
						row(L("store.source"), item.feedLabel)
						row(L("store.category"), StoreCategories.label(item.category))
						if let version = item.version { row(L("store.version"), version) }
						if let pin = item.pin, pin != "latest" { row(L("store.pin"), String(pin.prefix(12))) }
						if let author = item.author { row(L("store.developer"), author) }
					}
					Text(L(item.kind == .awesomeList ? "store.chatgptNote" : "store.safetyNote")).font(.fbCaption).foregroundStyle(FB.textSecondary)
						.fixedSize(horizontal: false, vertical: true)
				}
				.padding(24)
				.frame(maxWidth: .infinity, alignment: .leading)
			}
		}
		.frame(width: 640, height: 560)
		.background(FB.canvas)
		.onAppear { installed = McpInstaller.installedNames(in: engine.workspace).contains(McpInstaller.serverName(item)) }
	}

	@ViewBuilder
	private var mainButton: some View {
		switch item.kind {
		case .awesomeList:
			label(L("store.chatgptOnly"))
		case .mcpRegistry where item.package == nil:
			label(L("mcp.remoteOnlyShort")).help(L("mcp.remoteOnly"))
		case .mcpRegistry where installed:
			HStack(spacing: 8) {
				label(L("mcp.added"))
				FBButton(title: L("store.remove"), variant: .secondary, size: .small) { remove() }
			}
		case .mcpRegistry:
			Button(action: startGet) {
				Text(L("store.get")).font(.system(size: 13, weight: .bold)).foregroundStyle(FB.onPrimary)
					.padding(.horizontal, 20).padding(.vertical, 6).background(Capsule().fill(FB.primary))
			}
			.buttonStyle(.plain)
		case .marketplace:
			label(L("store.getSoon")).help(L("store.getSoonHelp"))
		}
	}

	private func label(_ text: String) -> some View {
		Text(text).font(.system(size: 12, weight: .semibold)).foregroundStyle(FB.textSecondary)
			.padding(.horizontal, 14).padding(.vertical, 6).background(Capsule().fill(FB.surfaceTertiary))
	}

	// Step 1 of Get: show exactly what will be written, before anything is written.
	private func startGet() {
		problem = nil
		do { preview = try McpInstaller.entry(for: item) } catch { problem = error.localizedDescription }
	}

	// Step 2: write the entry, then open the app terminal on `yana-rt trust allow mcp-servers` for the typed yes.
	private func confirmGet(_ entry: McpInstaller.Entry) {
		do {
			try McpInstaller.add(item, workspace: engine.workspace)
		} catch {
			problem = error.localizedDescription
			return
		}
		guard let job = McpInstaller.confirmJob() else { problem = RtError.notInstalled.message; return }
		terminals.run(job, folder: engine.workspace)
		close()
	}

	private func remove() {
		do {
			try McpInstaller.remove(McpInstaller.serverName(item), workspace: engine.workspace)
			installed = false
			// The file changed, so the servers left need a new confirmation before yana-rt uses them again.
			if !McpInstaller.installedNames(in: engine.workspace).isEmpty, let job = McpInstaller.confirmJob() {
				terminals.run(job, folder: engine.workspace)
				close()
			}
		} catch {
			problem = error.localizedDescription
		}
	}

	private func previewPanel(_ entry: McpInstaller.Entry) -> some View {
		VStack(alignment: .leading, spacing: 10) {
			Text(L("mcp.previewTitle")).font(.system(size: 15, weight: .bold)).foregroundStyle(FB.text)
			Text(String(format: L("mcp.previewWhere"), McpInstaller.configPath, URL(fileURLWithPath: engine.workspace).lastPathComponent))
				.font(.fbCaption).foregroundStyle(FB.textSecondary)
			VStack(alignment: .leading, spacing: 4) {
				Text("\(L("mcp.name")): \(entry.name)")
				Text("\(L("mcp.command")): \(entry.commandLine)")
				if !entry.env.isEmpty { Text("\(L("mcp.envNames")): \(entry.env.joined(separator: ", "))") }
			}
			.font(.system(size: 12, design: .monospaced)).foregroundStyle(FB.text).textSelection(.enabled)
			.padding(10).frame(maxWidth: .infinity, alignment: .leading)
			.background(RoundedRectangle(cornerRadius: 8).fill(FB.surfaceTertiary))
			if let required = item.package?.requiredEnv, !required.isEmpty {
				Text(String(format: L("mcp.needsEnv"), required.joined(separator: ", "))).font(.fbCaption).foregroundStyle(FB.warningText)
					.fixedSize(horizontal: false, vertical: true)
			}
			Text(L("mcp.previewSteps")).font(.fbCaption).foregroundStyle(FB.textSecondary).fixedSize(horizontal: false, vertical: true)
			HStack {
				Spacer()
				FBButton(title: L("store.cancel"), variant: .secondary, size: .small) { preview = nil }
				FBButton(title: L("mcp.addAndConfirm"), variant: .primary, size: .small) { confirmGet(entry) }
			}
		}
		.padding(14)
		.background(RoundedRectangle(cornerRadius: 12).stroke(FB.primaryBorder))
	}

	private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
		VStack(alignment: .leading, spacing: 8) {
			Text(title).font(.system(size: 15, weight: .bold)).foregroundStyle(FB.text)
			content()
		}
	}

	private func row(_ label: String, _ value: String) -> some View {
		HStack {
			Text(label).font(.fbBody).foregroundStyle(FB.textSecondary)
			Spacer()
			Text(value).font(.fbBody).foregroundStyle(FB.text).textSelection(.enabled)
		}
	}
}

// Category names: Claude's marketplace uses English ids; the ChatGPT list uses headings as they are.
enum StoreCategories {
	static let names: [String: String] = [
		"development": "store.cat.development", "productivity": "store.cat.productivity", "database": "store.cat.database",
		"monitoring": "store.cat.monitoring", "security": "store.cat.security", "deployment": "store.cat.deployment",
		"design": "store.cat.design", "automation": "store.cat.automation", "learning": "store.cat.learning",
		"testing": "store.cat.testing", "mcp": "store.cat.mcp", "other": "store.cat.other",
	]
	static func label(_ id: String) -> String { names[id].map(L) ?? id.prefix(1).uppercased() + id.dropFirst() }
}

// Store sources: the three built in, plus any the user adds (marketplace.json, MCP registry, Markdown list).
struct StoreSourcesView: View {
	@ObservedObject var catalog: PluginCatalog
	@State private var kind: StoreFeed.Kind = .marketplace
	@State private var url = ""
	@State private var label = ""
	@State private var problem: String?

	var body: some View {
		VStack(alignment: .leading, spacing: 14) {
			ForEach(catalog.feeds) { feed in
				HStack {
					VStack(alignment: .leading, spacing: 2) {
						Text(feed.label).font(.fbBodyMedium).foregroundStyle(FB.text)
						Text(feed.url.absoluteString).font(.fbCaption).foregroundStyle(FB.textSecondary).lineLimit(1).truncationMode(.middle)
					}
					Spacer()
					Text("\(catalog.items.filter { $0.feed == feed.id }.count) \(L("store.items"))").font(.fbCaption).foregroundStyle(FB.textSecondary)
					if feed.builtIn {
						Text(L("store.builtIn")).font(.fbCaption).foregroundStyle(FB.textTertiary)
					} else {
						FBButton(title: L("store.remove"), variant: .secondary, size: .small) { catalog.removeFeed(feed) }
					}
				}
				.padding(12).background(RoundedRectangle(cornerRadius: 12).fill(FB.surfaceSecondary))
			}
			VStack(alignment: .leading, spacing: 8) {
				Text(L("store.addSource")).font(.fbHeading5).foregroundStyle(FB.text)
				Picker(L("store.sourceKind"), selection: $kind) {
					Text(L("store.kind.marketplace")).tag(StoreFeed.Kind.marketplace)
					Text(L("store.kind.mcpRegistry")).tag(StoreFeed.Kind.mcpRegistry)
					Text(L("store.kind.awesomeList")).tag(StoreFeed.Kind.awesomeList)
				}
				TextField("https://…", text: $url).textFieldStyle(.roundedBorder)
				TextField(L("store.sourceName"), text: $label).textFieldStyle(.roundedBorder)
				HStack {
					if let problem { Text(problem).font(.fbCaption).foregroundStyle(FB.errorText) }
					Spacer()
					FBButton(title: L("store.add"), variant: .primary, size: .small) {
						problem = catalog.addFeed(kind: kind, urlText: url, label: label)
						if problem == nil { url = ""; label = ""; Task { await catalog.refresh() } }
					}
				}
				Text(L("store.addSourceNote")).font(.fbCaption).foregroundStyle(FB.textSecondary).fixedSize(horizontal: false, vertical: true)
			}
			.padding(14).background(RoundedRectangle(cornerRadius: 12).stroke(FB.border))
		}
	}
}
