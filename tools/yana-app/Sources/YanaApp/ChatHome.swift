import AppKit
import SwiftUI
import UniformTypeIdentifiers

// The chat screen, laid out like Codex and Goose. Empty: a heading with the composer in the middle.
// After the first message: the conversation fills the page and the composer moves to the bottom.
// Turns run through yana-rt (ChatEngine); approval cards call back into yana-rt with the human decision.

struct Chip: View {
	let icon: String
	let title: String
	var trailing: String? = nil
	@State private var hover = false

	var body: some View {
		HStack(spacing: 6) {
			FBIcon(name: icon, size: 14, color: FB.textSecondary)
			Text(title).font(.system(size: 13)).foregroundStyle(FB.textSecondary).lineLimit(1)
			if let trailing { FBIcon(name: trailing, size: 12, color: FB.textTertiary) }
		}
		.padding(.horizontal, 10)
		.frame(height: 30)
		.background(Capsule().fill(hover ? FB.hoverOnCanvas : .clear))
		.contentShape(Capsule())
		.onHover { hover = $0 }
	}
}

struct ChatHome: View {
	@EnvironmentObject private var engine: ChatEngine
	@State private var text = ""
	@State private var showModels = false
	@AppStorage("yana.ui.chatSidebar") private var chatSidebar = true
	@EnvironmentObject private var terminals: TerminalStore
	// Starts hidden so the chat gets the whole width; the button at the top right opens it.
	@State private var right: RightMode = .hidden
	@State private var browserExpanded = false
	@State private var browserWidth: CGFloat = 520
	@State private var dragStartWidth: CGFloat? = nil
	@StateObject private var browser = BrowserModel()
	private static let browserMinWidth: CGFloat = 320
	private static let browserMaxWidth: CGFloat = 1200
	var openSettings: () -> Void = {}
	var openApprovals: () -> Void = {}
	private static let panelWidth: CGFloat = 300
	private var project: String { URL(fileURLWithPath: engine.workspace).lastPathComponent }
	private static let maxInputChars = 20_000 // well under yana-rt's 10 MB stdin cap
	private static let browserWidth: CGFloat = 520

	// A model must be picked first: there is no "auto" model.
	private var canSend: Bool {
		let hasContent = !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !engine.attachments.isEmpty
			|| !engine.documents.isEmpty
		let imagesOK = engine.attachments.isEmpty || engine.acceptsImages
		return !engine.running && engine.model != nil && hasContent && imagesOK
	}
	@State private var dropTargeted = false
	@State private var showPlus = false
	@EnvironmentObject private var editor: EditorLauncher

	// The + menu: everything the chat can pull in or open, each item wired to an existing feature.
	private var plusMenu: some View {
		VStack(alignment: .leading, spacing: 2) {
			plusItem("image", L("plus.images"), L("plus.imagesSub")) { pickImages() }
			plusItem("folder", L("plus.folder"), URL(fileURLWithPath: engine.workspace).lastPathComponent) { chooseFolder() }
			plusItem("zap", L("plus.skills"), L("plus.skillsSub")) { text = "/"; engine.loadSkillsIfNeeded() }
			plusItem(engine.planMode ? "zap" : "eye", engine.planMode ? L("chat.modeAct") : L("chat.modePlan"), L("plus.modeSub")) {
				if !engine.running { engine.planMode.toggle() }
			}
			Divider().padding(.vertical, 4)
			plusItem("terminal", L("panel.terminalHere"), nil) { right = .terminal }
			plusItem("globe", L("browser.show"), nil) { right = .browser }
			plusItem("code", L("panel.editorExternal"), nil) { editor.open(folder: engine.workspace) }
			plusItem("shield", L("nav.Tool approvals"), nil) { openApprovals() }
		}
		.padding(8)
		.frame(width: 340)
	}

	private func plusItem(_ icon: String, _ title: String, _ subtitle: String?, action: @escaping () -> Void) -> some View {
		HStack(spacing: 10) {
			FBIcon(name: icon, size: 15, color: FB.textSecondary).frame(width: 18)
			Text(title).font(.fbBody).foregroundStyle(FB.text).lineLimit(1)
			if let subtitle { Text(subtitle).font(.fbCaption).foregroundStyle(FB.textTertiary).lineLimit(1) }
			Spacer(minLength: 0)
		}
		.padding(.horizontal, 10).frame(height: 32)
		.contentShape(Rectangle())
		.onTapGesture { showPlus = false; action() }
	}

