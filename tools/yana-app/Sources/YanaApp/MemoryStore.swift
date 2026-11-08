import Foundation

// Long-term memory across sessions, off by default (Settings > Memory). Only on this Mac, in
// ~/Library/Application Support/YanaApp/memory/: memories.json (short facts the user approved), and a
// file library (library.json + library/<id>.txt, the full text read from files the user dropped in).
// Nothing is remembered without the user: Yana proposes a memory, the user taps Remember. Before each
// message, the memories and the library passages closest to the message are added to the system prompt.
// Users can export, back up, restore, and delete everything.

struct Memory: Codable, Identifiable, Equatable {
	var id = UUID()
	var text: String
	var created = Date()
}

struct LibraryItem: Codable, Identifiable, Equatable {
	var id = UUID()
	var name: String
	var added = Date()
	var chars: Int
}

@MainActor
final class MemoryStore: ObservableObject {
	static let shared = MemoryStore()

	@Published private(set) var memories: [Memory] = []
	@Published private(set) var library: [LibraryItem] = []
	@Published private(set) var lastError: String?

	static let maxMemoryChars = 500       // one memory is a short fact, not a document
	static let contextMemoryChars = 4_000 // memories added to one message
	static let contextLibraryChars = 6_000
	private static let chunkChars = 900
	private static let maxChunks = 5
	static let keptBackups = 7

	let folder: URL
	private var libraryFolder: URL { folder.appendingPathComponent("library", isDirectory: true) }
	private var memoriesFile: URL { folder.appendingPathComponent("memories.json") }
	private var libraryFile: URL { folder.appendingPathComponent("library.json") }

	init(folder: URL? = nil) {
		self.folder = folder ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
			.appendingPathComponent("YanaApp/memory", isDirectory: true)
		load()
	}

	var enabled: Bool { AppSettings.shared.persistentMemory }

	// MARK: memories

	func remember(_ text: String) {
		let clean = String(text.trimmingCharacters(in: .whitespacesAndNewlines).prefix(Self.maxMemoryChars))
		guard !clean.isEmpty, !memories.contains(where: { $0.text.caseInsensitiveCompare(clean) == .orderedSame }) else { return }
		memories.insert(Memory(text: clean), at: 0)
		save()
	}

	func forget(_ id: UUID) {
		memories.removeAll { $0.id == id }
		save()
	}

	// MARK: file library

	// Keeps the full text of documents sent in a chat (only while memory is on). Same name and size = same file.
	func keep(_ documents: [ChatDocument]) {
		guard enabled else { return }
		for doc in documents where !doc.text.isEmpty {
			if library.contains(where: { $0.name == doc.name && $0.chars == doc.text.count }) { continue }
			let item = LibraryItem(name: doc.name, chars: doc.text.count)
			do {
				try FileManager.default.createDirectory(at: libraryFolder, withIntermediateDirectories: true)
				try doc.text.write(to: textURL(item.id), atomically: true, encoding: .utf8)
				library.insert(item, at: 0)
			} catch {
				lastError = "\(L("mem.saveFailed")) \(doc.name): \(error.localizedDescription)"
			}
		}
		save()
	}

	func removeItem(_ id: UUID) {
		try? FileManager.default.removeItem(at: textURL(id))
		library.removeAll { $0.id == id }
		save()
	}

	func text(of item: LibraryItem) -> String {
		(try? String(contentsOf: textURL(item.id), encoding: .utf8)) ?? ""
	}

	func clearAll() {
		memories = []
		library = []
		try? FileManager.default.removeItem(at: libraryFolder)
		save()
	}

	private func textURL(_ id: UUID) -> URL { libraryFolder.appendingPathComponent("\(id.uuidString).txt") }

	// MARK: context for a message

	// Memories (newest first) and the library passages sharing the most words with the message.
	func context(for message: String) -> (text: String, memories: Int, passages: Int)? {
		guard enabled, !(memories.isEmpty && library.isEmpty) else { return nil }
		var parts: [String] = []
		var used = 0, budget = Self.contextMemoryChars
		var facts: [String] = []
		for memory in memories where memory.text.count <= budget {
			facts.append("- \(memory.text)")
			budget -= memory.text.count
			used += 1
		}
		if !facts.isEmpty { parts.append("What the user asked you to remember:\n" + facts.joined(separator: "\n")) }
		let passages = bestPassages(for: message)
		if !passages.isEmpty {
			parts.append("Passages from the user's saved files (cite the file name when you use one):\n\n" + passages.joined(separator: "\n\n"))
		}
		guard !parts.isEmpty else { return nil }
		return (parts.joined(separator: "\n\n"), used, passages.count)
	}

	private func bestPassages(for message: String) -> [String] {
		let words = Set(message.lowercased().split { !$0.isLetter && !$0.isNumber }.map(String.init).filter { $0.count >= 3 })
		guard !words.isEmpty else { return [] }
		var scored: [(score: Int, text: String)] = []
		for item in library {
			let body = text(of: item)
			var start = body.startIndex
			while start < body.endIndex {
				let end = body.index(start, offsetBy: Self.chunkChars, limitedBy: body.endIndex) ?? body.endIndex
				let chunk = String(body[start ..< end])
				let lower = chunk.lowercased()
				let score = words.reduce(0) { $0 + (lower.contains($1) ? 1 : 0) }
				if score > 0 { scored.append((score, "[\(item.name)]\n\(chunk)")) }
				start = end
			}
		}
		var budget = Self.contextLibraryChars
		var picked: [String] = []
		for entry in scored.sorted(by: { $0.score > $1.score }).prefix(Self.maxChunks) where entry.text.count <= budget {
			picked.append(entry.text)
			budget -= entry.text.count
		}
		return picked
	}

