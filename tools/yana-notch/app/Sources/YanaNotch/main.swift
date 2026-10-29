import AppKit
import Combine
import SwiftUI

/// Read-only companion: shows what yana-rt is waiting on and the last audit entries.
/// Usage: YanaNotch [project-root]   (default: current directory, or YANA_NOTCH_ROOT)
@MainActor
final class NotchController: NSObject, NSApplicationDelegate {
    static let pollSeconds: TimeInterval = 2
    static let activeWindow: TimeInterval = 5  // an audit entry newer than this counts as "running"

    let model = PillModel()
    let root: URL
    var pending: PendingItem?
    var panel: NSPanel!
    var host: NSHostingView<PillView>!
    var bag = Set<AnyCancellable>()
    var base = CGSize(width: 220, height: 37)

    /// Changing place takes this many polls in a row to agree, so a window that flashes past
    /// (Spotlight, a screenshot preview) does not make the pill jump.
    static let placementAgreeing = 2
    static let statusAutosave = "YanaNotchStatus"
    static let statusPreferredPosition: CGFloat = 330  // points from the right edge of the screen; measured, see notes
    let mode = PlacementMode(ProcessInfo.processInfo.environment["YANA_NOTCH_MODE"])
    var placement: Placement?
    var wanted: Placement?
    var wantedStreak = 0
    var others: [String] = []
    var statusItem: NSStatusItem?

    init(root: URL) {
        self.root = root
        super.init()
    }

