import Foundation

// Overview data, all read from yana-rt or git. Nothing is invented: when a source is empty the page says so.

struct ActivitySummary: Decodable {
	let total: Int
	let byDecision: [String: Int]
	let byTool: [String: Int]
}

struct OverviewData {
	var activity = ActivitySummary(total: 0, byDecision: [:], byTool: [:])
	var pendingCount = 0
	var latestDecisions: [DecisionReceipt] = []
	var version = "unknown"
	var branch = "unknown"
	var workspace = ""
	var error: String? = nil
}

extension RtClient {
	// Runs a program with a fixed argument list (no shell) and returns trimmed stdout, or nil on any failure.
	private static func text(_ program: String, _ args: [String], in directory: String) -> String? {
		let process = Process()
		process.executableURL = URL(fileURLWithPath: program)
		process.arguments = args
		process.currentDirectoryURL = URL(fileURLWithPath: directory)
		let out = Pipe()
		process.standardOutput = out
		process.standardError = Pipe()
		do { try process.run() } catch { return nil }
		let deadline = Date().addingTimeInterval(5)
		while process.isRunning && Date() < deadline { Thread.sleep(forTimeInterval: 0.02) }
		if process.isRunning { process.terminate(); return nil }
		let data = out.fileHandleForReading.readDataToEndOfFile()
		return String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines)
	}

	// Just the version, for the rail footer: "1.5.2", or "not found" when yana-rt is not installed.
	static func versionString() -> String {
		guard let binary = binaryPath() else { return "not found" }
		return text(binary, ["--version"], in: workspace())?.replacingOccurrences(of: "yana-rt ", with: "") ?? "unknown"
	}

	static func gitBranch(in directory: String) -> String {
		text("/usr/bin/git", ["rev-parse", "--abbrev-ref", "HEAD"], in: directory) ?? "unknown"
	}

	static func loadOverview() -> OverviewData {
		var data = OverviewData()
		data.workspace = workspace()
		if let binary = binaryPath() {
			data.version = text(binary, ["--version"], in: data.workspace)?.replacingOccurrences(of: "yana-rt ", with: "") ?? "unknown"
		}
		data.branch = text("/usr/bin/git", ["rev-parse", "--abbrev-ref", "HEAD"], in: data.workspace) ?? "unknown"
		do {
			data.activity = try run(["observability", "show", "--last", "500"], as: ActivitySummary.self)
			data.pendingCount = try run(["authority", "pending-approvals"], as: [PendingApproval].self).count
			data.latestDecisions = Array(try run(["authority", "receipts"], as: [DecisionReceipt].self).suffix(5).reversed())
		} catch let error as RtError {
			data.error = error.message
		} catch {
			data.error = "yana-rt could not be run: \(error.localizedDescription)"
		}
		return data
	}
}
