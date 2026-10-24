import SwiftUI

/// A black pill whose top edge is flush with the screen and whose top corners flare
/// outwards in a concave curve, so it reads as one piece with the hardware notch.
/// The shape's rect includes the two ears: the visible body is `width - 2 * ear` wide.
struct NotchShape: Shape {
    var bottomRadius: CGFloat = 18
    var ear: CGFloat = 10

    var animatableData: CGFloat {
        get { bottomRadius }
        set { bottomRadius = newValue }
    }

    func path(in rect: CGRect) -> Path {
        var p = Path()
        let w = rect.width, h = rect.height
        p.move(to: CGPoint(x: 0, y: 0))
        p.addQuadCurve(to: CGPoint(x: ear, y: ear), control: CGPoint(x: ear, y: 0))
        p.addLine(to: CGPoint(x: ear, y: h - bottomRadius))
        p.addQuadCurve(to: CGPoint(x: ear + bottomRadius, y: h), control: CGPoint(x: ear, y: h))
        p.addLine(to: CGPoint(x: w - ear - bottomRadius, y: h))
        p.addQuadCurve(to: CGPoint(x: w - ear, y: h - bottomRadius), control: CGPoint(x: w - ear, y: h))
        p.addLine(to: CGPoint(x: w - ear, y: ear))
        p.addQuadCurve(to: CGPoint(x: w, y: 0), control: CGPoint(x: w - ear, y: 0))
        p.closeSubpath()
        return p
    }
}
