import Foundation
import Security
import SwiftUI

// App settings. The keys and meanings match Yana Studio IDE's `yana.*` settings (extensions/yana-agent
// package.json), so both layers mean the same thing; the app keeps its own copy in UserDefaults and never
// writes the IDE's settings file. API keys go to the macOS Keychain only, never to disk or argv; yana-rt
// receives them through stdin JSON, as its headless adapter requires.

enum ProviderKind { case local, cloud, custom }

struct ProviderInfo: Identifiable {
	let id: String
	let kind: ProviderKind
}

// The provider ids the IDE offers (yana.provider enum). Local ones run on this Mac and need no key.
let providerCatalog: [ProviderInfo] = {
	let local: Set<String> = ["ollama", "lmstudio", "llamacpp", "airllm", "turbofieldfare"]
	let ids = ["ollama", "lmstudio", "llamacpp", "airllm", "turbofieldfare", "anthropic", "openai", "gemini", "groq",
	           "deepseek", "openrouter", "xai", "novita", "nvidia", "minimax", "glm", "huggingface", "9router", "kimi", "custom"]
	return ids.map { ProviderInfo(id: $0, kind: $0 == "custom" ? .custom : local.contains($0) ? .local : .cloud) }
}()

final class AppSettings: ObservableObject {
	static let shared = AppSettings()
	private let store = UserDefaults.standard

	@Published var provider: String { didSet { store.set(provider, forKey: "yana.provider") } }
	@Published var model: String { didSet { store.set(model, forKey: "yana.model") } }
	@Published var baseURL: String { didSet { store.set(baseURL, forKey: "yana.baseUrl") } }
	@Published var maxTokens: String { didSet { store.set(maxTokens, forKey: "yana.chat.maxTokens") } }
	@Published var temperature: String { didSet { store.set(temperature, forKey: "yana.chat.temperature") } }
	@Published var runtimePath: String { didSet { store.set(runtimePath, forKey: "yana.runtimePath") } }
	// The Code-OSS checkout whose extensions/yana-agent has the app bridge (EditorLauncher.swift).
	@Published var ideCheckout: String { didSet { store.set(ideCheckout, forKey: "yana.ideCheckout") } }
	// What opens when Yana starts: "ask" (the start chooser), "Terminal" or "Chat".
	@Published var startPage: String { didSet { store.set(startPage, forKey: "yana.startPage") } }
	// Default project folder for chat, terminal and Yana Studio. Empty: the git repo Yana was started in.
	@Published var workspace: String { didSet { store.set(workspace, forKey: "yana.workspace") } }
	// Terminal: ⌥ sends Meta (Esc prefix) instead of typing accented letters. Off, like macOS Terminal.
	@Published var terminalOptionAsMeta: Bool { didSet { store.set(terminalOptionAsMeta, forKey: "yana.terminal.optionAsMeta") } }
	// Check crates.io and PyPI for newer yana-rt / yana-ai when Yana opens.
	@Published var checkUpdatesOnLaunch: Bool { didSet { store.set(checkUpdatesOnLaunch, forKey: "yana.updates.onLaunch") } }
	// New chats start in plan mode (look and plan only) instead of act mode.
	@Published var defaultPlanMode: Bool { didSet { store.set(defaultPlanMode, forKey: "yana.chat.defaultPlan") } }
	// Show "↑ in ↓ out tokens" under each reply.
	@Published var showTokens: Bool { didSet { store.set(showTokens, forKey: "yana.chat.showTokens") } }
	// Voice for "read aloud" (an NSSpeechSynthesizer voice id). Empty: the system voice.
	@Published var voice: String { didSet { store.set(voice, forKey: "yana.chat.voice") } }
	// Long-term memory across sessions (MemoryStore). Off by default: nothing is kept until the user turns it on.
	@Published var persistentMemory: Bool { didSet { store.set(persistentMemory, forKey: "yana.memory.enabled") } }
	// Folder for the daily memory backup (empty: no automatic backup), and when the last one ran.
	@Published var backupFolder: String { didSet { store.set(backupFolder, forKey: "yana.memory.backupFolder") } }
	var lastBackup: TimeInterval {
		get { store.double(forKey: "yana.memory.lastBackup") }
		set { store.set(newValue, forKey: "yana.memory.lastBackup") }
	}
	// Bumped when a key is saved or removed, so views that show key status refresh.
	@Published private(set) var keyVersion = 0