	// "/" at the start of an empty word opens the skill list; typing filters it (name first, then text).
	private static let slashLimit = 60
	private var slashQuery: String? {
		guard text.hasPrefix("/"), !text.contains(where: \.isWhitespace) else { return nil }
		return String(text.dropFirst()).lowercased()
	}
	private var slashMatches: [SkillInfo] {
		guard let q = slashQuery else { return [] }
		guard !q.isEmpty else { return Array(engine.skills.prefix(Self.slashLimit)) }
		let starts = engine.skills.filter { $0.id.lowercased().hasPrefix(q) }
		let rest = engine.skills.filter {
			!$0.id.lowercased().hasPrefix(q) && ($0.id.lowercased().contains(q) || $0.description.lowercased().contains(q))
		}
		return Array((starts + rest).prefix(Self.slashLimit))
	}

	private var slashPopup: some View {
		VStack(alignment: .leading, spacing: 0) {
			HStack {
				Text(L("nav.Skills")).font(.system(size: 12, weight: .semibold)).foregroundStyle(FB.textSecondary)
				Spacer()
				Text(engine.skills.isEmpty ? L("loading") : L("chat.slashHint")).font(.fbCaption).foregroundStyle(FB.textTertiary)
			}
			.padding(EdgeInsets(top: 10, leading: 14, bottom: 6, trailing: 14))
			ScrollView {
				LazyVStack(alignment: .leading, spacing: 0) {
					ForEach(slashMatches) { skill in
						VStack(alignment: .leading, spacing: 2) {
							Text("/\(skill.id)").font(.fbBodyMedium).foregroundStyle(FB.text)
							if !skill.description.isEmpty {
								Text(skill.description).font(.fbCaption).foregroundStyle(FB.textSecondary).lineLimit(1)
							}
						}
						.padding(.horizontal, 14).padding(.vertical, 6)
						.frame(maxWidth: .infinity, alignment: .leading)
						.contentShape(Rectangle())
						.onTapGesture { text = "/\(skill.id) " }
					}
					if !engine.skills.isEmpty && slashMatches.isEmpty {
						Text(L("skills.none")).font(.fbBody).foregroundStyle(FB.textSecondary).padding(14)
					}
				}
			}
			.frame(maxHeight: 280)
		}
		.glassCard(radius: 16)
		.padding(.bottom, 8)
	}

	var body: some View {
		HStack(spacing: 0) {
			if !((right == .browser || right == .terminal) && browserExpanded) {
				chatColumn
				.overlay(alignment: .topLeading) {
					if !chatSidebar {
						FBIconButton(icon: "sidebar", variant: .ghost, size: .medium, tooltip: L("sidebar.show")) { chatSidebar = true }
							.padding(.top, titleBarClearance).padding(.leading, 14)
					}
				}
				.overlay(alignment: .topTrailing) {
					FBIconButton(icon: "sidebar", variant: right == .hidden ? .ghost : .secondary, size: .medium,
					             tooltip: right == .hidden ? L("panel.show") : L("panel.hide")) { right = right == .hidden ? .tools : .hidden }
						.padding(.top, titleBarClearance).padding(.trailing, 14)
				}
			}
			switch right {
			case .hidden:
				EmptyView()
			case .browser:
				if browserExpanded {
					browserView.frame(maxWidth: .infinity)
				} else {
					resizeHandle
					browserView.frame(width: browserWidth)
				}
			case .terminal:
				// Same slot, width, drag handle and expand state as the browser.
				if browserExpanded {
					TerminalPage(expanded: $browserExpanded) { right = .tools }.frame(maxWidth: .infinity)
				} else {
					resizeHandle
					TerminalPage(expanded: $browserExpanded) { right = .tools }.frame(width: browserWidth)
				}
			case .tools:
				sidePanel(L("panel.tools"), back: false) {
					RightPanel(mode: $right, fill: { prompt, plan in text = prompt; engine.planMode = plan },
					           openApprovals: openApprovals)
				}
			case .files:
				sidePanel(L("panel.files"), back: true) { FilesPanel() }
			}
		}
		// The start chooser or the start page asked for the terminal: open it in this panel.
		.onAppear(perform: openTerminalIfAsked)
		.onChange(of: terminals.wantsPanel) { _, _ in openTerminalIfAsked() }
	}

	private func openTerminalIfAsked() {
		guard terminals.wantsPanel else { return }
		terminals.wantsPanel = false
		right = .terminal
	}

