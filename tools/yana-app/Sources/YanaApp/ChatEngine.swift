import AppKit
import Foundation
import SwiftUI
import UniformTypeIdentifiers

// Runs chat turns through yana-rt's machine-readable adapter, `yana-rt chat --headless`.
// Protocol (src/chat/headless.rs): one JSON object on stdin, NDJSON events on stdout:
// text_delta, completed, error, authority_denied, cancelled, awaiting_approval, metrics, runtime_event.
// A turn paused for approval is finished by a second process, `--resume-approval`, with the human decision.
// All authority stays in yana-rt; this class only shows what it says and passes the human's answer back.

struct ApprovalAsk {
	let id: String
	let capability: String
	let reason: String
	var decided: Bool? = nil
}

struct ChatLine: Identifiable {
	enum Role { case user, assistant }
	let id = UUID()
	let role: Role
	var text: String
	var error: String? = nil
	var approval: ApprovalAsk? = nil
	// Tokens reported by yana-rt's `metrics` events for this reply (0 until one arrives).
	var inputTokens = 0
	var outputTokens = 0
	// Thumbnails of the images sent with a user message.
	var images: [NSImage] = []
}

@MainActor
final class ChatEngine: ObservableObject {
	@Published private(set) var lines: [ChatLine] = []
	@Published private(set) var running = false

	// Provider and model belong to this chat. They start from Settings; changing them here does not change
	// Settings, and a change made while a turn runs applies from the next message.
	@Published var provider = AppSettings.shared.provider
	// nil means yana-rt picks (for ollama: the first pulled model it detects).
	@Published var model: String? = AppSettings.shared.model.isEmpty ? nil : AppSettings.shared.model
	// Plan mode: yana-rt withholds every tool that could change anything, so the model can only look and plan.
	@Published var planMode = AppSettings.shared.defaultPlanMode
	// The folder yana-rt runs in. Approval pauses also need its `.claude/state/locking-protocol-version`.
	@Published var workspace = RtClient.workspace()
	@Published private(set) var models: [String] = []
	// Images waiting to go out with the next message (Attachments.swift).
	@Published var attachments: [ChatImage] = []
	@Published var attachError: String? = nil
	var acceptsImages: Bool { ChatImages.visionProviders.contains(provider) }

	// Documents whose text goes out with the next message (DocumentText.swift).
	@Published var documents: [ChatDocument] = []
	private static let maxDocuments = 10

	// Notes describing attached videos (name, length, frame times), sent with the next message.
	@Published var videoNotes: [String] = []

	// Images go to yana-rt as images; videos become a few frames (VideoFrames.swift); every other file is
	// read into text here.
	func attach(_ urls: [URL]) {
		attachError = nil
		for url in urls {
			let type = UTType(filenameExtension: url.pathExtension)
			if type?.conforms(to: .movie) == true || type?.conforms(to: .video) == true {
				attachVideo(url)
				continue
			}
			let isImage = type?.conforms(to: .image) ?? false
			do {
				if isImage {
					guard attachments.count < ChatImages.maxCount else { attachError = L("attach.tooMany"); continue }
					attachments.append(try ChatImages.load(url))
				} else {
					guard documents.count < Self.maxDocuments else { attachError = L("doc.tooMany"); continue }
					documents.append(try DocumentText.read(url))
				}
			} catch { attachError = error.localizedDescription }
		}
	}

	private func attachVideo(_ url: URL) {
		let room = ChatImages.maxCount - attachments.count
		guard room > 0 else { attachError = L("attach.tooMany"); return }
		Task {
			do {
				let result = try await VideoFrames.extract(url, count: room)
				attachments.append(contentsOf: result.frames.prefix(ChatImages.maxCount - attachments.count))
				videoNotes.append(result.note)
			} catch {
				attachError = error.localizedDescription
			}
		}
	}

	// The message text plus each attached document, fenced and named, so the model sees what came from where.
	private func withDocuments(_ text: String, _ docs: [ChatDocument]) -> String {
		guard !docs.isEmpty else { return text }
		let parts = docs.map { doc in
			"\(L("doc.attached")): \(doc.name)\(doc.truncated ? " (\(L("doc.truncated")))" : "")\n```\n\(doc.text)\n```"
		}
		return ([text] + parts).filter { !$0.isEmpty }.joined(separator: "\n\n")
	}

	func attach(_ image: NSImage, name: String) {
		attachError = nil
		guard attachments.count < ChatImages.maxCount else { attachError = L("attach.tooMany"); return }
		do { attachments.append(try ChatImages.from(image, name: name)) } catch { attachError = error.localizedDescription }
	}
	// Yana's skills (core/skills/*/SKILL.md), listed when the user types "/" in the composer.
	@Published private(set) var skills: [SkillInfo] = []
	private var skillsLoading = false
	// A skill's instructions are sent as the turn's system prompt; cap keeps one skill from flooding context.
	private static let maxSkillChars = 24_000

