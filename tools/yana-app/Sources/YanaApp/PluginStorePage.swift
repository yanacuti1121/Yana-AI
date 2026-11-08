import SwiftUI

// The plugin store: one place to browse and install what Yana can use. It only lists real things:
// connectors from `yana-rt connector list --json` (installable here: Install runs `connector enable` with
// the scopes the user ticks, Remove runs `connector disable`), MCP servers from `yana-rt trust status`
// (adding one needs a typed `yes` in a terminal, so the store explains that instead of faking a button),
// and the skill count from core/skills. A catalog of third-party plugins waits for Program L.

extension RtClient {
	// Runs a yana-rt action and reports success with the trimmed stderr/stdout for the user.
	static func act(_ args: [String]) -> (ok: Bool, message: String) {
		guard let binary = binaryPath() else { return (false, RtError.notInstalled.message) }
		let process = Process()
		process.executableURL = URL(fileURLWithPath: binary)
		process.arguments = args
		process.currentDirectoryURL = URL(fileURLWithPath: workspace())
		let out = Pipe()
		process.standardOutput = out
		process.standardError = out
		do { try process.run() } catch { return (false, error.localizedDescription) }
		let data = out.fileHandleForReading.readDataToEndOfFile()
		process.waitUntilExit()
		let text = String(decoding: data, as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines)
		return (process.terminationStatus == 0, text)
	}

	// "mcp-servers   not present" -> "not present"; nil when the line is missing.
	static func mcpTrustState() -> String? {
		let result = act(["trust", "status"])
		return result.message.split(separator: "\n").first { $0.hasPrefix("mcp-servers") }
			.map { $0.dropFirst("mcp-servers".count).trimmingCharacters(in: .whitespaces) }
	}
}

struct PluginStorePage: View {
	@State private var connectors: [Connector]? = nil
	@State private var mcpState: String? = nil
	@State private var query = ""
	@State private var installedOnly = false
	@State private var notice: (ok: Bool, text: String)? = nil
	@State private var installing: Connector? = nil

	private func installed(_ c: Connector) -> Bool { c.connectionState != "disabled" }

	private var shown: [Connector] {
		let q = query.trimmingCharacters(in: .whitespaces).lowercased()
		return (connectors ?? []).filter { c in
			(!installedOnly || installed(c)) && (q.isEmpty || c.name.lowercased().contains(q) || c.description.lowercased().contains(q))
		}
	}

	var body: some View {
		ScrollView {
			VStack(alignment: .leading, spacing: 16) {
				PageHeader(title: L("nav.Plugins"), subtitle: L("store.subtitle")) { Task { await load() } }
				HStack(spacing: 10) {
					TextField(L("store.search"), text: $query)
						.textFieldStyle(.plain).font(.fbBody)
						.padding(.horizontal, 12).frame(width: 360, height: 34)
						.background(Capsule().fill(FB.canvas))
						.overlay(Capsule().stroke(FB.divider, lineWidth: 1))
					tab(L("store.all"), active: !installedOnly) { installedOnly = false }
					tab(L("store.installed"), active: installedOnly) { installedOnly = true }
				}
				if let notice { FBAlert(kind: notice.ok ? .success : .error, text: notice.text, closable: false) }

				Panel(title: L("store.connectors"), count: shown.count) {
					if connectors == nil { Text(L("loading")).font(.fbBody).foregroundStyle(FB.textSecondary) }
					LazyVGrid(columns: [GridItem(.flexible(), spacing: 24), GridItem(.flexible(), spacing: 24)], alignment: .leading, spacing: 6) {
						ForEach(shown) { connectorRow($0) }
					}
				}
				Panel(title: L("store.mcp")) {
					Text("\(L("store.mcpState")): \(mcpState ?? "…")").font(.fbBody).foregroundStyle(FB.text)
					Text(L("store.mcpHow")).font(.fbCaption).foregroundStyle(FB.textSecondary).fixedSize(horizontal: false, vertical: true)
				}
				// External plugins (Claude, Codex, other catalogs) need Program L: no catalog is wired yet.
				Panel(title: L("store.external")) {
					Text(L("store.externalNone")).font(.fbBody).foregroundStyle(FB.textSecondary)
						.fixedSize(horizontal: false, vertical: true)
				}
			}
			.padding(EdgeInsets(top: 8, leading: 24, bottom: 24, trailing: 24))
			.frame(maxWidth: .infinity, alignment: .topLeading)
		}
		.task { await load() }
		.sheet(item: $installing) { c in
			InstallSheet(connector: c) { scopes in
				installing = nil
				guard let scopes else { return }
				Task { await run(["connector", "enable", c.name] + scopes.flatMap { ["--scope", $0] }, done: "\(c.name): \(L("store.installedOk"))") }
			}
		}
	}

