import Foundation

// Read-only data for the Health, Connectors, Tasks and Skills pages. Every value comes from a yana-rt
// command (`doctor run`, `score show`, `connector list`, `task list`, `lease list`, all with --json)
// or from the skill folders on disk. Loaders run off the main thread; callers use them from `.task {}`.

struct DoctorCheck: Decodable, Identifiable {
	let label: String
	let status: String
	let detail: String
	let fix: String
	var id: String { label }
}

struct DoctorReport: Decodable {
	let checks: [DoctorCheck]
	let healthy: Bool
}

struct ScoreFinding: Decodable {
	let id: String
	let severity: String
	let description: String
	let file: String
}

struct ScoreSummary: Decodable {
	let critical: Int
	let high: Int
	let medium: Int
	let low: Int
}

struct ScoreReport: Decodable {
	let score: Int
	let riskLevel: String
	let filesScanned: Int
	let summary: ScoreSummary
	let deductions: [ScoreFinding]
}

// Findings grouped by rule, so 200 lines of the same pattern read as one row with a count.
struct FindingGroup: Identifiable {
	let id: String
	let severity: String
	let description: String
	let files: [String]
}

struct HealthData {
	var doctor: DoctorReport? = nil
	var score: ScoreReport? = nil
	var error: String? = nil

	var groups: [FindingGroup] {
		guard let score else { return [] }
		let order = ["CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3]
		return Dictionary(grouping: score.deductions) { "\($0.id)|\($0.description)" }
			.map { key, items in FindingGroup(id: key, severity: items[0].severity, description: items[0].description,
			                                  files: Array(Set(items.map(\.file))).sorted()) }
			.sorted { (order[$0.severity] ?? 9, -$0.files.count) < (order[$1.severity] ?? 9, -$1.files.count) }
	}
}

struct Connector: Decodable, Identifiable {
	let name: String
	let description: String
	let connectionState: String
	let credentialPresent: Bool
	// yana-rt writes `"enabled_scopes": null` for a connector that was never enabled (seen 2026-11-07).
	private let enabledScopesRaw: [String]?
	let allowedScopes: [String]
	var enabledScopes: [String] { enabledScopesRaw ?? [] }
	var id: String { name }

	private enum CodingKeys: String, CodingKey {
		case name, description, connectionState, credentialPresent, allowedScopes
		case enabledScopesRaw = "enabledScopes"
	}
}

struct SkillInfo: Identifiable {
	let id: String
	let description: String
}

// Tasks and leases are read loosely: both lists are empty today, so no field set can be confirmed yet.
struct LooseItem: Identifiable {
	let id: String
	let title: String
	let status: String
}

extension RtClient {
	static func loadHealth() -> HealthData {
		do {
			return HealthData(doctor: try run(["doctor", "run"], as: DoctorReport.self),
			                  score: try run(["score", "show"], as: ScoreReport.self))
		} catch let error as RtError {
			return HealthData(error: error.message)
		} catch {
			return HealthData(error: error.localizedDescription)
		}
	}

	static func loadConnectors() -> Result<[Connector], RtError> {
		do { return .success(try run(["connector", "list"], as: [Connector].self)) }
		catch let error as RtError { return .failure(error) }
		catch { return .failure(.badOutput("connector list")) }
	}

	// `task list --json` gives {"tasks": [...]}; `lease list --json` gives [...].
	static func loadTasksAndLeases() -> (tasks: [LooseItem], leases: [LooseItem], error: String?) {
		do {
			let tasks = try run(["task", "list"], as: AnyJSON.self).value["tasks"] as? [[String: Any]] ?? []
			let leases = try run(["lease", "list"], as: AnyJSON.self).array
			return (tasks.map(loose), leases.map(loose), nil)
		} catch let error as RtError {
			return ([], [], error.message)
		} catch {
			return ([], [], error.localizedDescription)
		}
	}

	private static func loose(_ item: [String: Any]) -> LooseItem {
		let id = item["id"] as? String ?? item["lease_id"] as? String ?? UUID().uuidString
		let title = item["title"] as? String ?? item["name"] as? String ?? item["capability"] as? String ?? id
		return LooseItem(id: id, title: title, status: item["status"] as? String ?? "")
	}

	// Every `core/skills/<name>/SKILL.md` in the workspace, with the description from its front matter.
	static func loadSkills() -> [SkillInfo] {
		let root = URL(fileURLWithPath: workspace()).appendingPathComponent("core/skills")
		let names = (try? FileManager.default.contentsOfDirectory(atPath: root.path)) ?? []
		return names.sorted().compactMap { name in
			let file = root.appendingPathComponent(name).appendingPathComponent("SKILL.md")
			guard let handle = try? FileHandle(forReadingFrom: file) else { return nil }
			defer { try? handle.close() }
			let head = String(decoding: handle.readData(ofLength: 2048), as: UTF8.self)
			return SkillInfo(id: name, description: frontMatterValue("description", in: head))
		}
	}

	private static func frontMatterValue(_ key: String, in text: String) -> String {
		for line in text.split(separator: "\n").prefix(30) where line.hasPrefix("\(key):") {
			return line.dropFirst(key.count + 1).trimmingCharacters(in: CharacterSet(charactersIn: " \"'"))
		}
		return ""
	}
}

// Decodes any JSON value, for outputs whose shape is not fixed yet.
struct AnyJSON: Decodable {
	let raw: Any
	var value: [String: Any] { raw as? [String: Any] ?? [:] }
	var array: [[String: Any]] { raw as? [[String: Any]] ?? [] }

	init(from decoder: Decoder) throws {
		// The JSON is parsed again with JSONSerialization; Decodable only gives typed access.
		let container = try decoder.singleValueContainer()
		if let dict = try? container.decode([String: AnyJSONLeaf].self) { raw = dict.mapValues(\.raw); return }
		if let list = try? container.decode([[String: AnyJSONLeaf]].self) { raw = list.map { $0.mapValues(\.raw) }; return }
		raw = [String: Any]()
	}
}

struct AnyJSONLeaf: Decodable {
	let raw: Any
	init(from decoder: Decoder) throws {
		let c = try decoder.singleValueContainer()
		if let v = try? c.decode(String.self) { raw = v }
		else if let v = try? c.decode(Bool.self) { raw = v }
		else if let v = try? c.decode(Double.self) { raw = v }
		else if let v = try? c.decode([AnyJSONLeaf].self) { raw = v.map(\.raw) }
		else if let v = try? c.decode([String: AnyJSONLeaf].self) { raw = v.mapValues(\.raw) }
		else { raw = NSNull() }
	}
}
