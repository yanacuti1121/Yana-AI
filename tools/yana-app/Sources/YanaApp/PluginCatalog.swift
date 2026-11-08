import Foundation

// The plugin store's catalog: any number of public sources ("feeds"), read and merged, kept fresh
// (Program L, Phase 7 research, docs/programs/PROGRAM-L-UNIFIED-PLUGINS.md). Three kinds of feed:
//   marketplace  a Claude Code marketplace.json (the official one has 317 plugins, Apache-2.0, sha-pinned)
//   mcpRegistry  an MCP registry API (the official registry.modelcontextprotocol.io/v0.1, public, paged)
//   awesomeList  a Markdown list "- [Name](url) - text" under "## Category" headings (the ChatGPT apps list)
// Three built-in feeds; the user can add more in the store. Browsing only: nothing here runs third-party
// code. Only https, only the hosts of the configured feeds, no redirects; every registry page is read (no
// item cap, only a guard against a source that pages forever). Cached in Application Support so the store
// works offline; refreshed when older than six hours or on Refresh.

struct StoreFeed: Codable, Identifiable, Hashable {
	enum Kind: String, Codable, CaseIterable { case marketplace, mcpRegistry, awesomeList }
	var id: String { url.absoluteString }
	let kind: Kind
	let url: URL
	let label: String
	var builtIn = false

	static let builtIns: [StoreFeed] = [
		StoreFeed(kind: .marketplace, url: URL(string: "https://raw.githubusercontent.com/anthropics/claude-plugins-official/main/.claude-plugin/marketplace.json")!, label: "Claude", builtIn: true),
		StoreFeed(kind: .mcpRegistry, url: URL(string: "https://registry.modelcontextprotocol.io/v0.1/servers")!, label: "MCP Registry", builtIn: true),
		StoreFeed(kind: .awesomeList, url: URL(string: "https://raw.githubusercontent.com/rdmgator12/awesome-chatgpt-apps/main/README.md")!, label: "ChatGPT", builtIn: true),
	]
}

struct StoreItem: Codable, Identifiable, Hashable {
	let id: String
	let feed: String        // StoreFeed.id
	let feedLabel: String
	let kind: StoreFeed.Kind
	let name: String
	let summary: String
	let category: String
	let author: String?
	let link: URL?
	let version: String?
	let pin: String?        // marketplace: git sha of the plugin source
	let parts: [String]     // marketplace: what it adds; MCP: how to connect (remote URL / package)
}

@MainActor
final class PluginCatalog: ObservableObject {
	static let shared = PluginCatalog()

	// Derived lists are built once per change of `items`, never per redraw (6,000+ entries).
	@Published private(set) var items: [StoreItem] = [] { didSet { reindex() } }
	private(set) var byFeed: [String: [StoreItem]] = [:]
	private(set) var categoriesByFeed: [String: [String]] = [:]   // feed id ("" = all) -> categories by count
	@Published private(set) var updated: Date?
	@Published private(set) var loading = false
	@Published private(set) var errors: [String] = []
	@Published private(set) var userFeeds: [StoreFeed] = []

	var feeds: [StoreFeed] { StoreFeed.builtIns + userFeeds }

	static let maxAge: TimeInterval = 6 * 60 * 60
	private static let feedsKey = "yana.store.feeds"

	init() {
		if let data = UserDefaults.standard.data(forKey: Self.feedsKey),
		   let saved = try? JSONDecoder().decode([StoreFeed].self, from: data) {
			userFeeds = saved
		}
	}

	// MARK: feeds the user adds

	func addFeed(kind: StoreFeed.Kind, urlText: String, label: String) -> String? {
		guard let url = URL(string: urlText.trimmingCharacters(in: .whitespaces)), url.scheme == "https", url.host != nil else {
			return L("store.feedBadURL")
		}
		guard !feeds.contains(where: { $0.url == url }) else { return L("store.feedExists") }
		let name = label.trimmingCharacters(in: .whitespaces)
		userFeeds.append(StoreFeed(kind: kind, url: url, label: name.isEmpty ? (url.host ?? "feed") : String(name.prefix(40))))
		saveFeeds()
		return nil
	}

	func removeFeed(_ feed: StoreFeed) {
		userFeeds.removeAll { $0 == feed }
		items.removeAll { $0.feed == feed.id }
		saveFeeds()
		writeCache()
	}

	private func saveFeeds() {
		if let data = try? JSONEncoder().encode(userFeeds) { UserDefaults.standard.set(data, forKey: Self.feedsKey) }
	}

