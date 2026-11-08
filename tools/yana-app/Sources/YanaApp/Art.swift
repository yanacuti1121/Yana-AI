import SwiftUI

// Soft blue artwork: translucent ribbons that sweep in from the right (Fluent Blue's "waves"), drawn from the tokens.

struct Waves: View {
	var ribbons = 9

	var body: some View {
		Canvas { context, size in
			let w = size.width, h = size.height
			for index in 0..<ribbons {
				let t = Double(index) / Double(max(1, ribbons - 1))
				let i = Double(index)
				var path = Path()
				path.move(to: CGPoint(x: w * (0.96 - 0.42 * t), y: -2))
				path.addCurve(
					to: CGPoint(x: w * (0.42 + 0.50 * t), y: h + 2),
					control1: CGPoint(x: w * (0.30 + 0.30 * t), y: h * (0.12 + 0.34 * t)),
					control2: CGPoint(x: w * (1.08 - 0.46 * t), y: h * (0.34 + 0.22 * t)))
				path.addLine(to: CGPoint(x: w + 2, y: h + 2))
				path.addLine(to: CGPoint(x: w + 2, y: -2))
				path.closeSubpath()
				let gradient: Gradient = index % 2 == 1
					? Gradient(colors: [FB.ramp100.opacity(0.30), FB.ramp500.opacity(0.34 + 0.05 * i)])
					: Gradient(colors: [FB.ramp300.opacity(0.30 + 0.04 * i), FB.ramp700.opacity(0.26 + 0.06 * i)])
				context.fill(path, with: .linearGradient(gradient, startPoint: CGPoint(x: w * 0.2, y: 0), endPoint: CGPoint(x: w, y: h)))
				context.stroke(path, with: .color(.white.opacity(0.21)), lineWidth: 1)
			}
		}
	}
}

// The Overview banner: a soft blue field with ribbons on the right.
struct HeroBackdrop: View {
	var body: some View {
		GeometryReader { geo in
			ZStack(alignment: .trailing) {
				LinearGradient(colors: [Color(hex: 0xE6F4FF), Color(hex: 0x91CAFF)], startPoint: .topLeading, endPoint: .bottomTrailing)
				Waves().frame(width: geo.size.width * 0.58)
			}
		}
	}
}

// The small card at the bottom of the rail, with ribbons along its bottom edge.
struct PromoBackdrop: View {
	var body: some View {
		GeometryReader { geo in
			ZStack(alignment: .bottom) {
				LinearGradient(colors: [Color(hex: 0x4096FF).opacity(0.55), FB.ramp700.opacity(0.75)], startPoint: .topLeading, endPoint: .bottomTrailing)
				Waves(ribbons: 5).frame(height: geo.size.height * 0.58)
			}
		}
	}
}
