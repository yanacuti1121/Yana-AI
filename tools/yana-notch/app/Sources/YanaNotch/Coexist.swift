import CoreGraphics
import Foundation

/// Where Yana draws its status. Two notch apps on the same spot would fight over the mouse and
/// paint over each other, so when another one is there Yana steps out to the menu bar.
enum Placement: Equatable {
    case notch, menuBar
}

/// `auto` yields to another overlay, `notch` always draws on the notch, `menubar` never does.
enum PlacementMode: String {
    case auto, notch, menubar

    init(_ raw: String?) { self = raw.flatMap(PlacementMode.init(rawValue:)) ?? .auto }

    func placement(othersPresent: Bool) -> Placement {
        switch self {
        case .auto: return othersPresent ? .menuBar : .notch
        case .notch: return .notch
        case .menubar: return .menuBar
        }
    }
}

/// Finds other apps' windows sitting where the notch pill would be. It looks at where windows are,
/// not at a list of app names, so it also catches notch apps nobody has listed yet. The window
/// list gives owner, level and position without asking for the Screen Recording permission.
enum OverlayProbe {
    /// The system's own menu bar, Control Center and so on live up there too.
    static let systemOwners: Set<String> = ["Window Server", "SystemUIServer", "Control Center",
                                            "Notification Center", "Dock", "Spotlight"]
    /// Menu bar level is 24 and the status level 25; overlays that float over the notch sit at or above it.
    static let minLayer = 24
    static let minOverlapWidth: CGFloat = 20
    /// Windows nearly as wide as the screen are full-screen backdrops, not a notch pill.
    static let fullWidthShare: CGFloat = 0.9

    /// `zone` is in screen coordinates with the origin at the top-left, like the window list.
    static func others(in zone: CGRect, screenWidth: CGFloat, ownPid: Int32) -> [String] {
        guard let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as? [[String: Any]] else { return [] }
        var owners: [String] = []
        for window in list {
            guard let pid = window[kCGWindowOwnerPID as String] as? Int32, pid != ownPid,
                  let owner = window[kCGWindowOwnerName as String] as? String, !systemOwners.contains(owner),
                  let layer = window[kCGWindowLayer as String] as? Int, layer >= minLayer,
                  (window[kCGWindowAlpha as String] as? Double ?? 1) > 0,
                  let dict = window[kCGWindowBounds as String] as? NSDictionary,
                  let bounds = CGRect(dictionaryRepresentation: dict as CFDictionary),
                  bounds.width < screenWidth * fullWidthShare else { continue }
            if bounds.intersection(zone).width >= minOverlapWidth, !owners.contains(owner) { owners.append(owner) }
        }
        return owners
    }
}
