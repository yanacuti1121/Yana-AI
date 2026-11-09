import SwiftUI

// The first screen when Yana opens: one app, two layers, the user picks where to start.
//   1. Yana terminal: the app's own default surface (the chat/terminal layer, this Swift app).
//   2. Yana Studio: the custom Code-OSS IDE. It opens in its own window because macOS does not let a
//      Swift app host another app's window; the bridge layer keeps the two connected.
// Nothing starts before the choice: Yana Studio only launches when picked here or from the tools panel.

struct StartChooser: View {
	@EnvironmentObject private var engine: ChatEngine
	@EnvironmentObject private var editor: EditorLauncher
	let openTerminal: () -> Void

	var body: some View {
		VStack(spacing: 28) {
			VStack(spacing: 10) {
				RabbitLogo(cell: 2)
				Text(L("startup.title")).font(.system(size: 28, weight: .semibold)).foregroundStyle(FB.text)
				Text(L("startup.subtitle")).font(.fbBody).foregroundStyle(FB.textSecondary)
			}
			HStack(alignment: .top, spacing: 18) {
				StartCard(icon: "message", title: L("startup.terminal"), detail: L("startup.terminalDetail"),
				          note: nil, action: openTerminal)
				StartCard(icon: "code", title: L("startup.ide"), detail: L("startup.ideDetail"),
				          note: L("startup.ideNote")) {
					editor.open(folder: engine.workspace)
					// Yana keeps running in its own window (the bridge needs it); it moves on to the terminal.
					openTerminal()
				}
			}
			if case .failed(let why) = editor.status {
				Text(why).font(.fbCaption).foregroundStyle(FB.errorText)
			}
			HStack(spacing: 6) {
				FBIcon(name: "folder", size: 13, color: FB.textSecondary)
				Text(URL(fileURLWithPath: engine.workspace).lastPathComponent).font(.fbCaption).foregroundStyle(FB.textSecondary)
			}
			.help(engine.workspace)
		}
		.padding(40)
		.frame(maxWidth: .infinity, maxHeight: .infinity)
		.background(FB.canvas)
	}
}

private struct StartCard: View {
	let icon: String
	let title: String
	let detail: String
	let note: String?
	let action: () -> Void
	@State private var hover = false

	var body: some View {
		VStack(alignment: .leading, spacing: 12) {
			FBIcon(name: icon, size: 22, color: FB.primaryText)
				.frame(width: 44, height: 44)
				.background(RoundedRectangle(cornerRadius: 12).fill(FB.primarySubtle))
			Text(title).font(.fbHeading5).foregroundStyle(FB.text)
			Text(detail).font(.fbBody).foregroundStyle(FB.textSecondary).fixedSize(horizontal: false, vertical: true)
			if let note {
				Text(note).font(.fbCaption).foregroundStyle(FB.textSecondary).fixedSize(horizontal: false, vertical: true)
			}
			Spacer(minLength: 0)
		}
		.padding(22)
		.frame(width: 300, height: 220, alignment: .topLeading)
		.background(RoundedRectangle(cornerRadius: 16).fill(FB.canvas))
		.overlay(RoundedRectangle(cornerRadius: 16).stroke(hover ? FB.primaryBorder : FB.divider, lineWidth: 1))
		.shadow(color: FB.shadow, radius: hover ? 16 : 8, y: 4)
		.contentShape(Rectangle())
		.onTapGesture(perform: action)
		.onHover { hover = $0 }
		.animation(FB.fast, value: hover)
	}
}
