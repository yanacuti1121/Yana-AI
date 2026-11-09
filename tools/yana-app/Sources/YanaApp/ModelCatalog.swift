import Foundation

// The models the user can actually use, asked from each provider with the user's own key:
//   - cloud providers with a key saved in the Keychain: GET <provider>/models
//   - a custom endpoint with a base URL set
//   - local servers that are running right now (Ollama, LM Studio, llama.cpp)
// Nothing is listed from a built-in guess. Endpoints, parsing, the non-chat filter and the error wording
// mirror Yana Studio's own discovery (extensions/yana-agent/host/model-discovery.cjs), so the chat bar
// here and Studio's "Models & Runtime" show the same list for the same key.
// A key is only ever sent to the provider it belongs to, in a header (never in a URL); redirects are
// refused so a key can never follow one to another host.

struct ProviderModels: Identifiable {
	enum State: Equatable { case loading, ready, failed(String), manual }
	let provider: String
	var models: [String] = []
	var state: State = .loading
	var id: String { provider }
}

@MainActor
final class ModelCatalog: ObservableObject {
	@Published private(set) var groups: [ProviderModels] = []
	@Published private(set) var loadedAt: Date? = nil
	private var loading = false

	nonisolated private static let timeout: TimeInterval = 10
	nonisolated private static let localTimeout: TimeInterval = 1.5
	nonisolated private static let maxModels = 500
	nonisolated private static let maxBytes = 4_000_000

	private enum Auth: Sendable { case bearer, anthropic, google, none }
	private struct Endpoint: Sendable { let url: String; let auth: Auth }

	// Same table as Yana Studio's CLOUD_ADAPTERS (model-discovery.cjs).
	nonisolated private static let cloud: [String: Endpoint] = [
		"openai": .init(url: "https://api.openai.com/v1/models", auth: .bearer),
		"groq": .init(url: "https://api.groq.com/openai/v1/models", auth: .bearer),
		"deepseek": .init(url: "https://api.deepseek.com/models", auth: .bearer),
		"openrouter": .init(url: "https://openrouter.ai/api/v1/models", auth: .bearer),
		"xai": .init(url: "https://api.x.ai/v1/language-models", auth: .bearer),
		"novita": .init(url: "https://api.novita.ai/openai/v1/models", auth: .bearer),
		"nvidia": .init(url: "https://integrate.api.nvidia.com/v1/models", auth: .bearer),
		"minimax": .init(url: "https://api.minimaxi.com/v1/models", auth: .bearer),
		"glm": .init(url: "https://open.bigmodel.cn/api/paas/v4/models", auth: .bearer),
		"huggingface": .init(url: "https://router.huggingface.co/v1/models", auth: .bearer),
		"kimi": .init(url: "https://api.moonshot.ai/v1/models", auth: .bearer),
		"anthropic": .init(url: "https://api.anthropic.com/v1/models?limit=1000", auth: .anthropic),
		"gemini": .init(url: "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000", auth: .google),
	]
	nonisolated private static let local: [String: String] = [
		"ollama": "http://127.0.0.1:11434/api/tags",
		"lmstudio": "http://127.0.0.1:1234/v1/models",
		"llamacpp": "http://127.0.0.1:8080/v1/models",
	]

	func refreshIfStale() {
		guard loadedAt == nil || Date().timeIntervalSince(loadedAt!) > 300 else { return }
		refresh()
	}

	func refresh() {
		guard !loading else { return }
		loading = true
		let settings = AppSettings.shared
		var plan: [(String, Endpoint?, String?)] = [] // provider, endpoint, key
		for info in providerCatalog where info.kind == .cloud && settings.hasKey(info.id) {
			plan.append((info.id, Self.cloud[info.id], settings.apiKey(info.id)))
		}
		let base = settings.baseURL.trimmingCharacters(in: .whitespaces)
		if !base.isEmpty {
			let url = base.hasSuffix("/chat/completions")
				? String(base.dropLast("/chat/completions".count)) + "/models"
				: base.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + "/models"
			plan.append(("custom", Endpoint(url: url, auth: .bearer), settings.apiKey("custom")))
		}
		groups = plan.map { ProviderModels(provider: $0.0, state: $0.1 == nil ? .manual : .loading) }
		Task {
			async let locals = Self.probeLocals()
			let cloudResults = await withTaskGroup(of: (String, ProviderModels.State, [String]).self) { group in
				for (provider, endpoint, key) in plan {
					guard let endpoint else { continue }
					group.addTask { await Self.fetch(provider, endpoint, key) }
				}
				var all: [(String, ProviderModels.State, [String])] = []
				for await result in group { all.append(result) }
				return all
			}
			for (provider, state, models) in cloudResults {
				if let index = groups.firstIndex(where: { $0.provider == provider }) {
					groups[index].state = state
					groups[index].models = models
				}
			}
			groups.insert(contentsOf: await locals, at: 0)
			loadedAt = Date()
			loading = false
		}
	}