	private var browserView: some View {
		BrowserPanel(model: browser, expanded: $browserExpanded,
		             sendToChat: { page in text = page + text }) { right = .tools }
	}

	// Drag to make the browser wider or narrower (between the min and max widths).
	private var resizeHandle: some View {
		FB.divider
			.frame(width: 5)
			.contentShape(Rectangle())
			.onHover { inside in if inside { NSCursor.resizeLeftRight.push() } else { NSCursor.pop() } }
			.gesture(DragGesture(minimumDistance: 1)
				.onChanged { value in
					let start = dragStartWidth ?? browserWidth
					dragStartWidth = start
					browserWidth = min(Self.browserMaxWidth, max(Self.browserMinWidth, start - value.translation.width))
				}
				.onEnded { _ in dragStartWidth = nil })
	}

	private func sidePanel<Content: View>(_ title: String, back: Bool, @ViewBuilder content: () -> Content) -> some View {
		VStack(spacing: 0) {
			HStack(spacing: 6) {
				if back { FBIconButton(icon: "arrow-left", variant: .ghost, size: .small, tooltip: L("panel.tools")) { right = .tools } }
				Text(title).font(.fbHeading5).foregroundStyle(FB.text)
				Spacer()
			}
			.padding(EdgeInsets(top: 52, leading: 14, bottom: 4, trailing: 14))
			content()
		}
		.frame(width: Self.panelWidth)
		.frame(maxHeight: .infinity)
		.background(FB.chrome)
		.overlay(alignment: .leading) { FB.divider.frame(width: 1) }
	}

	private var chatColumn: some View {
		VStack(spacing: 0) {
			if engine.lines.isEmpty {
				Spacer(minLength: 0)
				Text(L("chat.heading")).font(.system(size: 30, weight: .semibold)).foregroundStyle(FB.text)
					.padding(.bottom, 22)
				inputArea
				// Equal space above and below: heading and composer sit in the vertical middle.
				Spacer(minLength: 0)
			} else {
				conversation
				inputArea.padding(.bottom, 20)
			}
		}
		.padding(.horizontal, 32)
		.frame(maxWidth: .infinity, maxHeight: .infinity)
		// The whole chat column takes image drops, not only the composer; the composer border lights up.
		.contentShape(Rectangle())
		.onDrop(of: [.fileURL, .image], isTargeted: $dropTargeted) { providers in
			handleDrop(providers)
			return true
		}
		.onAppear {
			if engine.models.isEmpty { engine.loadModels() }
			// YANA_ATTACH=<image path> attaches an image at launch (used to check the composer in the live window).
			if let path = ProcessInfo.processInfo.environment["YANA_ATTACH"], engine.attachments.isEmpty {
				engine.attach([URL(fileURLWithPath: path)])
			}
		}
	}

	private var inputArea: some View {
		VStack(spacing: 0) {
			if slashQuery != nil { slashPopup }
			composer
			strip
		}
		.frame(maxWidth: 760)
	}

	private var conversation: some View {
		ScrollViewReader { proxy in
			ScrollView {
				LazyVStack(alignment: .leading, spacing: 18) {
					ForEach(engine.lines) { line in
						MessageView(line: line, running: engine.running, decide: engine.decide).id(line.id)
					}
				}
				.frame(maxWidth: 760)
				.frame(maxWidth: .infinity)
				.padding(.vertical, 40)
			}
			.onChange(of: engine.lines.last?.text) { _, _ in
				if let last = engine.lines.last { proxy.scrollTo(last.id, anchor: .bottom) }
			}
		}
	}

