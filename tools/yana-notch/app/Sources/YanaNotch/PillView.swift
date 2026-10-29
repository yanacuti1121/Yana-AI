import SwiftUI

/// Pill geometry for each state. The ears are part of the width (see NotchShape).
enum PillSize {
    static let ear: CGFloat = 10

    /// Room on each side of the hardware notch for the rabbit (left) and the dots (right).
    static let wing: CGFloat = 46

    /// `base` is the hardware notch (ears included), so the collapsed pill adds a wing on
    /// each side: anything drawn inside the notch itself would be hidden by the screen.
    static func size(for state: PillState, hovering: Bool, base: CGSize) -> CGSize {
        let collapsed = base.width + 2 * wing
        if state == .ask { return CGSize(width: max(collapsed, 340), height: 110) }
        if hovering { return CGSize(width: max(collapsed, 340), height: 160) }
        return CGSize(width: collapsed, height: base.height)
    }
}

struct PillView: View {
    @ObservedObject var model: PillModel
    let pending: PendingItem?
    let baseHeight: CGFloat

    private static let clock: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "HH:mm:ss"
        return f
    }()

    var body: some View {
        TimelineView(.periodic(from: .now, by: 0.2)) { timeline in
            let tick = Int(timeline.date.timeIntervalSinceReferenceDate / 0.2)
            ZStack(alignment: .top) {
                NotchShape(ear: PillSize.ear).fill(.black)
                VStack(spacing: 0) {
                    header(tick: tick)
                    if model.state == .ask || model.hovering {
                        statusLine
                    }
                    if model.state == .ask, let pending { askBody(pending, now: timeline.date) }
                    else if model.hovering { logBody }
                }
                .padding(.horizontal, PillSize.ear + 14)
            }
        }
        .onHover { model.hovering = $0 }
    }

    private func header(tick: Int) -> some View {
        // The middle of this row sits behind the hardware notch, so it stays empty.
        HStack {
            RabbitView(state: model.state, tick: tick)
            Spacer(minLength: 0)
            DotMatrix(state: model.state, tick: tick)
        }
        .frame(height: baseHeight)
    }

    /// What is happening, in words. Shown only when the pill is open below the notch row.
    private var statusLine: some View {
        HStack(spacing: 6) {
            Text(model.subtitle).font(.system(size: 12, weight: .semibold)).foregroundColor(.white).lineLimit(2)
            Spacer(minLength: 0)
        }
        .padding(.bottom, 2)
    }

    private func askBody(_ item: PendingItem, now: Date) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(item.capability).font(.system(size: 12, weight: .semibold, design: .monospaced)).foregroundColor(.white)
            Text(item.reason).font(.system(size: 11)).foregroundColor(Color(white: 0.7)).lineLimit(2)
            let left = max(0, Int(item.expiresAt.timeIntervalSince(now)))
            Text("Duyệt ở terminal · hết hạn sau \(left / 60):\(String(format: "%02d", left % 60))")
                .font(.system(size: 10)).foregroundColor(PillState.ask.tint)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 2)
    }

    private var logBody: some View {
        VStack(alignment: .leading, spacing: 4) {
            if model.log.isEmpty {
                Text("Chưa có hoạt động").font(.system(size: 11)).foregroundColor(Color(white: 0.5))
            }
            ForEach(model.log) { entry in
                HStack(spacing: 8) {
                    RoundedRectangle(cornerRadius: 2).fill(entry.color).frame(width: 7, height: 7)
                    Text(Self.clock.string(from: entry.time)).font(.system(size: 10, design: .monospaced))
                        .foregroundColor(Color(white: 0.5))
                    Text(entry.text).font(.system(size: 11)).foregroundColor(.white).lineLimit(1)
                    Spacer(minLength: 0)
                    Text(entry.tag).font(.system(size: 9, weight: .bold)).foregroundColor(entry.color)
                }
            }
        }
        .padding(.top, 4)
    }
}