	private init() {
		provider = store.string(forKey: "yana.provider") ?? "ollama"
		model = store.string(forKey: "yana.model") ?? ""
		baseURL = store.string(forKey: "yana.baseUrl") ?? ""
		maxTokens = store.string(forKey: "yana.chat.maxTokens") ?? ""
		temperature = store.string(forKey: "yana.chat.temperature") ?? ""
		runtimePath = store.string(forKey: "yana.runtimePath") ?? ""
		ideCheckout = store.string(forKey: "yana.ideCheckout") ?? "\(NSHomeDirectory())/yana-ide-upstream/vscode"
		// A new install opens straight on the chat screen; the start chooser is opt-in from Settings.
		startPage = store.string(forKey: "yana.startPage") ?? "Chat"
		workspace = store.string(forKey: "yana.workspace") ?? ""
		terminalOptionAsMeta = store.bool(forKey: "yana.terminal.optionAsMeta")
		checkUpdatesOnLaunch = store.object(forKey: "yana.updates.onLaunch") as? Bool ?? true
		defaultPlanMode = store.bool(forKey: "yana.chat.defaultPlan")
		showTokens = store.object(forKey: "yana.chat.showTokens") as? Bool ?? true
		voice = store.string(forKey: "yana.chat.voice") ?? ""
		persistentMemory = store.bool(forKey: "yana.memory.enabled")
		backupFolder = store.string(forKey: "yana.memory.backupFolder") ?? ""
	}

	// Empty or invalid values mean "provider default"; yana-rt validates the ranges again (1-32000, 0-2).
	var maxTokensValue: Int? { Int(maxTokens.trimmingCharacters(in: .whitespaces)).flatMap { (1 ... 32000).contains($0) ? $0 : nil } }
	var temperatureValue: Double? { Double(temperature.trimmingCharacters(in: .whitespaces)).flatMap { (0 ... 2).contains($0) ? $0 : nil } }

	func hasKey(_ provider: String) -> Bool { Keychain.exists(provider) }
	func apiKey(_ provider: String) -> String? { Keychain.read(provider) }
	func saveKey(_ value: String, for provider: String) {
		let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
		guard !trimmed.isEmpty else { return }
		Keychain.write(trimmed, for: provider)
		keyVersion += 1
	}
	func removeKey(_ provider: String) {
		Keychain.delete(provider)
		keyVersion += 1
	}
}

// Generic-password items, one per provider, under one service name. Values never leave this process
// except in the stdin JSON of the yana-rt call that uses them.
enum Keychain {
	private static let service = "ai.yana.app.provider-key"

	private static func query(_ account: String) -> [String: Any] {
		[kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
	}

	static func read(_ account: String) -> String? {
		var q = query(account)
		q[kSecReturnData as String] = true
		q[kSecMatchLimit as String] = kSecMatchLimitOne
		var item: CFTypeRef?
		guard SecItemCopyMatching(q as CFDictionary, &item) == errSecSuccess, let data = item as? Data else { return nil }
		return String(data: data, encoding: .utf8)
	}

	// Whether a key is stored, without reading the secret. Asking only for attributes does not decrypt
	// the item, so it never brings up the "allow access to Keychain" password prompt; only actually
	// using a key (sending a chat) reads its value.
	static func exists(_ account: String) -> Bool {
		var q = query(account)
		q[kSecReturnAttributes as String] = true
		q[kSecMatchLimit as String] = kSecMatchLimitOne
		var item: CFTypeRef?
		return SecItemCopyMatching(q as CFDictionary, &item) == errSecSuccess
	}

	static func write(_ value: String, for account: String) {
		let data = Data(value.utf8)
		let status = SecItemUpdate(query(account) as CFDictionary, [kSecValueData as String: data] as CFDictionary)
		if status == errSecItemNotFound {
			var q = query(account)
			q[kSecValueData as String] = data
			q[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlocked
			SecItemAdd(q as CFDictionary, nil)
		}
	}

	static func delete(_ account: String) { SecItemDelete(query(account) as CFDictionary) }
}