	// MARK: loading

	func loadIfNeeded() async {
		if items.isEmpty { readCache() }
		if updated.map({ Date().timeIntervalSince($0) > Self.maxAge }) ?? true { await refresh() }
	}

	// Marketplaces and lists load in parallel and replace their entries; registries fill in page by page,
	// and after the first full read only fetch what changed since the last one (`synced`).
	func refresh() async {
		guard !loading else { return }
		loading = true
		defer { loading = false }
		errors = []
		let feeds = self.feeds
		let hosts = Set(feeds.compactMap(\.url.host))
		await withTaskGroup(of: Void.self) { group in
			for feed in feeds {
				group.addTask { await self.refresh(feed, hosts: hosts) }
			}
		}
		updated = Date()
		writeCache()
	}

	private func refresh(_ feed: StoreFeed, hosts: Set<String>) async {
		let started = Date()
		if feed.kind == .mcpRegistry {
			let since = items.contains(where: { $0.feed == feed.id }) ? synced[feed.id] : nil
			do {
				let all = try await FeedReader.readRegistry(feed, hosts, since: since) { page in
					await MainActor.run { self.merge(page) }
				}
				merge([], force: true) // show what is still held
				if since == nil { replace(feed, with: all) } // a full read also drops servers that left
				synced[feed.id] = started
			} catch {
				errors.append("\(feed.label): \(error.localizedDescription)")
			}
			return
		}
		switch await FeedReader.read(feed, allowedHosts: hosts) {
		case .success(let list): replace(feed, with: list)
		case .failure(let error): errors.append("\(feed.label): \(error.localizedDescription)") // cached entries stay
		}
	}

	// Pages arrive several times a second; they are held and shown at most every `publishInterval`, so the
	// store does not redraw thousands of entries on every page.
	private var pending: [StoreItem] = []
	private var lastPublish = Date.distantPast
	private static let publishInterval: TimeInterval = 2

	private func merge(_ page: [StoreItem], force: Bool = false) {
		pending += page
		guard !pending.isEmpty, force || Date().timeIntervalSince(lastPublish) >= Self.publishInterval else { return }
		var next = items
		var index = Dictionary(next.enumerated().map { ($1.id, $0) }, uniquingKeysWith: { first, _ in first })
		for item in pending {
			if let at = index[item.id] { next[at] = item } else { index[item.id] = next.count; next.append(item) }
		}
		pending = []
		lastPublish = Date()
		items = next // one publish, one reindex
	}

	private func reindex() {
		var feeds: [String: [StoreItem]] = [:]
		var counts: [String: [String: Int]] = [:]
		for item in items {
			feeds[item.feed, default: []].append(item)
			if item.category != "other" {
				counts[item.feed, default: [:]][item.category, default: 0] += 1
				counts["", default: [:]][item.category, default: 0] += 1
			}
		}
		byFeed = feeds
		categoriesByFeed = counts.mapValues { table in
			table.sorted { $0.value > $1.value || ($0.value == $1.value && $0.key < $1.key) }.map(\.key)
		}
	}

	private func replace(_ feed: StoreFeed, with list: [StoreItem]) {
		var seen = Set<String>()
		items = items.filter { $0.feed != feed.id } + list.filter { seen.insert($0.id).inserted }
	}

	// Registry feed id -> when its last read started (for `updated_since`).
	private var synced: [String: Date] = [:]

	// MARK: cache

	private struct Cache: Codable { let updated: Date; let items: [StoreItem]; var synced: [String: Date]? }

	private var cacheURL: URL {
		FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
			.appendingPathComponent("YanaApp/plugin-catalog.json")
	}

	private func readCache() {
		guard let data = try? Data(contentsOf: cacheURL) else { return }
		let decoder = JSONDecoder()
		decoder.dateDecodingStrategy = .iso8601
		guard let cache = try? decoder.decode(Cache.self, from: data) else { return }
		items = cache.items
		updated = cache.updated
		synced = cache.synced ?? [:]
	}

	private func writeCache() {
		let encoder = JSONEncoder()
		encoder.dateEncodingStrategy = .iso8601
		do {
			try FileManager.default.createDirectory(at: cacheURL.deletingLastPathComponent(), withIntermediateDirectories: true)
			try encoder.encode(Cache(updated: updated ?? Date(), items: items, synced: synced)).write(to: cacheURL, options: .atomic)
		} catch {
			errors.append("cache: \(error.localizedDescription)")
		}
	}
}
