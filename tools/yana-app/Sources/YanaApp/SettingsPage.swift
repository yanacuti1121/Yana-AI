import AppKit
import SwiftUI

// Settings, laid out like macOS System Settings: categories on the left, each pane a header (icon, title,
// one line on what it controls) over a grouped Form. Every row reads or changes something real
// (AppSettings, the Keychain, the terminal store, yana-rt). Panes: here and in SettingsSections.swift,
// SettingsInfo.swift. API keys go to the macOS Keychain only and are never shown again after saving.

enum SettingsSection: String, CaseIterable, Identifiable {
	case general, chat, memory, models, terminal, studio, security, data, updates, system, shortcuts, about
	var id: String { rawValue }
	var icon: String {
		switch self {
		case .general: return "settings"
		case .chat: return "message"
		case .memory: return "bookmark"
		case .models: return "cpu"
		case .terminal: return "terminal"
		case .studio: return "code"
		case .security: return "shield"
		case .data: return "folder"
		case .updates: return "download"
		case .system: return "box"
		case .shortcuts: return "keyboard"
		case .about: return "info-circle"
		}
	}
	var title: String { L("set.section.\(rawValue)") }
	var subtitle: String { L("set.about.\(rawValue)") }
	// A thin line in the list before these, grouping app / AI / tools / safety / info like System Settings.
	var startsGroup: Bool { [.models, .security, .updates].contains(self) }
}

struct SettingsPage: View {
	let openPage: (String) -> Void
	// YANA_SETTINGS=<section> opens a given pane (used to check panes in the live window).
	@State private var section: SettingsSection =
		ProcessInfo.processInfo.environment["YANA_SETTINGS"].flatMap(SettingsSection.init(rawValue:)) ?? .general

	var body: some View {
		HStack(spacing: 0) {
			ScrollView {
				VStack(alignment: .leading, spacing: 2) {
					Text(L("nav.Settings")).font(.system(size: 20, weight: .semibold)).foregroundStyle(FB.text)
						.padding(EdgeInsets(top: 0, leading: 10, bottom: 12, trailing: 0))
					ForEach(SettingsSection.allCases) { item in
						if item.startsGroup { FB.divider.frame(height: 1).padding(.vertical, 6).padding(.horizontal, 10) }
						SettingsNavRow(icon: item.icon, title: item.title, selected: item == section)
							.onTapGesture { section = item }
					}
				}
				.padding(EdgeInsets(top: 8, leading: 14, bottom: 14, trailing: 14))
			}
			.frame(width: 240)
			.background(SidebarBackground(color: FB.chrome))

			VStack(alignment: .leading, spacing: 0) {
				PaneHeader(section: section)
				pane.formStyle(.grouped).scrollContentBackground(.hidden)
			}
			.frame(maxWidth: 780, alignment: .topLeading)
			.padding(.leading, 12)
			.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
		}
	}

	@ViewBuilder
	private var pane: some View {
		switch section {
		case .general: GeneralSettings()
		case .chat: ChatSettings()
		case .memory: MemorySettings()
		case .models: ModelSettings()
		case .terminal: TerminalSettings()
		case .studio: StudioSettings()
		case .security: SecuritySettings { openPage("Tool approvals") }
		case .data: DataSettings()
		case .updates: UpdateSettings()
		case .system: SystemSettings()
		case .shortcuts: ShortcutSettings()
		case .about: AboutSettings()
		}
	}
}

private struct PaneHeader: View {
	let section: SettingsSection

	var body: some View {
		HStack(spacing: 14) {
			FBIcon(name: section.icon, size: 22, color: FB.primaryText)
				.frame(width: 44, height: 44)
				.background(RoundedRectangle(cornerRadius: 11).fill(FB.primarySubtle))
			VStack(alignment: .leading, spacing: 3) {
				Text(section.title).font(.system(size: 18, weight: .semibold)).foregroundStyle(FB.text)
				Text(section.subtitle).font(.fbBody).foregroundStyle(FB.textSecondary)
			}
		}
		.padding(EdgeInsets(top: 28, leading: 22, bottom: 0, trailing: 22))
	}
}

