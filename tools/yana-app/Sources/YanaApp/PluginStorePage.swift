import SwiftUI

// The plugin store, App Store style (Program L). Discover browses the live catalogs (PluginCatalog: Claude
// marketplace, MCP registry, ChatGPT list, plus any source the user adds), with a featured band, shelves by
// source and category, search, and filters. Installed lists what is really connected through yana-rt
// (connectors, MCP trust state). Sources manages where the catalog comes from.

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
	enum Tab: String, CaseIterable { case discover, installed, sources }
	@ObservedObject private var catalog = PluginCatalog.shared
	@State private var tab: Tab = .discover
	@State private var query = ""
	@State private var source: String? = nil      // StoreFeed.id
	@State private var category: String? = nil
	@State private var limit = Self.pageStep
	@State private var detail: StoreItem? = nil
	private static let pageStep = 60
	private static let shelfSize = 20

	private var filtered: [StoreItem] {
		let q = query.trimmingCharacters(in: .whitespaces).lowercased()
		return catalog.items.filter { item in
			(source == nil || item.feed == source) && (category == nil || item.category == category)
				&& (q.isEmpty || item.name.lowercased().contains(q) || item.summary.lowercased().contains(q)
					|| (item.author?.lowercased().contains(q) ?? false))
		}
	}

	private var browsing: Bool { query.isEmpty && source == nil && category == nil }

	var body: some View {
		ScrollView {
			VStack(alignment: .leading, spacing: 18) {
				header
				switch tab {
				case .discover: discover
				case .installed: InstalledPlugins()
				case .sources: StoreSourcesView(catalog: catalog)
				}
			}
			.padding(EdgeInsets(top: 8, leading: 28, bottom: 28, trailing: 28))
			.frame(maxWidth: .infinity, alignment: .topLeading)
		}
		.task { await catalog.loadIfNeeded() }
		.sheet(item: $detail) { item in StoreDetailSheet(item: item) { detail = nil } }
	}

	private var header: some View {
		VStack(alignment: .leading, spacing: 12) {
			HStack(alignment: .firstTextBaseline) {
				Text(L("nav.Plugins")).font(.system(size: 30, weight: .bold)).foregroundStyle(FB.text)
				Spacer()
				Text(status).font(.fbCaption).foregroundStyle(FB.textSecondary)
				FBIconButton(icon: "refresh", variant: .secondary, size: .small, tooltip: L("store.refresh")) { Task { await catalog.refresh() } }
					.disabled(catalog.loading)
			}
			HStack(spacing: 6) {
				ForEach(Tab.allCases, id: \.self) { item in
					pill(L("store.tab.\(item.rawValue)"), active: tab == item) { tab = item }
				}
				Spacer()
				if tab == .discover {
					TextField(L("store.search"), text: $query)
						.textFieldStyle(.plain).font(.fbBody)
						.padding(.horizontal, 14).frame(width: 320, height: 34)
						.background(Capsule().fill(FB.surfaceSecondary))
						.overlay(Capsule().stroke(FB.divider, lineWidth: 1))
						.onChange(of: query) { _, _ in limit = Self.pageStep }
				}
			}
			if !catalog.errors.isEmpty {
				FBAlert(kind: .warning, text: "\(L("store.someFailed")): \(catalog.errors.joined(separator: " · "))", closable: false)
			}
		}
	}

	private var status: String {
		if catalog.loading { return "\(L("store.updating")) · \(catalog.items.count)" }
		guard let updated = catalog.updated else { return "" }
		return String(format: L("store.status"), catalog.items.count, catalog.feeds.count, updated.formatted(date: .omitted, time: .shortened))
	}

	// MARK: discover

	@ViewBuilder
	private var discover: some View {
		filters
		if catalog.items.isEmpty {
			Text(catalog.loading ? L("loading") : L("store.empty")).font(.fbBody).foregroundStyle(FB.textSecondary).padding(.top, 40)
		} else if browsing {
			featured
			ForEach(catalog.feeds) { feed in
				let list = catalog.items.filter { $0.feed == feed.id }
				if !list.isEmpty {
					StoreShelf(title: String(format: L("store.shelfFrom"), feed.label, list.count), items: Array(list.prefix(Self.shelfSize)),
					           seeAll: { source = feed.id }) { detail = $0 }
				}
			}
			ForEach(topCategories(in: catalog.items.filter { $0.kind == .marketplace }, count: 3), id: \.self) { cat in
				let list = catalog.items.filter { $0.kind == .marketplace && $0.category == cat }
				StoreShelf(title: StoreCategories.label(cat), items: Array(list.prefix(Self.shelfSize)), seeAll: { category = cat }) { detail = $0 }
			}
		} else {
			let list = filtered
			Text(String(format: L("store.results"), list.count)).font(.fbBodyMedium).foregroundStyle(FB.textSecondary)
			LazyVGrid(columns: [GridItem(.adaptive(minimum: 320), spacing: 12)], spacing: 12) {
				ForEach(list.prefix(limit)) { item in StoreCard(item: item) { detail = item } }
			}
			if list.count > limit {
				HStack { Spacer(); FBButton(title: L("store.more"), variant: .secondary) { limit += Self.pageStep }; Spacer() }
			}
		}
	}

	private var filters: some View {
		VStack(alignment: .leading, spacing: 8) {
			ScrollView(.horizontal, showsIndicators: false) {
				HStack(spacing: 6) {
					pill(L("store.allSources"), active: source == nil) { source = nil; limit = Self.pageStep }
					ForEach(catalog.feeds) { feed in pill(feed.label, active: source == feed.id) { source = feed.id; category = nil; limit = Self.pageStep } }
				}
			}
			ScrollView(.horizontal, showsIndicators: false) {
				HStack(spacing: 6) {
					pill(L("store.allCategories"), active: category == nil) { category = nil; limit = Self.pageStep }
					let pool = catalog.items.filter { source == nil || $0.feed == source }
					ForEach(topCategories(in: pool, count: 16), id: \.self) { cat in
						pill(StoreCategories.label(cat), active: category == cat) { category = cat; limit = Self.pageStep }
					}
				}
			}
		}
	}

	private var featured: some View {
		ScrollView(.horizontal, showsIndicators: false) {
			HStack(spacing: 14) {
				ForEach(featuredItems, id: \.item.id) { entry in
					FeaturedCard(item: entry.item, eyebrow: entry.eyebrow) { detail = entry.item }
				}
			}
		}
	}

	// One pick per source, changing daily, from entries with a description.
	private var featuredItems: [(item: StoreItem, eyebrow: String)] {
		let day = Calendar.current.ordinality(of: .day, in: .year, for: Date()) ?? 0
		return catalog.feeds.compactMap { feed in
			let list = catalog.items.filter { $0.feed == feed.id && $0.summary.count > 20 }
			guard !list.isEmpty else { return nil }
			return (list[day % list.count], String(format: L("store.featuredFrom"), feed.label))
		}
	}

	private func topCategories(in items: [StoreItem], count: Int) -> [String] {
		var counts: [String: Int] = [:]
		for item in items where item.category != "other" { counts[item.category, default: 0] += 1 }
		return counts.sorted { $0.value > $1.value || ($0.value == $1.value && $0.key < $1.key) }.prefix(count).map(\.key)
	}

	private func pill(_ title: String, active: Bool, action: @escaping () -> Void) -> some View {
		Text(title).font(.fbBodyMedium).foregroundStyle(active ? FB.onPrimary : FB.text)
			.padding(.horizontal, 14).frame(height: 30)
			.background(Capsule().fill(active ? FB.primary : FB.surfaceTertiary))
			.contentShape(Capsule())
			.onTapGesture(perform: action)
	}
}
