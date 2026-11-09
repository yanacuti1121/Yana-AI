import SwiftUI
import AppKit

// The Fluent Blue icon set (MIT): 133 icons on a 24 px grid, 1.75 stroke, round caps and joins.
// Resources/icons.json maps each name to the markup inside the <svg>. Icons are rendered as template images,
// so they take the color you give them.
enum FBIcons {
	static let markup: [String: String] = {
		guard let url = Bundle.module.url(forResource: "icons", withExtension: "json"),
		      let data = try? Data(contentsOf: url),
		      let dict = try? JSONDecoder().decode([String: String].self, from: data) else { return [:] }
		return dict
	}()

	private static var cache: [String: NSImage] = [:]

	static func image(_ name: String) -> NSImage? {
		if let hit = cache[name] { return hit }
		guard let inner = markup[name] else { return nil }
		let body = inner.replacingOccurrences(of: "currentColor", with: "#000000")
		let svg = """
		<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="96" height="96" fill="none" stroke="#000000" \
		stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">\(body)</svg>
		"""
		guard let image = NSImage(data: Data(svg.utf8)) else { return nil }
		image.isTemplate = true
		cache[name] = image
		return image
	}
}

struct FBIcon: View {
	let name: String
	var size: CGFloat = 16
	var color: Color = FB.text

	var body: some View {
		if let image = FBIcons.image(name) {
			Image(nsImage: image)
				.renderingMode(.template)
				.resizable()
				.scaledToFit()
				.frame(width: size, height: size)
				.foregroundStyle(color)
		} else {
			Color.clear.frame(width: size, height: size)
		}
	}
}

// The Yana rabbit: the 20x15 pixel sprite from the notch prototype, drawn crisp with a dark outline.
struct RabbitLogo: View {
	var cell: CGFloat = 3
	private static let rows = [
		".....BB......CC.....", ".....BB......CC.....", ".....BI......IC.....", ".....BI......IC.....",
		"....WWWWWWWWWWWW....", "...WWWWWWWWWWWWWW...", "...WWEEWWWWWWEEWW...", "...WWWWWWWWWWWWWW...",
		"....WWWWWRRWWWWW....", ".....WWWWWWWWWW.....", "....LLLLLLLLLLLL....", "....LLLLLLLLLLLL....",
		"....LLLLLLLLLLLL....", "...DDDDDDDDDDDDDD...",
	]
	private static let hexes: [Character: UInt32] = [
		"B": 0x6D7CFF, "C": 0x35D0FF, "I": 0xDBE3FF, "W": 0xEEF2FF,
		"E": 0x1B2340, "R": 0xFF8FB1, "L": 0x9AA3B2, "D": 0x4A5470,
		"P": 0xEEF2FF, "K": 0x26305A,
	]

	private static func color(for ch: Character) -> Color? {
		if ch == "O" { return FB.primary }
		guard let hex = hexes[ch] else { return nil }
		return Color(hex: hex)
	}

	// 22 x 16 grid: one empty cell of margin around the sprite so the outline fits.
	private static let grid: [[Character]] = {
		var g = Array(repeating: Array(repeating: Character("."), count: 22), count: 16)
		for (y, row) in rows.enumerated() { for (x, ch) in row.enumerated() { g[y + 1][x + 1] = ch } }
		for x in [2, 3, 16, 17] { g[12][x + 1] = "P" }
		for x in [9, 10] { g[12][x + 1] = "O" }
		let snapshot = g
		func filled(_ y: Int, _ x: Int) -> Bool {
			guard y >= 0, y < 16, x >= 0, x < 22 else { return false }
			return snapshot[y][x] != "."
		}
		for y in 0..<16 {
			for x in 0..<22 where snapshot[y][x] == "." {
				if filled(y - 1, x) || filled(y + 1, x) || filled(y, x - 1) || filled(y, x + 1) { g[y][x] = "K" }
			}
		}
		return g
	}()

	var body: some View {
		Canvas { context, _ in
			for (y, row) in Self.grid.enumerated() {
				for (x, ch) in row.enumerated() {
					guard let color = Self.color(for: ch) else { continue }
					context.fill(Path(CGRect(x: CGFloat(x) * cell, y: CGFloat(y) * cell, width: cell, height: cell)), with: .color(color))
				}
			}
		}
		.frame(width: 22 * cell, height: 16 * cell)
		.accessibilityLabel("Yana")
	}
}

// The macOS app icon, drawn from RabbitLogo so the icon and the in-app mark never drift apart.
// .app is the light chat app; .studio is the dark IDE with a code badge, so the two never look alike in
// the Dock. 1024 x 1024 with Apple's icon grid: an 824 pt rounded square centred, room for the shadow.
struct AppIconArt: View {
	enum Variant: String { case app, studio }
	var variant: Variant
	private static let canvas: CGFloat = 1024
	private static let tile: CGFloat = 824
	private static let corner: CGFloat = 185
	private static let rabbitCell: CGFloat = 28 // 22 x 28 = 616 pt wide inside the 824 tile

	private var background: LinearGradient {
		switch variant {
		case .app: LinearGradient(colors: [Color(hex: 0xFFFFFF), Color(hex: 0xDCE9FD)], startPoint: .top, endPoint: .bottom)
		case .studio: LinearGradient(colors: [Color(hex: 0x1C2C4C), Color(hex: 0x0D1526)], startPoint: .top, endPoint: .bottom)
		}
	}

	var body: some View {
		ZStack {
			RoundedRectangle(cornerRadius: Self.corner, style: .continuous)
				.fill(background)
				.frame(width: Self.tile, height: Self.tile)
				.shadow(color: .black.opacity(0.28), radius: 18, y: 12)
			RabbitLogo(cell: Self.rabbitCell)
				.offset(y: variant == .studio ? -24 : 0)
			if variant == .studio { codeBadge.offset(x: 250, y: 250) }
		}
		.frame(width: Self.canvas, height: Self.canvas)
	}

	// "</>" on a Fluent Blue disc at the lower right: the one mark that says "the editor".
	private var codeBadge: some View {
		ZStack {
			Circle().fill(Color(hex: 0x1470F0)).frame(width: 260, height: 260)
				.overlay(Circle().stroke(Color(hex: 0x0D1526), lineWidth: 18))
			Text("</>").font(.system(size: 112, weight: .heavy, design: .rounded)).foregroundStyle(.white)
		}
	}
}