	// MARK: export, backup, restore

	// Readable copy: memories.json plus each saved file as <name>.txt. Also what a backup contains.
	func export(to target: URL) throws {
		let files = target.appendingPathComponent("files", isDirectory: true)
		try FileManager.default.createDirectory(at: files, withIntermediateDirectories: true)
		try encoder.encode(memories).write(to: target.appendingPathComponent("memories.json"))
		try encoder.encode(library).write(to: target.appendingPathComponent("library.json"))
		for item in library {
			let safe = item.name.replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: ":", with: "_")
			let base = (safe as NSString).deletingPathExtension
			try text(of: item).write(to: files.appendingPathComponent("\(base) [\(item.id.uuidString.prefix(8))].txt"),
			                         atomically: true, encoding: .utf8)
		}
	}

	// A dated backup folder inside `folder`; only the newest `keptBackups` are kept.
	@discardableResult
	func backup(into folder: URL) throws -> URL {
		let stamp = Self.stampFormatter.string(from: Date())
		let target = folder.appendingPathComponent("Yana-ki-uc-\(stamp)", isDirectory: true)
		try export(to: target)
		let old = (try? FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil)) ?? []
		let backups = old.filter { $0.lastPathComponent.hasPrefix("Yana-ki-uc-") }.sorted { $0.lastPathComponent > $1.lastPathComponent }
		for stale in backups.dropFirst(Self.keptBackups) { try? FileManager.default.removeItem(at: stale) }
		AppSettings.shared.lastBackup = Date().timeIntervalSince1970
		return target
	}

	// Daily automatic backup into the folder chosen in Settings (nothing happens until one is chosen).
	func backupIfDue() {
		let path = AppSettings.shared.backupFolder
		guard enabled, !path.isEmpty, !(memories.isEmpty && library.isEmpty) else { return }
		let day: TimeInterval = 24 * 60 * 60
		guard Date().timeIntervalSince1970 - AppSettings.shared.lastBackup >= day else { return }
		do { try backup(into: URL(fileURLWithPath: path, isDirectory: true)) } catch {
			lastError = "\(L("mem.backupFailed")): \(error.localizedDescription)"
		}
	}

	// Merges a backup or export folder (memories.json, library.json, files/) into the current memory.
	func restore(from source: URL) throws -> Int {
		let decoder = JSONDecoder()
		decoder.dateDecodingStrategy = .iso8601
		var added = 0
		if let data = try? Data(contentsOf: source.appendingPathComponent("memories.json")) {
			for memory in try decoder.decode([Memory].self, from: data) where !memories.contains(where: { $0.text == memory.text }) {
				memories.append(memory)
				added += 1
			}
		}
		if let data = try? Data(contentsOf: source.appendingPathComponent("library.json")) {
			let files = source.appendingPathComponent("files", isDirectory: true)
			let listing = (try? FileManager.default.contentsOfDirectory(atPath: files.path)) ?? []
			try FileManager.default.createDirectory(at: libraryFolder, withIntermediateDirectories: true)
			for item in try decoder.decode([LibraryItem].self, from: data) where !library.contains(where: { $0.id == item.id }) {
				guard let file = listing.first(where: { $0.contains("[\(item.id.uuidString.prefix(8))]") }) else { continue }
				let text = try String(contentsOf: files.appendingPathComponent(file), encoding: .utf8)
				try text.write(to: textURL(item.id), atomically: true, encoding: .utf8)
				library.append(item)
				added += 1
			}
		}
		save()
		return added
	}

	// MARK: storage

	private var encoder: JSONEncoder {
		let encoder = JSONEncoder()
		encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
		encoder.dateEncodingStrategy = .iso8601
		return encoder
	}

	private static let stampFormatter: DateFormatter = {
		let formatter = DateFormatter()
		formatter.dateFormat = "yyyy-MM-dd-HHmmss"
		formatter.locale = Locale(identifier: "en_US_POSIX")
		return formatter
	}()

	private func load() {
		let decoder = JSONDecoder()
		decoder.dateDecodingStrategy = .iso8601
		if let data = try? Data(contentsOf: memoriesFile) {
			do { memories = try decoder.decode([Memory].self, from: data) } catch { lastError = "memories.json: \(error.localizedDescription)" }
		}
		if let data = try? Data(contentsOf: libraryFile) {
			do { library = try decoder.decode([LibraryItem].self, from: data) } catch { lastError = "library.json: \(error.localizedDescription)" }
		}
	}

	private func save() {
		do {
			try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
			try encoder.encode(memories).write(to: memoriesFile, options: .atomic)
			try encoder.encode(library).write(to: libraryFile, options: .atomic)
		} catch {
			lastError = "\(L("mem.saveFailed")): \(error.localizedDescription)"
		}
	}
}
