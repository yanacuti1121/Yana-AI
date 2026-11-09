import Foundation

// Past chats, kept on this Mac in ~/Library/Application Support/YanaApp/chats/<session id>.json so a new
// chat never loses the old one and any chat can be reopened from "Recent". Text, errors and token counts are
// kept; image thumbnails are not (the text says which files were attached). A reopened chat keeps its yana-rt
// session id, so its receipts and history stay together.

struct SavedLine: Codable, Equatable {
	let user: Bool
	let text: String
	var error: String?
	var inputTokens = 0
	var outputTokens = 0
}

struct SavedChat: Codable, Identifiable, Equatable {
	let id: String              // yana-rt session id
	var title: String
	var updated: Date
	var provider: String
	var model: String?
	var lines: [SavedLine]
}

@MainActor
final class ChatHistoryStore: ObservableObject {
	static let shared = ChatHistoryStore()

	@Published private(set) var chats: [SavedChat] = []   // newest first
	@Published private(set) var lastError: String?
	static let titleChars = 60
	static let maxChats = 500                              // oldest beyond this are removed

	let folder: URL

	// YANA_HISTORY_DIR points the store at another folder (to check the sidebar without touching real chats).
	init(folder: URL? = nil) {
		let override = ProcessInfo.processInfo.environment["YANA_HISTORY_DIR"].map { URL(fileURLWithPath: $0, isDirectory: true) }
		self.folder = folder ?? override ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
			.appendingPathComponent("YanaApp/chats", isDirectory: true)
		loadAll()
	}

	func save(_ chat: SavedChat) {
		guard !chat.lines.isEmpty, Self.validID(chat.id) else { return }
		do {
			try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
			try encoder.encode(chat).write(to: url(chat.id), options: .atomic)
		} catch {
			lastError = "\(L("history.saveFailed")): \(error.localizedDescription)"
			return
		}
		chats.removeAll { $0.id == chat.id }
		chats.insert(chat, at: 0)
		trim()
	}

	func chat(_ id: String) -> SavedChat? { chats.first { $0.id == id } }

	func delete(_ id: String) {
		guard Self.validID(id) else { return }
		try? FileManager.default.removeItem(at: url(id))
		chats.removeAll { $0.id == id }
	}

	// A session id is a UUID or a plain id; never a path.
	static func validID(_ id: String) -> Bool {
		!id.isEmpty && id.count <= 128 && id.allSatisfy { $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "-" || $0 == "_") }
	}

	private func url(_ id: String) -> URL { folder.appendingPathComponent("\(id).json") }

	private func trim() {
		guard chats.count > Self.maxChats else { return }
		for old in chats.suffix(from: Self.maxChats) { try? FileManager.default.removeItem(at: url(old.id)) }
		chats = Array(chats.prefix(Self.maxChats))
	}

	private func loadAll() {
		let files = (try? FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil)) ?? []
		let decoder = JSONDecoder()
		decoder.dateDecodingStrategy = .iso8601
		var loaded: [SavedChat] = []
		var broken = 0
		for file in files where file.pathExtension == "json" {
			if let data = try? Data(contentsOf: file), let chat = try? decoder.decode(SavedChat.self, from: data) {
				loaded.append(chat)
			} else {
				broken += 1
			}
		}
		chats = loaded.sorted { $0.updated > $1.updated }
		if broken > 0 { lastError = String(format: L("history.broken"), broken) }
	}

	private var encoder: JSONEncoder {
		let encoder = JSONEncoder()
		encoder.dateEncodingStrategy = .iso8601
		return encoder
	}
}