	private var composer: some View {
		VStack(alignment: .leading, spacing: 10) {
			if !engine.attachments.isEmpty || !engine.documents.isEmpty { attachmentStrip }
			if let warning = imageWarning {
				Text(warning).font(.fbCaption).foregroundStyle(FB.warningText)
			}
			if isRenderingForImage {
				// ImageRenderer cannot draw a live text field, so the image shows the placeholder as plain text.
				Text(L("chat.placeholder")).font(.system(size: 15)).foregroundStyle(FB.textTertiary)
			} else {
				TextField(L("chat.placeholder"), text: $text, axis: .vertical)
					.textFieldStyle(.plain)
					.font(.system(size: 15))
					.lineLimit(1 ... 6)
					.onSubmit(send)
					.onChange(of: text) { _, new in if new.hasPrefix("/") { engine.loadSkillsIfNeeded() } }
			}

			HStack(spacing: 4) {
				FBIconButton(icon: "plus", variant: .ghost, size: .small, tooltip: L("plus.title")) { showPlus = true }
					.popover(isPresented: $showPlus, arrowEdge: .bottom) { plusMenu }
				// Act or Plan, passed to yana-rt as `mode`. Approval for risky tools is enforced by yana-rt either way.
				Chip(icon: engine.planMode ? "eye" : "zap", title: engine.planMode ? L("chat.modePlan") : L("chat.modeAct"), trailing: "chevron-down")
					.help(L("chat.modeHelp"))
					.onTapGesture { if !engine.running { engine.planMode.toggle() } }
				// Auto: yana-rt leases let commands and file edits run without a click per call, for a set time.
				AutoRunChip(store: AutoRunStore.shared, folder: engine.workspace)
				Spacer(minLength: 8)
				// Reasoning depth: yana-rt's headless adapter has no such parameter, so it is shown but off.
				Chip(icon: "layers", title: L("chat.reasoning"))
					.opacity(0.45)
					.help(L("chat.reasoningNA"))
				Chip(icon: "cpu", title: engine.model.map { "\(engine.provider) · \($0)" } ?? L("model.choose"), trailing: "chevron-down")
					.onTapGesture { showModels = true }
					.popover(isPresented: $showModels, arrowEdge: .top) {
						ModelPicker(engine: engine, openSettings: openSettings) { showModels = false }
					}
				Button(action: engine.running ? engine.stop : send) {
					FBIcon(name: engine.running ? "stop" : "arrow-up", size: 15, color: FB.onPrimary)
						.frame(width: 32, height: 32)
						.background(Circle().fill(engine.running || canSend ? FB.primary : FB.borderStrong))
				}
				.buttonStyle(.plain)
				.help(engine.running ? L("chat.stop") : L("chat.send"))
			}
		}
		.padding(EdgeInsets(top: 16, leading: 18, bottom: 10, trailing: 10))
		.glassCard(radius: 24)
		.overlay(RoundedRectangle(cornerRadius: 24).stroke(FB.primary, lineWidth: 2).opacity(dropTargeted ? 1 : 0))
	}

	// Thumbnails of the images waiting to be sent, each with a remove button.
	private var attachmentStrip: some View {
		ScrollView(.horizontal, showsIndicators: false) {
			HStack(spacing: 8) {
				// Documents: name plus how much text was read, with a remove button.
				ForEach(engine.documents) { doc in
					HStack(spacing: 6) {
						FBIcon(name: "file-text", size: 14, color: FB.primaryText)
						VStack(alignment: .leading, spacing: 1) {
							Text(doc.name).font(.fbCaption).foregroundStyle(FB.text).lineLimit(1)
							Text("\(doc.text.count) \(L("doc.chars"))\(doc.truncated ? " · \(L("doc.truncated"))" : "")")
								.font(.system(size: 10)).foregroundStyle(FB.textTertiary)
						}
						FBIcon(name: "close", size: 10, color: FB.textSecondary)
							.onTapGesture { engine.documents.removeAll { $0.id == doc.id } }
							.help(L("attach.remove"))
					}
					.padding(.horizontal, 10).frame(height: 44)
					.frame(maxWidth: 220)
					.background(RoundedRectangle(cornerRadius: 10).fill(FB.surfaceSecondary))
				}
				ForEach(engine.attachments) { image in
					Image(nsImage: image.preview).resizable().scaledToFill()
						.frame(width: 56, height: 56)
						.clipShape(RoundedRectangle(cornerRadius: 10))
						.overlay(RoundedRectangle(cornerRadius: 10).stroke(FB.divider, lineWidth: 1))
						.overlay(alignment: .topTrailing) {
							FBIcon(name: "close", size: 10, color: FB.onPrimary)
								.frame(width: 18, height: 18)
								.background(Circle().fill(FB.text.opacity(0.75)))
								.offset(x: 5, y: -5)
								.onTapGesture { engine.attachments.removeAll { $0.id == image.id } }
								.help(L("attach.remove"))
						}
						.help(image.name)
				}
			}
			.padding(.top, 6).padding(.trailing, 6)
		}
	}

	// A model without image input would make yana-rt reject the turn; say so before sending.
	private var imageWarning: String? {
		if let error = engine.attachError { return error }
		if !engine.attachments.isEmpty, !engine.acceptsImages { return "\(engine.provider): \(L("attach.noVision"))" }
		return nil
	}

