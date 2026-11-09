import AppKit
import SwiftUI

// Building blocks of the App Store-style plugin page: app icon tile, card, featured card, horizontal row,
// detail sheet, and the source manager. The catalogs carry no logos, so each item gets a colour tile with
// its initials (colour fixed by its name, so it stays the same between launches).

enum StoreStyle {
	// Pairs of (deep, light) colours; white initials on the deep end keep at least 4.5:1.
	static let tileHex: [UInt32] = [0x1470F0, 0x69B1FF, 0x7B61FF, 0xB9A8FF, 0x0E9F6E, 0x6EE7B7, 0xE8590C, 0xFFB37A,
	                                0xD6336C, 0xF7A1C4, 0x0B7285, 0x66D9E8, 0x5C6BC0, 0x9FA8DA, 0x2F9E44, 0x8CE99A]

	static func colors(for name: String) -> (Color, Color) {
		let hash = name.unicodeScalars.reduce(UInt32(5381)) { ($0 &* 33) &+ $1.value }
		let pair = Int(hash % UInt32(tileHex.count / 2)) * 2
		return (Color(hex: tileHex[pair]), Color(hex: tileHex[pair + 1]))
	}

	static func initials(_ name: String) -> String {
		let words = name.split(whereSeparator: { !$0.isLetter && !$0.isNumber })
		let letters = words.prefix(2).compactMap(\.first)
		return String(letters.isEmpty ? Array(name.prefix(1)) : letters).uppercased()
	}

	static func sourceColor(_ kind: StoreFeed.Kind) -> Color {
		switch kind {
		case .marketplace: return Color(hex: 0xB4532F)  // Claude orange, darkened for text contrast
		case .mcpRegistry: return FB.primaryText
		case .awesomeList: return Color(hex: 0x0B7A5E) // ChatGPT green, darkened for text contrast
		}
	}
}

struct AppIconTile: View {
	let name: String
	var size: CGFloat = 56

	var body: some View {
		let (top, bottom) = StoreStyle.colors(for: name)
		RoundedRectangle(cornerRadius: size * 0.23, style: .continuous)
			.fill(LinearGradient(colors: [bottom, top], startPoint: .topLeading, endPoint: .bottomTrailing))
			.frame(width: size, height: size)
			.overlay(Text(StoreStyle.initials(name)).font(.system(size: size * 0.36, weight: .bold, design: .rounded)).foregroundStyle(.white))
			.shadow(color: top.opacity(0.25), radius: size * 0.08, y: size * 0.04)
	}
}

struct SourceBadge: View {
	let item: StoreItem
	var body: some View {
		Text(item.feedLabel).font(.system(size: 10, weight: .semibold))
			.foregroundStyle(StoreStyle.sourceColor(item.kind))
			.padding(.horizontal, 7).padding(.vertical, 2)
			.background(Capsule().fill(StoreStyle.sourceColor(item.kind).opacity(0.12)))
	}
}

// Compact card used in rows and grids: icon, name, one line, source, "View".
struct StoreCard: View {
	let item: StoreItem
	let open: () -> Void
	@State private var hover = false

	var body: some View {
		HStack(alignment: .center, spacing: 12) {
			AppIconTile(name: item.name, size: 52)
			VStack(alignment: .leading, spacing: 3) {
				Text(item.name).font(.fbBodyMedium).foregroundStyle(FB.text).lineLimit(1)
				Text(item.summary).font(.fbCaption).foregroundStyle(FB.textSecondary).lineLimit(2)
				SourceBadge(item: item)
			}
			Spacer(minLength: 6)
			Text(L("store.view")).font(.system(size: 12, weight: .semibold)).foregroundStyle(FB.primaryText)
				.padding(.horizontal, 12).padding(.vertical, 5)
				.background(Capsule().fill(FB.primarySubtle))
		}
		.padding(10)
		.frame(height: 84)
		.background(RoundedRectangle(cornerRadius: 14).fill(hover ? FB.hoverOnCanvas : FB.canvas))
		.contentShape(Rectangle())
		.onHover { hover = $0 }
		.onTapGesture(perform: open)
	}
}

// Large card for the featured band at the top of Discover.
struct FeaturedCard: View {
	let item: StoreItem
	let eyebrow: String
	let open: () -> Void

	var body: some View {
		let (top, bottom) = StoreStyle.colors(for: item.name)
		VStack(alignment: .leading, spacing: 10) {
			Text(eyebrow.uppercased()).font(.system(size: 11, weight: .bold)).foregroundStyle(.white.opacity(0.85))
			Text(item.name).font(.system(size: 22, weight: .bold)).foregroundStyle(.white).lineLimit(1)
			Text(item.summary).font(.fbBody).foregroundStyle(.white.opacity(0.9)).lineLimit(3)
			Spacer(minLength: 0)
			HStack {
				AppIconTile(name: item.name, size: 40)
				Text(item.feedLabel).font(.fbCaption).foregroundStyle(.white.opacity(0.9))
				Spacer()
				Text(L("store.view")).font(.system(size: 12, weight: .bold)).foregroundStyle(top)
					.padding(.horizontal, 14).padding(.vertical, 6).background(Capsule().fill(.white))
			}
		}
		.padding(18)
		.frame(width: 340, height: 210, alignment: .topLeading)
		.background(RoundedRectangle(cornerRadius: 18, style: .continuous)
			.fill(LinearGradient(colors: [top, bottom], startPoint: .topLeading, endPoint: .bottomTrailing)))
		.contentShape(Rectangle())
		.onTapGesture(perform: open)
	}
}

// A titled shelf of cards that scrolls sideways, with "See all".
struct StoreShelf: View {
	let title: String
	let items: [StoreItem]
	let seeAll: () -> Void
	let open: (StoreItem) -> Void

	var body: some View {
		VStack(alignment: .leading, spacing: 8) {
			HStack {
				Text(title).font(.system(size: 18, weight: .bold)).foregroundStyle(FB.text)
				Spacer()
				Button(L("store.seeAll"), action: seeAll).buttonStyle(.plain).foregroundStyle(FB.primaryText).font(.fbBodyMedium)
			}
			ScrollView(.horizontal, showsIndicators: false) {
				LazyHGrid(rows: [GridItem(.fixed(84)), GridItem(.fixed(84))], spacing: 12) {
					ForEach(items) { item in StoreCard(item: item) { open(item) }.frame(width: 330) }
				}
			}
			.frame(height: 180)
		}
	}
}