	func loadSkillsIfNeeded() {
		guard skills.isEmpty, !skillsLoading else { return }
		skillsLoading = true
		Task {
			skills = await Task.detached { RtClient.loadSkills() }.value
			skillsLoading = false
		}
	}

	// "/name rest" -> the skill's SKILL.md text, or nil when the message does not start with a known skill.
	func skillInstructions(for message: String) -> (name: String, text: String)? {
		guard message.hasPrefix("/") else { return nil }
		let name = String(message.dropFirst().prefix { !$0.isWhitespace })
		guard skills.contains(where: { $0.id == name }) else { return nil }
		let file = URL(fileURLWithPath: RtClient.workspace()).appendingPathComponent("core/skills/\(name)/SKILL.md")
		guard let text = try? String(contentsOf: file, encoding: .utf8) else { return nil }
		return (name, String(text.prefix(Self.maxSkillChars)))
	}

	private static let maxHistoryTurns = 40 // yana-rt's own MAX_HISTORY_TURNS
	private static let errorTailChars = 400
	private static let ollamaPath = "/opt/homebrew/bin/ollama"
	private var sessionId = UUID().uuidString.lowercased()
	private var turnProvider = AppSettings.shared.provider
	private var process: Process?

	// The first user message of this chat, shown under "Recent".
	var title: String? { lines.first { $0.role == .user }?.text }

	// Token totals for this chat, summed from the replies' `metrics` events.
	var chatInputTokens: Int { lines.reduce(0) { $0 + $1.inputTokens } }
	var chatOutputTokens: Int { lines.reduce(0) { $0 + $1.outputTokens } }

	// Starts a new chat: empty conversation, new yana-rt session id.
	func reset() {
		guard !running else { return }
		lines = []
		sessionId = UUID().uuidString.lowercased()
	}

	// Reads the pulled models from `ollama list` (first column, header skipped). Empty when Ollama is missing.
	func loadModels() {
		let path = Self.ollamaPath
		DispatchQueue.global().async { [weak self] in
			var names: [String] = []
			if FileManager.default.isExecutableFile(atPath: path) {
				let process = Process()
				process.executableURL = URL(fileURLWithPath: path)
				process.arguments = ["list"]
				let out = Pipe()
				process.standardOutput = out
				process.standardError = Pipe()
				if (try? process.run()) != nil {
					let data = out.fileHandleForReading.readDataToEndOfFile()
					process.waitUntilExit()
					names = String(decoding: data, as: UTF8.self)
						.split(separator: "\n").dropFirst()
						.compactMap { $0.split(separator: " ").first.map(String.init) }
				}
			}
			let found = names
			DispatchQueue.main.async { MainActor.assumeIsolated { self?.models = found } }
		}
	}

	func send(_ text: String) {
		guard !running else { return }
		let history = lines
			.filter { $0.error == nil && !$0.text.isEmpty }
			.suffix(Self.maxHistoryTurns)
			.map { ["role": $0.role == .user ? "user" : "assistant", "content": $0.text] }
		let sending = attachments
		let docs = documents
		let notes = videoNotes
		attachments = []
		documents = []
		videoNotes = []
		attachError = nil
		let shown = ([text] + docs.map { "📎 \($0.name)" }).filter { !$0.isEmpty }.joined(separator: "\n")
		lines.append(ChatLine(role: .user, text: shown, images: sending.map(\.preview)))
		lines.append(ChatLine(role: .assistant, text: ""))
		let task = ([withDocuments(text, docs)] + notes).filter { !$0.isEmpty }.joined(separator: "\n\n")
		var payload: [String: Any] = ["task": task, "session_id": sessionId, "history": Array(history), "mode": planMode ? "plan" : "act"]
		if !sending.isEmpty {
			payload["images"] = sending.map { ["mime_type": $0.mimeType, "data": $0.base64] }
		}
		if let skill = skillInstructions(for: text) {
			payload["system"] = "Follow this Yana skill (\(skill.name)) for this request:\n\n\(skill.text)"
		}
		let settings = AppSettings.shared
		if let key = settings.apiKey(provider) { payload["api_key"] = key }
		if provider == "custom" {
			payload["base_url"] = settings.baseURL
			payload["custom_keyless"] = !settings.hasKey("custom")
		}
		if let value = settings.maxTokensValue { payload["max_tokens"] = value }
		if let value = settings.temperatureValue { payload["temperature"] = value }
		turnProvider = provider
		var args = ["chat", "--headless", "--provider", provider]
		if let model { args += ["--model", model] }
		start(args, input: payload)
	}

	// The human's answer to the latest open approval card.
	func decide(_ approved: Bool) {
		guard !running,
		      let index = lines.lastIndex(where: { $0.approval != nil && $0.approval?.decided == nil }),
		      let ask = lines[index].approval else { return }
		lines[index].approval?.decided = approved
		lines.append(ChatLine(role: .assistant, text: ""))
		// Resume with the provider of the paused turn, even if the chip was changed since.
		var payload: [String: Any] = ["approval_id": ask.id, "decision": approved, "decided_by": "human:yana-app"]
		if let key = AppSettings.shared.apiKey(turnProvider) { payload["api_key"] = key }
		start(["chat", "--resume-approval", "--provider", turnProvider], input: payload)
	}

