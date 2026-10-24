import Foundation
import SwiftUI

/// What the pill is showing. The colours follow the decision, not the engine.
enum PillState: String {
    case idle, run, ask, deny, done

    var tint: Color {
        switch self {
        case .idle: return Color(red: 0.56, green: 0.56, blue: 0.58)
        case .run, .done: return Color(red: 0.13, green: 0.77, blue: 0.37)
        case .ask: return Color(red: 0.96, green: 0.62, blue: 0.04)
        case .deny: return Color(red: 0.94, green: 0.27, blue: 0.27)
        }
    }
}

struct LogEntry: Identifiable {
    let id = UUID()
    let time: Date
    let text: String
    let tag: String
    let color: Color
}

/// Everything the pill view needs, plus the two ways a person can answer an approval.
@MainActor
final class PillModel: ObservableObject {
    static let maxLogEntries = 4

    @Published var state: PillState = .idle
    @Published var subtitle = "Đang nghỉ"
    @Published var command = ""
    @Published var hovering = false
    @Published private(set) var log: [LogEntry] = []

    /// Set while an approval is waiting. Called with true (allow) or false (deny).
    private var pendingDecision: ((Bool) -> Void)?

    var isAsking: Bool { state == .ask }

    func set(_ state: PillState, _ subtitle: String) {
        self.state = state
        self.subtitle = subtitle
    }

    func record(_ text: String, tag: String, color: Color) {
        log.insert(LogEntry(time: Date(), text: text, tag: tag, color: color), at: 0)
        if log.count > Self.maxLogEntries { log.removeLast() }
    }

    func requestApproval(command: String, decide: @escaping (Bool) -> Void) {
        self.command = command
        pendingDecision = decide
        set(.ask, "Chờ bạn duyệt")
    }

    /// Only a person's click or key press reaches this; nothing in the app calls it on its own.
    func answer(_ allowed: Bool) {
        guard let decide = pendingDecision else { return }
        pendingDecision = nil
        decide(allowed)
    }
}
