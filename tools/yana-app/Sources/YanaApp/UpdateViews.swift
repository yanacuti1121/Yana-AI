import AppKit
import SwiftUI

// Update UI modelled on the macOS update window anh pointed to (BetterDisplay, which uses Sparkle's
// layout): app icon, "a new version is ready", release notes in a scrolling box, then Skip this version /
// Remind me later / Download. While downloading, the same sheet shows a progress bar; when done, one
// button opens the download. A small "Update" pill on the rail keeps the offer reachable after "Later".

struct UpdateSheet: View {
	@ObservedObject var updater: AppUpdater

	var body: some View {
		VStack(alignment: .leading, spacing: 14) {
			HStack(alignment: .top, spacing: 14) {
				Image(nsImage: NSApplication.shared.applicationIconImage)
					.resizable().frame(width: 56, height: 56)
				VStack(alignment: .leading, spacing: 4) {
					Text(L(updater.phase == .idle ? "upd.upToDate" : "upd.title")).font(.fbHeading5).foregroundStyle(FB.text)
					Text(subtitle).font(.fbBody).foregroundStyle(FB.textSecondary)
						.fixedSize(horizontal: false, vertical: true)
				}
			}
			content
		}
		.padding(20)
		.frame(width: 520)
		.background(FB.canvas)
	}

	private var release: AppUpdater.Release? {
		if case .available(let release) = updater.phase { return release }
		return lastRelease
	}

	@State private var lastRelease: AppUpdater.Release?

	private var subtitle: String {
		let installed = AppUpdater.installedVersion ?? "?"
		guard let release else { return "\(L("upd.current")) \(installed)" }
		return String(format: L("upd.subtitle"), release.version, installed)
	}

	@ViewBuilder
	private var content: some View {
		switch updater.phase {
		case .available(let release):
			NotesBox(notes: release.notes)
			HStack {
				FBButton(title: L("upd.skip"), variant: .ghost) { updater.skip(release) }
				Spacer()
				FBButton(title: L("upd.later"), variant: .secondary) { updater.later() }
				FBButton(title: L(release.asset == nil ? "upd.openPage" : "upd.download"), variant: .primary) {
					lastRelease = release
					updater.download(release)
				}
			}
		case .downloading(let fraction):
			VStack(alignment: .leading, spacing: 8) {
				Text(L("upd.downloading")).font(.fbBodyMedium).foregroundStyle(FB.text)
				ProgressView(value: fraction).tint(FB.primary)
				Text("\(Int(fraction * 100))%").font(.fbCaption).foregroundStyle(FB.textSecondary)
			}
			.transition(.opacity)
		case .downloaded(let file):
			Text(L("upd.ready")).font(.fbBody).foregroundStyle(FB.text)
				.fixedSize(horizontal: false, vertical: true)
			HStack {
				Spacer()
				FBButton(title: L("upd.later"), variant: .secondary) { updater.later() }
				FBButton(title: L("upd.open"), variant: .primary) { updater.openDownload(file) }
			}
		case .failed(let why):
			Text("\(L("upd.failed")): \(why)").font(.fbBody).foregroundStyle(FB.errorText)
			HStack {
				Spacer()
				FBButton(title: L("upd.close"), variant: .secondary) { updater.later() }
				FBButton(title: L("rt.recheck"), variant: .primary) { Task { await updater.check(userAsked: true) } }
			}
		case .idle:
			HStack {
				Spacer()
				FBButton(title: L("upd.close"), variant: .primary) { updater.later() }
			}
		}
	}
}

// Release notes (GitHub Markdown) shown as styled text in a bordered, scrolling box.
struct NotesBox: View {
	let notes: String

	var body: some View {
		ScrollView {
			Text(attributed).font(.fbBody).foregroundStyle(FB.text)
				.frame(maxWidth: .infinity, alignment: .leading)
				.textSelection(.enabled)
				.padding(12)
		}
		.frame(height: 200)
		.background(RoundedRectangle(cornerRadius: FB.radiusLG).fill(FB.surfaceSecondary))
		.overlay(RoundedRectangle(cornerRadius: FB.radiusLG).stroke(FB.border, lineWidth: 1))
	}

	private var attributed: AttributedString {
		let text = notes.isEmpty ? L("upd.noNotes") : notes
		let options = AttributedString.MarkdownParsingOptions(interpretedSyntax: .inlineOnlyPreservingWhitespace)
		return (try? AttributedString(markdown: text, options: options)) ?? AttributedString(text)
	}
}

// "What's new in Yana X", shown once after the app starts on a newer version.
struct WhatsNewSheet: View {
	let release: AppUpdater.Release
	let close: () -> Void

	var body: some View {
		VStack(alignment: .leading, spacing: 14) {
			HStack(spacing: 12) {
				Image(nsImage: NSApplication.shared.applicationIconImage).resizable().frame(width: 44, height: 44)
				Text(String(format: L("upd.whatsNew"), release.version)).font(.fbHeading5).foregroundStyle(FB.text)
			}
			NotesBox(notes: release.notes)
			HStack { Spacer(); FBButton(title: L("upd.gotIt"), variant: .primary, action: close) }
		}
		.padding(20)
		.frame(width: 520)
		.background(FB.canvas)
	}
}

// The rail's "Update" pill: slides in when a new version is waiting, with a soft pulse that stops.
struct UpdatePill: View {
	let action: () -> Void
	@State private var shown = false
	@State private var pulse = false

	var body: some View {
		Button(action: action) {
			VStack(spacing: 3) {
				ZStack {
					Circle().fill(FB.primary.opacity(pulse ? 0 : 0.35)).frame(width: 34, height: 34)
						.scaleEffect(pulse ? 1.35 : 0.9)
					Circle().fill(FB.primary).frame(width: 30, height: 30)
					FBIcon(name: "download", size: 15, color: FB.onPrimary)
				}
				Text(L("upd.pill")).font(.system(size: 10, weight: .medium)).foregroundStyle(FB.primaryText)
			}
		}
		.buttonStyle(.plain)
		.help(L("upd.title"))
		.offset(y: shown ? 0 : 24)
		.opacity(shown ? 1 : 0)
		.onAppear {
			withAnimation(.spring(response: 0.45, dampingFraction: 0.75)) { shown = true }
			// Three soft pulses, then still: noticeable, never nagging.
			withAnimation(.easeOut(duration: 1.2).repeatCount(3, autoreverses: false).delay(0.4)) { pulse = true }
		}
	}
}