private struct SettingsNavRow: View {
	let icon: String
	let title: String
	let selected: Bool
	@State private var hover = false

	var body: some View {
		HStack(spacing: 10) {
			FBIcon(name: icon, size: 13, color: selected ? FB.onPrimary : FB.primaryText)
				.frame(width: 24, height: 24)
				.background(RoundedRectangle(cornerRadius: 6).fill(selected ? FB.primary : FB.primarySubtle))
			Text(title).font(.system(size: 13, weight: selected ? .semibold : .regular)).foregroundStyle(FB.text)
			Spacer(minLength: 0)
		}
		.padding(.horizontal, 8)
		.frame(height: 34)
		.background(RoundedRectangle(cornerRadius: 8).fill(selected ? FB.canvas : hover ? FB.hoverOnChrome : .clear))
		.contentShape(Rectangle())
		.onHover { hover = $0 }
	}
}

struct SettingsNote: View {
	let text: String
	init(_ text: String) { self.text = text }
	var body: some View {
		Text(text).font(.fbCaption).foregroundStyle(FB.textSecondary).fixedSize(horizontal: false, vertical: true)
	}
}

// MARK: General

struct GeneralSettings: View {
	@ObservedObject private var loc = Loc.shared
	@ObservedObject private var settings = AppSettings.shared
	@AppStorage("yana.ui.chatSidebar") private var chatSidebar = true

	var body: some View {
		Form {
			Section {
				Picker(L("set.language"), selection: $loc.lang) {
					ForEach(Lang.allCases) { Text($0.nativeName).tag($0) }
				}
				Picker(L("set.startPage"), selection: $settings.startPage) {
					Text(L("set.startAsk")).tag("ask")
					Text(L("nav.Terminal")).tag("Terminal")
					Text(L("nav.Chat")).tag("Chat")
				}
			} footer: { SettingsNote(L("set.languageNote")) }

			Section {
				LabeledContent(L("set.workspace")) {
					HStack(spacing: 8) {
						Text(RtClient.workspace()).font(.fbCaption).foregroundStyle(FB.textSecondary)
							.lineLimit(1).truncationMode(.middle)
						Button(L("set.choose")) { chooseFolder() }
						if !settings.workspace.isEmpty { Button(L("set.reset")) { settings.workspace = "" } }
					}
				}
			} footer: { SettingsNote(L("set.workspaceNote")) }

			Section {
				Toggle(L("set.showChatList"), isOn: $chatSidebar)
				Toggle(L("set.updatesOnLaunch"), isOn: $settings.checkUpdatesOnLaunch)
			} header: { Text(L("set.window")) }
		}
	}

	private func chooseFolder() {
		let panel = NSOpenPanel()
		panel.canChooseDirectories = true
		panel.canChooseFiles = false
		panel.allowsMultipleSelection = false
		if panel.runModal() == .OK, let url = panel.url { settings.workspace = url.path }
	}
}

// MARK: Chat

struct ChatSettings: View {
	@ObservedObject private var settings = AppSettings.shared
	// Installed system voices, by display name.
	private let voices: [(id: String, name: String)] = NSSpeechSynthesizer.availableVoices.map { voice in
		let name = NSSpeechSynthesizer.attributes(forVoice: voice)[.name] as? String ?? voice.rawValue
		return (voice.rawValue, name)
	}.sorted { $0.name < $1.name }

	var body: some View {
		Form {
			Section {
				Picker(L("set.defaultMode"), selection: $settings.defaultPlanMode) {
					Text(L("chat.modeAct")).tag(false)
					Text(L("chat.modePlan")).tag(true)
				}
				Toggle(L("set.showTokens"), isOn: $settings.showTokens)
			} footer: { SettingsNote(L("set.defaultModeNote")) }

			Section {
				Picker(L("set.voice"), selection: $settings.voice) {
					Text(L("set.voiceSystem")).tag("")
					ForEach(voices, id: \.id) { Text($0.name).tag($0.id) }
				}
			} header: { Text(L("msg.read")) } footer: { SettingsNote(L("set.voiceNote")) }
		}
	}
}