	private func tab(_ title: String, active: Bool, action: @escaping () -> Void) -> some View {
		Text(title).font(.fbBodyMedium).foregroundStyle(active ? FB.text : FB.textSecondary)
			.padding(.horizontal, 14).frame(height: 32)
			.background(Capsule().fill(active ? FB.canvas : .clear))
			.overlay(Capsule().stroke(active ? FB.divider : .clear, lineWidth: 1))
			.contentShape(Capsule())
			.onTapGesture(perform: action)
	}

	private func connectorRow(_ c: Connector) -> some View {
		HStack(spacing: 12) {
			Text(String(c.name.prefix(1)).uppercased()).font(.fb(15, .semibold)).foregroundStyle(FB.primaryText)
				.frame(width: 36, height: 36)
				.background(RoundedRectangle(cornerRadius: 10).fill(FB.primarySubtle))
			VStack(alignment: .leading, spacing: 2) {
				Text(c.name).font(.fbBodyMedium).foregroundStyle(FB.text)
				Text(c.description).font(.fbCaption).foregroundStyle(FB.textSecondary).lineLimit(1)
				if installed(c) {
					Text(c.connectionState == "credential-required" ? L("conn.credentialRequired") : c.connectionState)
						.font(.fbCaption).foregroundStyle(FB.warningText)
				}
			}
			Spacer(minLength: 8)
			if installed(c) {
				FBButton(title: L("store.remove"), variant: .secondary, size: .small) {
					Task { await run(["connector", "disable", c.name], done: "\(c.name): \(L("store.removedOk"))") }
				}
			} else {
				FBIconButton(icon: "plus", variant: .secondary, size: .small, tooltip: L("store.install")) { installing = c }
			}
		}
		.padding(.vertical, 6)
	}

	private func run(_ args: [String], done: String) async {
		let result = await Task.detached { RtClient.act(args) }.value
		notice = (result.ok, result.ok ? done : result.message)
		await load()
	}

	private func load() async {
		switch await Task.detached(operation: { RtClient.loadConnectors() }).value {
		case .success(let list): connectors = list
		case .failure(let failure): notice = (false, failure.message); connectors = []
		}
		mcpState = await Task.detached { RtClient.mcpTrustState() }.value ?? "?"
	}
}

// Choose which scopes to grant. Nothing is ticked at first: the user grants the least that works.
struct InstallSheet: View {
	let connector: Connector
	let finish: ([String]?) -> Void
	@State private var picked: Set<String> = []

	var body: some View {
		VStack(alignment: .leading, spacing: 12) {
			Text("\(L("store.install")): \(connector.name)").font(.fbHeading5).foregroundStyle(FB.text)
			Text(connector.description).font(.fbBody).foregroundStyle(FB.textSecondary)
			Text(L("store.pickScopes")).font(.fbBodyMedium).foregroundStyle(FB.text)
			ForEach(connector.allowedScopes, id: \.self) { scope in
				Toggle(scope, isOn: Binding(get: { picked.contains(scope) },
				                            set: { on in if on { picked.insert(scope) } else { picked.remove(scope) } }))
					.toggleStyle(.checkbox).font(.fbBody)
			}
			HStack {
				Spacer()
				FBButton(title: L("store.cancel"), variant: .secondary, size: .small) { finish(nil) }
				FBButton(title: L("store.install"), variant: .primary, size: .small) { finish(Array(picked).sorted()) }
					.disabled(picked.isEmpty)
			}
		}
		.padding(20)
		.frame(width: 420)
	}
}
