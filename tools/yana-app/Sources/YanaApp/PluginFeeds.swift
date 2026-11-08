import Foundation

// Reads one store feed (PluginCatalog.swift) into StoreItems. Network rules: https only, only hosts of the
// configured feeds, redirects refused, at most 8 MiB per response, 20 s per request. MCP registries are read
// page by page until there is no next cursor; the page guard only stops a source that pages forever.

enum FeedReader {
	static let maxBytes = 8 * 1024 * 1024
	static let pageSize = 100
	static let pageGuard = 2_000           // 200,000 entries: far above any real registry, stops a loop
	private static let timeout: TimeInterval = 20

	enum FetchError: LocalizedError {
		case host, status(Int), size, format
		var errorDescription: String? {
			switch self {
			case .host: return "host not allowed"
			case .status(let code): return "HTTP \(code)"
			case .size: return "response too large"
			case .format: return "unexpected format"
			}
		}
	}

	private final class NoRedirect: NSObject, URLSessionTaskDelegate {
		func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
		                newRequest request: URLRequest) async -> URLRequest? { nil }
	}
	private static let session = URLSession(configuration: .ephemeral, delegate: NoRedirect(), delegateQueue: nil)

	static func read(_ feed: StoreFeed, allowedHosts: Set<String>) async -> Result<[StoreItem], Error> {
		do {
			switch feed.kind {
			case .marketplace: return .success(try parseMarketplace(try await get(feed.url, allowedHosts), feed: feed))
			case .awesomeList: return .success(parseAwesomeList(String(decoding: try await get(feed.url, allowedHosts), as: UTF8.self), feed: feed))
			case .mcpRegistry: return .success(try await readRegistry(feed, allowedHosts, since: nil) { _ in })
			}
		} catch {
			return .failure(error)
		}
	}

	static func get(_ url: URL, _ allowedHosts: Set<String>) async throws -> Data {
		guard url.scheme == "https", let host = url.host, allowedHosts.contains(host) else { throw FetchError.host }
		var request = URLRequest(url: url, timeoutInterval: timeout)
		request.setValue("yana-app-plugin-store", forHTTPHeaderField: "User-Agent")
		let (data, response) = try await session.data(for: request)
		let status = (response as? HTTPURLResponse)?.statusCode ?? 0
		guard status == 200 else { throw FetchError.status(status) }
		guard data.count <= maxBytes else { throw FetchError.size }
		return data
	}

	// MARK: Claude Code marketplace.json

	static func parseMarketplace(_ data: Data, feed: StoreFeed) throws -> [StoreItem] {
		guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
		      let plugins = json["plugins"] as? [[String: Any]] else { throw FetchError.format }
		return plugins.compactMap { p in
			guard let name = p["name"] as? String, !name.isEmpty else { return nil }
			let source = p["source"] as? [String: Any]
			var parts: [String] = []
			if let skills = p["skills"] as? [Any], !skills.isEmpty { parts.append("skills: \(skills.count)") }
			if p["lspServers"] != nil { parts.append("LSP") }
			if let url = source?["url"] as? String { parts.append(url) } else if let path = p["source"] as? String { parts.append(path) }
			let link = (p["homepage"] as? String).flatMap(URL.init(string:)).flatMap { $0.scheme == "https" ? $0 : nil }
			return StoreItem(id: "\(feed.id)#\(name)", feed: feed.id, feedLabel: feed.label, kind: .marketplace,
			                 name: (p["displayName"] as? String) ?? prettify(name),
			                 summary: (p["description"] as? String) ?? "", category: (p["category"] as? String) ?? "other",
			                 author: (p["author"] as? [String: Any])?["name"] as? String, link: link,
			                 version: p["version"] as? String, pin: source?["sha"] as? String, parts: parts)
		}
	}

	// MARK: MCP registry (v0.1 shape: { servers: [{ server, _meta }], metadata: { nextCursor } })

	// Every page of the latest versions (`version=latest`), or only what changed since `since`
	// (`updated_since`). Each page is handed to `onPage` as it arrives so the store fills in while it loads.
	static func readRegistry(_ feed: StoreFeed, _ allowedHosts: Set<String>, since: Date?,
	                         onPage: ([StoreItem]) async -> Void) async throws -> [StoreItem] {
		var all: [StoreItem] = []
		var cursor: String?
		let stamp = since.map { ISO8601DateFormatter().string(from: $0) }
		for _ in 0 ..< pageGuard {
			var parts = URLComponents(url: feed.url, resolvingAgainstBaseURL: false)
			var query = [URLQueryItem(name: "limit", value: String(pageSize)), URLQueryItem(name: "version", value: "latest")]
			if let stamp { query.append(URLQueryItem(name: "updated_since", value: stamp)) }
			if let cursor { query.append(URLQueryItem(name: "cursor", value: cursor)) }
			parts?.queryItems = query
			guard let url = parts?.url else { throw FetchError.format }
			let page = try parseRegistryPage(try await get(url, allowedHosts), feed: feed)
			all += page.items
			await onPage(page.items)
			guard let next = page.next, !next.isEmpty, next != cursor else { break }
			cursor = next
		}
		var seen = Set<String>()
		return all.filter { seen.insert($0.id).inserted }
	}

	static func parseRegistryPage(_ data: Data, feed: StoreFeed) throws -> (items: [StoreItem], next: String?) {
		guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
		      let servers = json["servers"] as? [[String: Any]] else { throw FetchError.format }
		let items: [StoreItem] = servers.compactMap { entry in
			guard let s = entry["server"] as? [String: Any], let name = s["name"] as? String else { return nil }
			let official = (entry["_meta"] as? [String: Any])?["io.modelcontextprotocol.registry/official"] as? [String: Any]
			if (official?["status"] as? String).map({ $0 != "active" }) ?? false { return nil }
			var parts: [String] = []
			for remote in (s["remotes"] as? [[String: Any]]) ?? [] {
				if let url = remote["url"] as? String { parts.append("\(remote["type"] as? String ?? "remote"): \(url)") }
			}
			for package in (s["packages"] as? [[String: Any]]) ?? [] {
				if let id = package["identifier"] as? String { parts.append("\(package["registryType"] as? String ?? "package"): \(id)") }
			}
			let website = (s["websiteUrl"] as? String) ?? ((s["repository"] as? [String: Any])?["url"] as? String)
			let link = website.flatMap(URL.init(string:)).flatMap { $0.scheme == "https" ? $0 : nil }
			let owner = name.split(separator: "/").first.map(String.init)
			return StoreItem(id: "\(feed.id)#\(name)", feed: feed.id, feedLabel: feed.label, kind: .mcpRegistry,
			                 name: (s["title"] as? String) ?? prettify(String(name.split(separator: "/").last ?? Substring(name))),
			                 summary: (s["description"] as? String) ?? "", category: "mcp", author: owner, link: link,
			                 version: s["version"] as? String, pin: (official?["isLatest"] as? Bool) == true ? "latest" : nil, parts: parts)
		}
		return (items, (json["metadata"] as? [String: Any])?["nextCursor"] as? String)
	}

	// MARK: awesome-style Markdown list

	static func parseAwesomeList(_ text: String, feed: StoreFeed) -> [StoreItem] {
		var category = "other"
		var items: [StoreItem] = []
		let pattern = try! NSRegularExpression(pattern: #"^- \[([^\]]{1,120})\]\((https://[^)\s]{1,300})\)\s*[-–]\s*(.{0,400})$"#)
		for raw in text.split(separator: "\n", omittingEmptySubsequences: true) {
			let line = String(raw).trimmingCharacters(in: .whitespaces)
			if line.hasPrefix("## ") {
				let heading = String(line.dropFirst(3)).trimmingCharacters(in: .whitespaces)
				category = heading.lowercased() == "contents" ? "other" : heading
				continue
			}
			let range = NSRange(line.startIndex..., in: line)
			guard category != "other", let match = pattern.firstMatch(in: line, range: range),
			      let nameRange = Range(match.range(at: 1), in: line), let urlRange = Range(match.range(at: 2), in: line),
			      let textRange = Range(match.range(at: 3), in: line) else { continue }
			let name = String(line[nameRange])
			let summary = String(line[textRange]).replacingOccurrences(of: "*", with: "")
			items.append(StoreItem(id: "\(feed.id)#\(name.lowercased())", feed: feed.id, feedLabel: feed.label, kind: .awesomeList,
			                       name: name, summary: summary, category: category, author: nil,
			                       link: URL(string: String(line[urlRange])), version: nil, pin: nil, parts: []))
		}
		return items
	}

	// "agent-sdk-dev" -> "Agent Sdk Dev"
	static func prettify(_ name: String) -> String {
		name.split(whereSeparator: { $0 == "-" || $0 == "_" }).map { $0.prefix(1).uppercased() + $0.dropFirst() }.joined(separator: " ")
	}
}