	private func pickImages() {
		let panel = NSOpenPanel()
		// Any file: images go as images, documents are read into text (DocumentText.swift).
		panel.allowedContentTypes = [.item]
		panel.allowsMultipleSelection = true
		if panel.runModal() == .OK { engine.attach(panel.urls) }
	}

	// Accepts every way macOS hands over an image: a Finder file URL, an image file representation (this
	// also covers the screenshot thumbnail, which only offers a file promise), or raw image data from
	// another app. The dropped type list is written to stderr so a failed drop can be diagnosed.
	private func handleDrop(_ providers: [NSItemProvider]) {
		for provider in providers {
			FileHandle.standardError.write(Data("drop types: \(provider.registeredTypeIdentifiers)\n".utf8))
			if provider.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier) {
				_ = provider.loadObject(ofClass: URL.self) { url, error in
					DispatchQueue.main.async {
						if let url { engine.attach([url]) } else { dropFailed(error) }
					}
				}
			} else if provider.hasItemConformingToTypeIdentifier(UTType.image.identifier) {
				// The file only exists inside this callback, so it is read before returning.
				_ = provider.loadFileRepresentation(forTypeIdentifier: UTType.image.identifier) { url, error in
					let image = url.flatMap { NSImage(contentsOf: $0) }
					let name = url?.lastPathComponent ?? L("attach.dropped")
					DispatchQueue.main.async {
						if let image { engine.attach(image, name: name) } else { dropFailed(error) }
					}
				}
			} else if provider.canLoadObject(ofClass: NSImage.self) {
				_ = provider.loadObject(ofClass: NSImage.self) { object, error in
					DispatchQueue.main.async {
						if let image = object as? NSImage { engine.attach(image, name: L("attach.dropped")) } else { dropFailed(error) }
					}
				}
			} else {
				dropFailed(nil)
			}
		}
	}

	private func dropFailed(_ error: Error?) {
		if let error { FileHandle.standardError.write(Data("drop failed: \(error)\n".utf8)) }
		engine.attachError = L("attach.dropFailed")
	}

	private var strip: some View {
		HStack(spacing: 4) {
			Chip(icon: "folder", title: project, trailing: "chevron-down")
				.help(engine.workspace)
				.onTapGesture { if !engine.running { chooseFolder() } }
			Spacer()
		}
		.padding(EdgeInsets(top: 8, leading: 14, bottom: 0, trailing: 14))
	}

	private func chooseFolder() {
		let panel = NSOpenPanel()
		panel.canChooseDirectories = true
		panel.canChooseFiles = false
		panel.allowsMultipleSelection = false
		panel.directoryURL = URL(fileURLWithPath: engine.workspace)
		if panel.runModal() == .OK, let url = panel.url { engine.workspace = url.path }
	}

	private func send() {
		// With the skill list open, Enter picks the first match instead of sending.
		if slashQuery != nil, let first = slashMatches.first {
			text = "/\(first.id) "
			return
		}
		guard canSend else { return }
		let message = String(text.trimmingCharacters(in: .whitespacesAndNewlines).prefix(Self.maxInputChars))
		text = ""
		engine.send(message)
	}
}

struct MessageView: View {
	let line: ChatLine
	let running: Bool
	let decide: (Bool) -> Void

