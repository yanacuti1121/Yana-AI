import SwiftUI

// First-run guide, laid out like OneNotch's: a card with an illustration on top, a small badge, a big title,
// one short paragraph, page dots and a pill "Next" button; the last page says "Got it". Shown once at the
// first launch, and again from Settings or the Help menu. Illustrations are drawn here from Yana's icons,
// so the guide needs no image files.

struct TourPage: Identifiable {
	let id: String
	let icons: [String]
	var badge: String? = nil
}

enum OnboardingTour {
	static let seenKey = "yana.onboarding.seen"
	static let pages: [TourPage] = [
		TourPage(id: "welcome", icons: ["message", "shield", "terminal"]),
		TourPage(id: "models", icons: ["cpu", "key", "download"]),
		TourPage(id: "approve", icons: ["key", "shield", "check"]),
		TourPage(id: "tools", icons: ["terminal", "globe", "code"]),
		TourPage(id: "memory", icons: ["bookmark", "folder", "download"], badge: "tour.new"),
	]

	static var shouldShowAtLaunch: Bool { !UserDefaults.standard.bool(forKey: seenKey) }
	static func markSeen() { UserDefaults.standard.set(true, forKey: seenKey) }
}

struct OnboardingTourView: View {
	let close: () -> Void
	@State private var index = 0
	private var page: TourPage { OnboardingTour.pages[index] }
	private var isLast: Bool { index == OnboardingTour.pages.count - 1 }

	var body: some View {
		VStack(alignment: .leading, spacing: 0) {
			TourArt(icons: page.icons)
				.frame(height: 250)
				.id(page.id)
				.transition(.opacity)
			VStack(alignment: .leading, spacing: 12) {
				Text(L(page.badge ?? "tour.step")).font(.system(size: 11, weight: .bold))
					.foregroundStyle(FB.primaryText)
					.padding(.horizontal, 10).padding(.vertical, 4)
					.background(Capsule().fill(FB.primarySubtle))
				Text(L("tour.\(page.id).title")).font(.system(size: 28, weight: .bold)).foregroundStyle(FB.text)
				Text(L("tour.\(page.id).body")).font(.system(size: 14)).foregroundStyle(FB.textSecondary)
					.fixedSize(horizontal: false, vertical: true)
					.frame(minHeight: 60, alignment: .topLeading)
				HStack(alignment: .center) {
					dots
					Spacer()
					if index > 0 {
						Button(L("tour.back")) { withAnimation(.easeOut(duration: 0.2)) { index -= 1 } }
							.buttonStyle(.plain).foregroundStyle(FB.textSecondary).padding(.trailing, 8)
					}
					Button(action: next) {
						HStack(spacing: 6) {
							Text(L(isLast ? "tour.done" : "tour.next"))
							if !isLast { Image(systemName: "arrow.right") }
						}
						.font(.system(size: 14, weight: .semibold)).foregroundStyle(FB.onPrimary)
						.padding(.horizontal, 20).frame(height: 40)
						.background(Capsule().fill(FB.primary))
					}
					.buttonStyle(.plain)
					.keyboardShortcut(.defaultAction)
				}
			}
			.padding(EdgeInsets(top: 22, leading: 28, bottom: 24, trailing: 24))
		}
		.frame(width: 560)
		.background(FB.canvas)
		.overlay(alignment: .topTrailing) {
			Button(action: finish) { Image(systemName: "xmark").font(.system(size: 12, weight: .semibold)) }
				.buttonStyle(.plain).foregroundStyle(FB.textSecondary)
				.frame(width: 28, height: 28).background(Circle().fill(.white.opacity(0.85)))
				.padding(12).help(L("tour.skip"))
		}
	}

	private var dots: some View {
		HStack(spacing: 6) {
			ForEach(OnboardingTour.pages.indices, id: \.self) { i in
				Capsule().fill(i == index ? FB.text : FB.borderStrong)
					.frame(width: i == index ? 22 : 7, height: 7)
			}
		}
		.animation(.easeOut(duration: 0.2), value: index)
	}

	private func next() {
		if isLast { finish() } else { withAnimation(.easeOut(duration: 0.25)) { index += 1 } }
	}

	private func finish() {
		OnboardingTour.markSeen()
		close()
	}
}

// Soft blue backdrop with vertical light streaks (as in OneNotch) and the page's icons on floating tiles.
private struct TourArt: View {
	// Static on purpose: a repeating animation here leaked into the whole sheet and made the buttons bob.
	let icons: [String]
	private static let streaks: [(x: CGFloat, w: CGFloat, o: Double)] =
		[(0.06, 18, 0.5), (0.14, 8, 0.35), (0.22, 26, 0.45), (0.78, 22, 0.45), (0.86, 10, 0.35), (0.94, 16, 0.5)]

	var body: some View {
		GeometryReader { geo in
			ZStack {
				LinearGradient(colors: [FB.primarySubtleHover, FB.primarySubtle, FB.canvas], startPoint: .top, endPoint: .bottom)
				ForEach(Self.streaks.indices, id: \.self) { i in
					let s = Self.streaks[i]
					Capsule()
						.fill(LinearGradient(colors: [.white.opacity(s.o), FB.primary.opacity(0.18), .clear],
						                     startPoint: .top, endPoint: .bottom))
						.frame(width: s.w, height: geo.size.height * 1.2)
						.position(x: geo.size.width * s.x, y: geo.size.height * 0.5)
				}
				HStack(spacing: 18) {
					ForEach(Array(icons.enumerated()), id: \.offset) { i, icon in
						let main = i == 1
						FBIcon(name: icon, size: main ? 40 : 26, color: main ? FB.onPrimary : FB.primary)
							.frame(width: main ? 96 : 68, height: main ? 96 : 68)
							.background(RoundedRectangle(cornerRadius: main ? 26 : 20).fill(main ? FB.primary : .white))
							.shadow(color: FB.primary.opacity(0.18), radius: 14, y: 6)
					}
				}
			}
		}
		.clipped()
	}
}
