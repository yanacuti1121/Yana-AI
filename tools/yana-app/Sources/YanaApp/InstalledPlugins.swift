import SwiftUI

// The store's "Installed" tab: what is really connected through yana-rt today. Connectors install here
// (`connector enable` with the scopes the user ticks; `connector disable` to remove). MCP servers show
// yana-rt's trust state; the guided "Connect an MCP server" flow is step 2 of Program L.

struct InstalledPlugins: View {
	@State private var connectors: [Connector]? = nil
	@State private var mcpState: String? = nil
	@State private var notice: (ok: Bool, text: String)? = nil
	@State private var installing: Connector? = nil

	private func installed(_ c: Connector) -> Bool { c.connectionState != "disabled" }

	var body: some View {
		VStack(alignment: .leading, spacing: 16) {
			if let notice { FBAlert(kind: notice.ok ? .success : .error, text: notice.text, closable: false) }
			Panel(title: L("store.connectors"), count: connectors?.count ?? 0) {
				if connectors == nil { Text(L("loading")).font(.fbBody).foregroundStyle(FB.textSecondary) }
				LazyVGrid(columns: [GridItem(.flexible(), spacing: 24), GridItem(.flexible(), spacing: 24)], alignment: .leading, spacing: 6) {
					ForEach(connectors ?? []) { connectorRow($0) }
				}
			}
			Panel(title: L("store.mcp")) {
				Text("\(L("store.mcpState")): \(mcpState ?? "…")").font(.fbBody).foregroundStyle(FB.text)
				Text(L("store.mcpNext")).font(.fbCaption).foregroundStyle(FB.textSecondary).fixedSize(horizontal: false, vertical: true)
			}
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

	private func connectorRow(_ c: Connector) -> some View {
		HStack(spacing: 12) {
			AppIconTile(name: StoreCategories.connectorName(c.name), size: 40)
			VStack(alignment: .leading, spacing: 2) {
				Text(StoreCategories.connectorName(c.name)).font(.fbBodyMedium).foregroundStyle(FB.text)
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
				FBButton(title: L("store.get"), variant: .primary, size: .small) { installing = c }
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
			Text("\(L("store.install")): \(StoreCategories.connectorName(connector.name))").font(.fbHeading5).foregroundStyle(FB.text)
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

extension StoreCategories {
	// yana-rt connector ids -> product names.
	static let connectorNames = ["gmail": "Gmail", "google-calendar": "Google Calendar", "github": "GitHub", "notion": "Notion",
	                             "google-drive": "Google Drive", "slack": "Slack", "figma": "Figma", "canva": "Canva"]
	static func connectorName(_ id: String) -> String { connectorNames[id] ?? FeedReader.prettify(id) }
}