    func applicationDidFinishLaunching(_ note: Notification) {
        measureNotch()
        panel = NSPanel(contentRect: .zero, styleMask: [.borderless, .nonactivatingPanel],
                        backing: .buffered, defer: false)
        panel.level = .statusBar
        panel.backgroundColor = .clear
        panel.isOpaque = false
        panel.hasShadow = false
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
        rebuildContent()
        model.$state.combineLatest(model.$hovering).receive(on: RunLoop.main)
            .sink { [weak self] _ in self?.layout() }.store(in: &bag)
        layout()
        // Nothing is shown until the first poll has looked for another notch app.
        poll()
        Timer.scheduledTimer(withTimeInterval: Self.pollSeconds, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.poll() }
        }
    }

    func rebuildContent() {
        host = NSHostingView(rootView: PillView(model: model, pending: pending, baseHeight: base.height))
        panel.contentView = host
    }

    /// On a notched Mac the pill starts exactly as wide as the notch.
    func measureNotch() {
        guard let screen = NSScreen.main else { return }
        let inset = screen.safeAreaInsets.top
        guard inset > 0, let left = screen.auxiliaryTopLeftArea, let right = screen.auxiliaryTopRightArea else { return }
        base = CGSize(width: screen.frame.width - left.width - right.width + 2 * PillSize.ear, height: inset)
    }

    func layout() {
        guard let screen = NSScreen.main else { return }
        let size = PillSize.size(for: model.state, hovering: model.hovering, base: base)
        panel.setFrame(NSRect(x: screen.frame.midX - size.width / 2, y: screen.frame.maxY - size.height,
                              width: size.width, height: size.height), display: true, animate: false)
    }

    /// The strip of screen the collapsed pill would cover, in top-left window-list coordinates.
    func notchZone() -> (zone: CGRect, screenWidth: CGFloat) {
        guard let screen = NSScreen.main else { return (.zero, 0) }
        let width = PillSize.size(for: .idle, hovering: false, base: base).width
        return (CGRect(x: screen.frame.midX - width / 2, y: 0, width: width, height: base.height), screen.frame.width)
    }

    func poll() {
        let root = self.root
        let (zone, screenWidth) = notchZone()
        let pid = ProcessInfo.processInfo.processIdentifier
        DispatchQueue.global(qos: .utility).async {
            let others = OverlayProbe.others(in: zone, screenWidth: screenWidth, ownPid: pid)
            if ProcessInfo.processInfo.environment["YANA_NOTCH_DEBUG"] != nil {
                FileHandle.standardError.write(Data("others=\(others)\n".utf8))
            }
            let snapshot = StatusFeed(root: root).read()
            DispatchQueue.main.async { MainActor.assumeIsolated { self.apply(snapshot, others) } }
        }
    }

    func choosePlacement(_ others: [String]) {
        self.others = others
        let target = mode.placement(othersPresent: !others.isEmpty)
        guard let current = placement else { show(target); return }  // first look: decide at once
        if target == current { wanted = nil; wantedStreak = 0; return }
        wantedStreak = (wanted == target) ? wantedStreak + 1 : 1
        wanted = target
        if wantedStreak >= Self.placementAgreeing { show(target) }
    }

    func show(_ target: Placement) {
        placement = target
        wanted = nil
        wantedStreak = 0
        switch target {
        case .notch:
            if let item = statusItem { NSStatusBar.system.removeStatusItem(item); statusItem = nil }
            panel.orderFrontRegardless()
        case .menuBar:
            panel.orderOut(nil)
            if statusItem == nil {
                // A new item lands at the left end of the right-hand group, which is exactly where a
                // wide transparent notch overlay sits. Asking for a place nearer the right edge keeps it clear.
                // The key is the one the system itself writes when a person drags an item; it is not a public API.
                let key = "NSStatusItem Preferred Position \(Self.statusAutosave)"
                if UserDefaults.standard.object(forKey: key) == nil {
                    UserDefaults.standard.set(Self.statusPreferredPosition, forKey: key)
                }
                let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
                item.autosaveName = Self.statusAutosave
                statusItem = item
            }
        }
    }

    /// The menu bar form of the same status: a coloured dot, the sentence as tooltip, details in a menu.
    func refreshStatusItem(pending: [PendingItem]) {
        guard placement == .menuBar, let button = statusItem?.button else { return }
        let dot = NSAttributedString(string: "● ", attributes: [.foregroundColor: NSColor(model.state.tint)])
        let title = NSMutableAttributedString(attributedString: dot)
        title.append(NSAttributedString(string: "Yana"))
        button.attributedTitle = title
        button.toolTip = model.subtitle
        let menu = NSMenu()
        menu.addItem(withTitle: model.subtitle, action: nil, keyEquivalent: "")
        for item in pending {
            menu.addItem(withTitle: "Chờ duyệt: \(item.capability) (duyệt ở terminal)", action: nil, keyEquivalent: "")
        }
        if mode == .auto, !others.isEmpty {
            menu.addItem(withTitle: "Đang nhường notch cho \(others.joined(separator: ", "))", action: nil, keyEquivalent: "")
        }
        menu.addItem(.separator())
        menu.addItem(withTitle: "Thoát Yana Notch", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        statusItem?.menu = menu
    }

    /// The headline state is decided once, in `yana-rt status`; this only chooses colour and words.
    func apply(_ snapshot: StatusSnapshot?, _ others: [String]) {
        choosePlacement(others)
        let waiting = snapshot?.approvals ?? []
        defer { refreshStatusItem(pending: waiting) }
        model.setLog((snapshot?.audit ?? []).map { line in
            let color: Color = line.isDeny ? PillState.deny.tint : (line.decision.lowercased() == "allow" ? PillState.run.tint : PillState.idle.tint)
            return LogEntry(time: line.time, text: line.tool, tag: line.decision.uppercased(), color: color)
        })
        let first = waiting.first
        if first != pending {
            pending = first
            rebuildContent()
        }
        guard let snapshot else { model.set(.idle, "Không đọc được yana-rt status"); return }
        switch snapshot.state {
        case "halted": model.set(.deny, "Giám Thị đã dừng hệ thống")
        case "ask": model.set(.ask, "Chờ duyệt" + (waiting.count > 1 ? " (+\(waiting.count - 1))" : ""))
        case "deny": model.set(.deny, "Vừa chặn: \(snapshot.audit?.first?.tool ?? "?")")
        case "run": model.set(.run, "Đang chạy: \(EngineLabel.text(snapshot.engines ?? []))")
        case "idle": model.set(.idle, "Không có phiên nào đang chạy")
        default: model.set(.idle, "Chưa rõ trạng thái (một nguồn không đọc được)")
        }
        if ProcessInfo.processInfo.environment["YANA_NOTCH_DEBUG"] != nil {
            FileHandle.standardError.write(Data("state=\(snapshot.state) place=\(placement.map { "\($0)" } ?? "?") others=\(others) subtitle=\(model.subtitle) pending=\(waiting.count)\n".utf8))
        }
    }
}

let env = ProcessInfo.processInfo.environment
let argRoot = CommandLine.arguments.dropFirst().first
let rootPath = argRoot ?? env["YANA_NOTCH_ROOT"] ?? FileManager.default.currentDirectoryPath
MainActor.assumeIsolated {
    let app = NSApplication.shared
    let controller = NotchController(root: URL(fileURLWithPath: rootPath))
    app.setActivationPolicy(.accessory)
    app.delegate = controller
    app.run()
}