	nonisolated private static func probeLocals() async -> [ProviderModels] {
		var found: [ProviderModels] = []
		for (provider, url) in local.sorted(by: { $0.key < $1.key }) {
			let (_, state, models) = await fetch(provider, Endpoint(url: url, auth: .none), nil, timeout: localTimeout)
			if state == .ready, !models.isEmpty { found.append(ProviderModels(provider: provider, models: models, state: .ready)) }
		}
		return found
	}

	nonisolated private static func fetch(_ provider: String, _ endpoint: Endpoint, _ key: String?,
	                                      timeout: TimeInterval = timeout) async -> (String, ProviderModels.State, [String]) {
		guard let url = URL(string: endpoint.url), ["https", "http"].contains(url.scheme) else {
			return (provider, .failed("bad URL"), [])
		}
		var request = URLRequest(url: url, timeoutInterval: timeout)
		request.setValue("application/json", forHTTPHeaderField: "Accept")
		if let key, !key.isEmpty {
			switch endpoint.auth {
			case .bearer: request.setValue("Bearer \(key)", forHTTPHeaderField: "Authorization")
			case .anthropic:
				request.setValue(key, forHTTPHeaderField: "x-api-key")
				request.setValue("2023-06-01", forHTTPHeaderField: "anthropic-version")
			case .google: request.setValue(key, forHTTPHeaderField: "x-goog-api-key")
			case .none: break
			}
		}
		do {
			let (data, response) = try await session.data(for: request)
			let status = (response as? HTTPURLResponse)?.statusCode ?? 0
			guard (200 ..< 300).contains(status) else { return (provider, .failed(reason(status)), []) }
			guard data.count <= maxBytes else { return (provider, .failed(L("model.errTooLarge")), []) }
			return (provider, .ready, parse(data))
		} catch {
			return (provider, .failed(L("model.errUnreachable")), [])
		}
	}

	// Same wording as Studio's discovery errors.
	nonisolated private static func reason(_ status: Int) -> String {
		switch status {
		case 400: return L("model.err400")
		case 401: return L("model.err401")
		case 403: return L("model.err403")
		case 404: return L("model.err404")
		case 429: return L("model.err429")
		default: return "HTTP \(status)"
		}
	}

	// Refuses every redirect, so a key sent to a provider never follows one to another host.
	private final class NoRedirect: NSObject, URLSessionTaskDelegate {
		func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
		                newRequest request: URLRequest) async -> URLRequest? { nil }
	}
	nonisolated private static let session = URLSession(configuration: .ephemeral, delegate: NoRedirect(), delegateQueue: nil)

	// Embedding, rerank, speech and image models cannot chat; Studio drops them too.
	nonisolated private static let nonChat = try? NSRegularExpression(
		pattern: "(?:^|[-_/])(embedding|embed|rerank|moderation|whisper|transcri|tts|speech|audio|image|dall-e)(?:[-_/]|$)",
		options: [.caseInsensitive])

	nonisolated private static func isChatModel(_ name: String) -> Bool {
		guard name.count < 200, !name.contains(where: { $0 == "\r" || $0 == "\n" || $0 == "\0" }) else { return false }
		let range = NSRange(name.startIndex..., in: name)
		return nonChat?.firstMatch(in: name, range: range) == nil
	}

	// OpenAI-style {"data":[{"id"}]} (Anthropic the same), Gemini {"models":[{"name":"models/x"}]},
	// xAI {"models":[{"id"}]}, Ollama {"models":[{"name"}]}. Gemini entries that cannot generate text
	// and non-chat models are dropped.
	nonisolated private static func parse(_ data: Data) -> [String] {
		guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return [] }
		var names: [String] = []
		if let items = json["data"] as? [[String: Any]] {
			names = items.compactMap { $0["id"] as? String }
		} else if let items = json["models"] as? [[String: Any]] {
			names = items.compactMap { item in
				if let methods = item["supportedGenerationMethods"] as? [String], !methods.contains("generateContent") { return nil }
				let raw = (item["name"] as? String) ?? (item["id"] as? String)
				return raw.map { $0.hasPrefix("models/") ? String($0.dropFirst(7)) : $0 }
			}
		}
		let clean = Set(names.map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty && isChatModel($0) })
		return clean.sorted { $0.localizedStandardCompare($1) == .orderedAscending }.prefix(maxModels).map { $0 }
	}
}