	var body: some View {
		if line.role == .user {
			VStack(alignment: .trailing, spacing: 6) {
				if !line.images.isEmpty {
					HStack(spacing: 6) {
						ForEach(Array(line.images.enumerated()), id: \.offset) { _, image in
							Image(nsImage: image).resizable().scaledToFill()
								.frame(width: 120, height: 120)
								.clipShape(RoundedRectangle(cornerRadius: 12))
						}
					}
				}
				if !line.text.isEmpty {
					Text(line.text).font(.system(size: 14)).foregroundStyle(FB.text)
						.textSelection(.enabled)
						.padding(.horizontal, 14).padding(.vertical, 10)
						.background(RoundedRectangle(cornerRadius: 18).fill(FB.primarySubtle))
				}
			}
			.padding(.leading, 120)
			.frame(maxWidth: .infinity, alignment: .trailing)
		} else {
			VStack(alignment: .leading, spacing: 10) {
				if !line.text.isEmpty {
					Text(markdown(line.text)).font(.system(size: 14)).foregroundStyle(FB.text)
						.textSelection(.enabled)
						.frame(maxWidth: .infinity, alignment: .leading)
					HStack(spacing: 8) {
						MessageActions(text: line.text)
						if AppSettings.shared.showTokens, line.inputTokens + line.outputTokens > 0 {
							Text("↑ \(line.inputTokens)  ↓ \(line.outputTokens) \(L("usage.tokens"))")
								.font(.fbCaption).foregroundStyle(FB.textTertiary)
								.help(L("usage.tokensHelp"))
						}
					}
				} else if running && line.error == nil && line.approval == nil {
					Text(L("chat.thinking")).font(.system(size: 14)).foregroundStyle(FB.textTertiary)
				}
				if let error = line.error { FBAlert(kind: .error, text: error, closable: false) }
				if let ask = line.approval { ApprovalCard(ask: ask, running: running, decide: decide) }
				if let used = line.memoryUsed {
					Label(used, systemImage: "brain").font(.fbCaption).foregroundStyle(FB.textTertiary)
				}
				if let fact = line.memoryProposal { MemoryProposalCard(lineID: line.id, fact: fact) }
			}
		}
	}

	private func markdown(_ text: String) -> AttributedString {
		let options = AttributedString.MarkdownParsingOptions(interpretedSyntax: .inlineOnlyPreservingWhitespace)
		return (try? AttributedString(markdown: text, options: options)) ?? AttributedString(text)
	}
}

// Under each reply: copy to the clipboard, and read aloud with the macOS voice (on this Mac, no network).
struct MessageActions: View {
	let text: String
	@State private var copied = false
	@StateObject private var speaker = Speaker()

	var body: some View {
		HStack(spacing: 2) {
			FBIconButton(icon: copied ? "check" : "copy", variant: .ghost, size: .small, tooltip: L("msg.copy")) {
				NSPasteboard.general.clearContents()
				NSPasteboard.general.setString(text, forType: .string)
				copied = true
			}
			FBIconButton(icon: speaker.speaking ? "stop" : "volume", variant: .ghost, size: .small,
			             tooltip: speaker.speaking ? L("msg.stopReading") : L("msg.read")) { speaker.toggle(text) }
		}
	}
}

final class Speaker: NSObject, ObservableObject, NSSpeechSynthesizerDelegate {
	private let synth = NSSpeechSynthesizer()
	@Published var speaking = false

	override init() {
		super.init()
		synth.delegate = self
	}

	func toggle(_ text: String) {
		if synth.isSpeaking { synth.stopSpeaking(); speaking = false; return }
		let voice = AppSettings.shared.voice
		synth.setVoice(voice.isEmpty ? nil : NSSpeechSynthesizer.VoiceName(rawValue: voice))
		speaking = synth.startSpeaking(text)
	}

	func speechSynthesizer(_ sender: NSSpeechSynthesizer, didFinishSpeaking finishedSpeaking: Bool) { speaking = false }
}

// yana-rt paused the turn and asks the human. The decision goes back through `--resume-approval`.
struct ApprovalCard: View {
	let ask: ApprovalAsk
	let running: Bool
	let decide: (Bool) -> Void

	var body: some View {
		VStack(alignment: .leading, spacing: 10) {
			HStack(spacing: 8) {
				FBIcon(name: "shield", size: 16, color: FB.warningText)
				Text("\(L("chat.approveTitle")): \(ask.capability)").font(.fbBodyMedium).foregroundStyle(FB.text)
			}
			Text(ask.reason).font(.fbCaption).foregroundStyle(FB.textSecondary).fixedSize(horizontal: false, vertical: true)
			if let decided = ask.decided {
				Text(decided ? L("dec.allowed") : L("dec.denied")).font(.fb(12, .medium))
					.foregroundStyle(decided ? FB.successText : FB.errorText)
			} else {
				HStack(spacing: 8) {
					FBButton(title: L("chat.allow"), variant: .primary, size: .small) { decide(true) }
					FBButton(title: L("chat.deny"), variant: .secondary, size: .small) { decide(false) }
				}
				.disabled(running)
			}
		}
		.padding(14)
		.frame(maxWidth: .infinity, alignment: .leading)
		.background(RoundedRectangle(cornerRadius: 14).fill(FB.warningSubtle))
		.overlay(RoundedRectangle(cornerRadius: 14).stroke(FB.warningBorder, lineWidth: 1))
	}
}
