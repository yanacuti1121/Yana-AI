import Foundation

/// A pause waiting for a person, as `yana-rt status` reports it (already stripped of the raw command).
struct PendingItem: Equatable {
    let id: String
    let capability: String
    let reason: String
    let expiresAt: Date
}

struct AuditLine: Equatable {
    let time: Date
    let tool: String
    let decision: String

    var isDeny: Bool {
        let d = decision.lowercased()
        return d.contains("deny") || d.contains("block")
    }
}

struct RunningEngine: Equatable {
    let name: String
    let count: Int
}

/// What the pill needs, read from one place. A `nil` list means the runtime could not read that
/// source, which must never be drawn as "nothing there".
struct StatusSnapshot: Equatable {
    let state: String
    let engines: [RunningEngine]?
    let approvals: [PendingItem]?
    let audit: [AuditLine]?
    let halted: Bool
}

private struct Wire: Decodable {
    struct Engine: Decodable { let name: String; let count: Int }
    struct Approval: Decodable { let id: String; let capability: String; let reason: String; let expires_at: String }
    struct Audit: Decodable { let ts: String; let tool: String; let decision: String }
    let schema: Int
    let state: String
    let engines: [Engine]?
    let approvals: [Approval]?
    let audit: [Audit]?
    let halted: Bool
}

private func parseDate(_ text: String) -> Date? {
    let plain = ISO8601DateFormatter()
    let fractional = ISO8601DateFormatter()
    fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return fractional.date(from: text) ?? plain.date(from: text)
}

/// The only reader. The app no longer scans processes or opens logs itself: that logic lives once,
/// in `yana-rt status`, so Studio, the menu bar and the terminal cannot disagree with the notch.
struct StatusFeed {
    static let supportedSchema = 1
    static let maxOutputBytes = 1024 * 1024
    let root: URL

    static func findRuntime() -> URL? {
        let env = ProcessInfo.processInfo.environment
        if let override = env["YANA_RT_BIN"], FileManager.default.isExecutableFile(atPath: override) {
            return URL(fileURLWithPath: override)
        }
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        var dirs = (env["PATH"] ?? "").split(separator: ":").map(String.init)
        dirs += ["\(home)/.local/bin", "/usr/local/bin", "/opt/homebrew/bin"]
        return dirs.map { URL(fileURLWithPath: $0).appendingPathComponent("yana-rt") }
            .first { FileManager.default.isExecutableFile(atPath: $0.path) }
    }

    /// nil when the runtime is missing, too old to have `status`, or answers with a schema this
    /// app does not understand.
    func read() -> StatusSnapshot? {
        guard let runtime = Self.findRuntime() else { return nil }
        let process = Process()
        process.executableURL = runtime
        process.arguments = ["status", "--json", "--root", root.path]
        let out = Pipe()
        process.standardOutput = out
        process.standardError = FileHandle.nullDevice
        do { try process.run() } catch { return nil }
        let data = out.fileHandleForReading.readDataToEndOfFile()
        process.waitUntilExit()
        guard process.terminationStatus == 0, data.count <= Self.maxOutputBytes,
              let wire = try? JSONDecoder().decode(Wire.self, from: data),
              wire.schema == Self.supportedSchema else { return nil }
        return StatusSnapshot(
            state: wire.state,
            engines: wire.engines?.map { RunningEngine(name: $0.name, count: $0.count) },
            approvals: wire.approvals?.compactMap { item in
                parseDate(item.expires_at).map {
                    PendingItem(id: item.id, capability: item.capability, reason: item.reason, expiresAt: $0)
                }
            },
            audit: wire.audit?.compactMap { item in
                parseDate(item.ts).map { AuditLine(time: $0, tool: item.tool, decision: item.decision) }
            },
            halted: wire.halted)
    }
}

enum EngineLabel {
    /// Names that run as several processes for one session, so a count would mislead.
    static let countable: Set<String> = ["Claude Code"]

    static func text(_ engines: [RunningEngine]) -> String {
        engines.map { $0.count > 1 && countable.contains($0.name) ? "\($0.name) ×\($0.count)" : $0.name }
            .joined(separator: " · ")
    }
}