	func stop() { process?.terminate() }

	private func start(_ args: [String], input: [String: Any]) {
		guard let binary = RtClient.binaryPath() else { failLast(RtError.notInstalled.message); return }
		guard let body = try? JSONSerialization.data(withJSONObject: input) else { failLast("could not encode the request"); return }

		let process = Process()
		process.executableURL = URL(fileURLWithPath: binary)
		process.arguments = args
		process.currentDirectoryURL = URL(fileURLWithPath: workspace)
		let stdin = Pipe(), stdout = Pipe(), stderr = Pipe()
		process.standardInput = stdin
		process.standardOutput = stdout
		process.standardError = stderr
		do { try process.run() } catch { failLast("yana-rt could not start: \(error.localizedDescription)"); return }
		self.process = process
		running = true
		stdin.fileHandleForWriting.write(body)
		try? stdin.fileHandleForWriting.close()

		// stderr is drained on its own thread so a chatty stderr can never block the child process.
		let errorBox = ErrorBox()
		let stderrDone = DispatchGroup()
		stderrDone.enter()
		DispatchQueue.global().async {
			errorBox.data = stderr.fileHandleForReading.readDataToEndOfFile()
			stderrDone.leave()
		}
		// stdout is read until EOF, so every event is handled before the turn is marked finished.
		DispatchQueue.global().async { [weak self] in
			let reader = stdout.fileHandleForReading
			var buffer = Data()
			while true {
				let chunk = reader.availableData
				if chunk.isEmpty { break }
				buffer.append(chunk)
				while let newline = buffer.firstIndex(of: 0x0A) {
					let line = buffer[buffer.startIndex ..< newline]
					buffer.removeSubrange(buffer.startIndex ... newline)
					Self.dispatch(line, to: self)
				}
			}
			if !buffer.isEmpty { Self.dispatch(buffer, to: self) }
			process.waitUntilExit()
			stderrDone.wait()
			let status = process.terminationStatus
			DispatchQueue.main.async {
				let tail = String(decoding: errorBox.data, as: UTF8.self)
				MainActor.assumeIsolated { self?.finish(status: status, stderr: tail) }
			}
		}
	}

	private nonisolated static func dispatch(_ line: Data, to engine: ChatEngine?) {
		guard let event = try? JSONSerialization.jsonObject(with: Data(line)) as? [String: Any] else { return }
		let box = EventBox(event)
		DispatchQueue.main.async { MainActor.assumeIsolated { engine?.handle(box.event) } }
	}

	private func handle(_ event: [String: Any]) {
		guard let last = lines.indices.last else { return }
		switch event["type"] as? String {
		case "text_delta":
			lines[last].text += event["text"] as? String ?? ""
		case "completed":
			if lines[last].text.isEmpty, let message = event["message"] as? String { lines[last].text = message }
		case "error":
			if lines[last].error == nil { lines[last].error = event["message"] as? String ?? "error" }
		case "authority_denied":
			lines[last].error = "\(L("chat.deniedBy")): \(event["reason"] as? String ?? "")"
		case "awaiting_approval":
			lines[last].approval = ApprovalAsk(
				id: event["approval_id"] as? String ?? "",
				capability: event["capability"] as? String ?? "",
				reason: event["reason"] as? String ?? "")
		case "metrics":
			// One event per model call; a turn with tool rounds has several, so they add up.
			lines[last].inputTokens += (event["input_tokens"] as? NSNumber)?.intValue ?? 0
			lines[last].outputTokens += (event["output_tokens"] as? NSNumber)?.intValue ?? 0
		default:
			break // runtime_event, cancelled: not shown yet
		}
	}

	private func finish(status: Int32, stderr: String) {
		running = false
		process = nil
		guard let last = lines.indices.last else { return }
		let line = lines[last]
		if status != 0, line.error == nil, line.approval == nil, line.text.isEmpty {
			let detail = stderr.trimmingCharacters(in: .whitespacesAndNewlines)
			lines[last].error = detail.isEmpty ? "yana-rt exited with code \(status)" : String(detail.suffix(Self.errorTailChars))
		}
	}

	private func failLast(_ message: String) {
		if let last = lines.indices.last, lines[last].role == .assistant {
			lines[last].error = message
		} else {
			lines.append(ChatLine(role: .assistant, text: "", error: message))
		}
	}
}

// Small boxes so values cross threads explicitly.
private final class ErrorBox: @unchecked Sendable { var data = Data() }
private final class EventBox: @unchecked Sendable {
	let event: [String: Any]
	init(_ event: [String: Any]) { self.event = event }
}
