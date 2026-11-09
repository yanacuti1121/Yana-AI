import SwiftUI

// The picture behind the install window of Yana-<version>.dmg (`YanaApp --dmg-background out.png`, 2x).
// 640 x 420 pt, Finder places Yana.app at (160, 200) and the Applications link at (480, 200) on top of it
// (package.sh), so the arrow and the two pedestals below line up with those icons.
struct DmgBackground: View {
	static let size = CGSize(width: 640, height: 420)
	static let appCenter = CGPoint(x: 160, y: 200)
	static let applicationsCenter = CGPoint(x: 480, y: 200)
	private static let pedestal: CGFloat = 150
	private static let blue = Color(hex: 0x1470F0)
	private static let ink = Color(hex: 0x1B2340)
	private static let muted = Color(hex: 0x5B6478)

	var body: some View {
		ZStack(alignment: .topLeading) {
			LinearGradient(colors: [Color(hex: 0xFFFFFF), Color(hex: 0xEAF2FE)], startPoint: .top, endPoint: .bottom)
			header.frame(width: Self.size.width).offset(y: 28)
			pedestal(at: Self.appCenter)
			pedestal(at: Self.applicationsCenter)
			arrow.position(x: 320, y: Self.appCenter.y)
			footer.frame(width: Self.size.width).offset(y: 352)
		}
		.frame(width: Self.size.width, height: Self.size.height)
	}

	private var header: some View {
		VStack(spacing: 6) {
			HStack(spacing: 10) {
				RabbitLogo(cell: 1.6)
				Text("Yana").font(.system(size: 26, weight: .bold)).foregroundStyle(Self.ink)
			}
			Text("Kéo Yana vào Applications để cài  ·  Drag Yana to Applications")
				.font(.system(size: 12, weight: .medium)).foregroundStyle(Self.muted)
		}
	}

	private func pedestal(at center: CGPoint) -> some View {
		Circle()
			.fill(Color.white)
			.overlay(Circle().stroke(Self.blue.opacity(0.18), lineWidth: 1.5))
			.shadow(color: Self.blue.opacity(0.12), radius: 14, y: 6)
			.frame(width: Self.pedestal, height: Self.pedestal)
			.position(center)
	}

	private var arrow: some View {
		HStack(spacing: 0) {
			Capsule().fill(Self.blue).frame(width: 96, height: 6)
			Image(systemName: "arrowtriangle.right.fill").font(.system(size: 22)).foregroundStyle(Self.blue)
				.offset(x: -4)
		}
	}

	// The app is not signed with a Developer ID, so the first open needs one extra step.
	private var footer: some View {
		VStack(spacing: 3) {
			Text("Lần đầu mở: chuột phải vào Yana trong Applications, chọn Mở.")
			Text("First launch: right-click Yana in Applications and choose Open.")
		}
		.font(.system(size: 11)).foregroundStyle(Self.muted)
	}
}
