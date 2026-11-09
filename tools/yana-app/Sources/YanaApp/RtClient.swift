import Foundation

// Read-only bridge to yana-rt. It runs `yana-rt authority <what> --json` as a child process with a fixed
// argument list (no shell), and decodes the JSON. It never writes, approves or denies anything.

struct DecisionReceipt: Decodable, Identifiable {
	let decisionId: String
	let capability: String
	let decision: String
	let reason: String
	let timestamp: String
	var id: String { decisionId }
}

struct ExecutionReceipt: Decodable, Identifiable {
	let invocationId: String
	let capabilityId: String
	let outcome: String
	let startedAt: String
	var id: String { invocationId }
}

// Only the fields the screen shows. `pending-approvals` is empty today, so its shape is read loosely.
struct PendingApproval: Decodable, Identifiable {
	let id: String
}

struct ApprovalsData {
	var pending: [PendingApproval] = []
	var decisions: [DecisionReceipt] = []
	var executions: [ExecutionReceipt] = []
	var error: String? = nil
}

enum RtClient {
	// `score show` scans the whole repo (3.6 s measured on ~4,000 files), so 5 s was too tight.
	private static let timeoutSeconds: TimeInterval = 20

	// The app is started from Finder or a terminal, so PATH is not reliable: look in the usual places.
	static func binaryPath() -> String? {
		// Settings > yana-rt path (same meaning as the IDE's yana.runtimePath) wins when it points at a binary.
		let custom = AppSettings.shared.runtimePath.trimmingCharacters(in: .whitespaces)
		if !custom.isEmpty, isNativeBinary(custom) { return custom }
		let home = NSHomeDirectory()
		let candidates = ["\(home)/.local/bin/yana-rt", "\(home)/.cargo/bin/yana-rt", "/opt/homebrew/bin/yana-rt", "/usr/local/bin/yana-rt"]
		return candidates.first { isNativeBinary($0) }
	}

	// Only a compiled Mach-O file counts as yana-rt. `pip install yana-ai` puts a text shim also named
	// `yana-rt` on PATH; running a shim from here could re-enter itself (the 2026-09-17 incident documented
	// in src/yana_ai/rt.py, load 490+). Same rule as rt.py's _looks_like_native_binary: check magic bytes.
	static func isNativeBinary(_ path: String) -> Bool {
		guard FileManager.default.isExecutableFile(atPath: path), let handle = FileHandle(forReadingAtPath: path) else { return false }
		defer { try? handle.close() }
		let head = handle.readData(ofLength: 4)
		guard head.count == 4 else { return false }
		let magic = head.withUnsafeBytes { $0.load(as: UInt32.self) }
		let machO: Set<UInt32> = [0xFEEDFACF, 0xCFFAEDFE, 0xFEEDFACE, 0xCEFAEDFE, 0xCAFEBABE, 0xBEBAFECA]
		return machO.contains(magic)
	}

	// The project the receipts belong to: YANA_WORKSPACE, else the folder chosen in Settings, else the
	// nearest folder with a .git above the cwd, else the cwd. Opened from Finder the cwd is "/", which is
	// never a sensible project: the home folder is used instead.
	static func workspace() -> String {
		if let env = ProcessInfo.processInfo.environment["YANA_WORKSPACE"], !env.isEmpty { return env }
		let chosen = AppSettings.shared.workspace
		if !chosen.isEmpty, FileManager.default.fileExists(atPath: chosen) { return chosen }
		var url = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
		while url.path != "/" {
			if FileManager.default.fileExists(atPath: url.appendingPathComponent(".git").path) { return url.path }
			url.deleteLastPathComponent()
		}
		let cwd = FileManager.default.currentDirectoryPath
		return cwd == "/" ? FileManager.default.homeDirectoryForCurrentUser.path : cwd
	}

	static func run<T: Decodable>(_ args: [String], as type: T.Type) throws -> T {
		guard let binary = binaryPath() else { throw RtError.notInstalled }
		let process = Process()
		process.executableURL = URL(fileURLWithPath: binary)
		process.arguments = args + ["--json"]
		process.currentDirectoryURL = URL(fileURLWithPath: workspace())
		let out = Pipe()
		process.standardOutput = out
		process.standardError = Pipe()
		try process.run()
		let deadline = Date().addingTimeInterval(timeoutSeconds)
		while process.isRunning && Date() < deadline { Thread.sleep(forTimeInterval: 0.02) }
		if process.isRunning { process.terminate(); throw RtError.timedOut }
		let data = out.fileHandleForReading.readDataToEndOfFile()
		let decoder = JSONDecoder()
		decoder.keyDecodingStrategy = .convertFromSnakeCase
		do { return try decoder.decode(T.self, from: data) } catch { throw RtError.badOutput(args.joined(separator: " ")) }
	}

	static func loadApprovals() -> ApprovalsData {
		do {
			var data = ApprovalsData()
			data.pending = try run(["authority", "pending-approvals"], as: [PendingApproval].self)
			data.decisions = try run(["authority", "receipts"], as: [DecisionReceipt].self).reversed()
			data.executions = try run(["authority", "executions"], as: [ExecutionReceipt].self).reversed()
			return data
		} catch let error as RtError {
			return ApprovalsData(error: error.message)
		} catch {
			return ApprovalsData(error: "yana-rt could not be run: \(error.localizedDescription)")
		}
	}
}

enum RtError: Error {
	case notInstalled, timedOut, badOutput(String)

	var message: String {
		switch self {
		case .notInstalled: return "yana-rt was not found in ~/.local/bin, /opt/homebrew/bin or /usr/local/bin."
		case .timedOut: return "yana-rt did not answer within 20 seconds."
		case .badOutput(let cmd): return "yana-rt gave output this app could not read (\(cmd))."
		}
	}
}
