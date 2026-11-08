import SwiftUI

// The remaining Settings sections (see SettingsPage.swift). Each row reads or changes something real.

struct ModelSettings: View {
	@ObservedObject private var settings = AppSettings.shared
	@EnvironmentObject private var engine: ChatEngine
	@State private var editing: KeyTarget? = nil
	@State private var keyDraft = ""

	private var keyProviders: [ProviderInfo] { providerCatalog.filter { $0.kind != .local } }

	var body: some View {
		Form {
			Section {
				Picker(L("set.provider"), selection: $settings.provider) {
					ForEach(providerCatalog) { Text($0.id).tag($0.id) }
				}
				TextField(L("set.model"), text: $settings.model, prompt: Text(L("set.modelPrompt")))
				if settings.provider == "custom" {
					TextField(L("set.baseUrl"), text: $settings.baseURL, prompt: Text("https://"))
				}
				TextField(L("set.maxTokens"), text: $settings.maxTokens, prompt: Text("4096"))
				TextField(L("set.temperature"), text: $settings.temperature, prompt: Text("0.7"))
			} header: { Text(L("set.defaults")) } footer: {
				SettingsNote("\(L("set.providerNote")) \(L("set.maxTokensNote")) \(L("set.temperatureNote"))")
			}

			Section {
				if engine.models.isEmpty {
					Text(L("set.localNone")).font(.fbCaption).foregroundStyle(FB.textSecondary)
				}
				ForEach(engine.models, id: \.self) { name in
					LabeledContent(name, value: "Ollama")
				}
				Button(L("set.refresh")) { engine.loadModels() }
			} header: { Text("\(L("set.localModels")) (\(engine.models.count))") } footer: { SettingsNote(L("set.localNote")) }

			Section {
				ForEach(keyProviders) { provider in keyRow(provider.id) }
			} header: { Text(L("set.apiKeys")) } footer: { SettingsNote(L("set.apiKeyNote")) }
		}
		.onAppear {
			engine.loadModels()
			// YANA_KEYSHEET=<provider> opens the key dialog at launch (used to check it in the live window).
			if let id = ProcessInfo.processInfo.environment["YANA_KEYSHEET"] { editing = KeyTarget(id: id) }
		}
		.sheet(item: $editing) { target in keySheet(target.id) }
	}

	private func keyRow(_ id: String) -> some View {
		let saved = settings.keyVersion >= 0 && settings.hasKey(id)
		return LabeledContent(id) {
			HStack(spacing: 8) {
				Text(saved ? L("set.keySaved") : L("set.keyNone")).font(.fbCaption)
					.foregroundStyle(saved ? FB.successText : FB.textSecondary)
				Button(saved ? L("set.keyReplace") : L("set.keyAdd")) { keyDraft = ""; editing = KeyTarget(id: id) }
				if saved { Button(L("set.remove")) { settings.removeKey(id) } }
			}
		}
	}

	private func keySheet(_ id: String) -> some View {
		APIKeySheet(provider: id, saved: settings.hasKey(id), close: { editing = nil }) { key in
			settings.saveKey(key, for: id)
			editing = nil
		}
	}
}

// Where each provider hands out API keys. Only providers whose key page is well known are listed;
// the others show no link rather than a guessed one.
private let keyPages: [String: String] = [
	"anthropic": "https://console.anthropic.com/settings/keys",
	"openai": "https://platform.openai.com/api-keys",
	"gemini": "https://aistudio.google.com/app/apikey",
	"groq": "https://console.groq.com/keys",
	"openrouter": "https://openrouter.ai/keys",
	"deepseek": "https://platform.deepseek.com/api_keys",
	"huggingface": "https://huggingface.co/settings/tokens",
]

// The add/replace key dialog: sized to its content, with where to get a key and a show/hide toggle.
private struct APIKeySheet: View {
	let provider: String
	let saved: Bool
	let close: () -> Void
	let save: (String) -> Void
	@State private var draft = ""
	@State private var reveal = false

	private var trimmed: String { draft.trimmingCharacters(in: .whitespacesAndNewlines) }

	var body: some View {
		VStack(alignment: .leading, spacing: 18) {
			HStack(spacing: 12) {
				FBIcon(name: "key", size: 20, color: FB.primaryText)
					.frame(width: 40, height: 40)
					.background(RoundedRectangle(cornerRadius: 10).fill(FB.primarySubtle))
				VStack(alignment: .leading, spacing: 2) {
					Text("\(saved ? L("set.keyReplaceTitle") : L("set.keyAddTitle")) · \(provider)")
						.font(.system(size: 16, weight: .semibold)).foregroundStyle(FB.text)
					Text(L("set.keySheetSub")).font(.fbCaption).foregroundStyle(FB.textSecondary)
				}
			}

			VStack(alignment: .leading, spacing: 6) {
				Text(L("set.apiKey")).font(.fbBodyMedium).foregroundStyle(FB.text)
				HStack(spacing: 8) {
					Group {
						if reveal { TextField("sk-…", text: $draft) } else { SecureField("sk-…", text: $draft) }
					}
					.textFieldStyle(.roundedBorder)
					.font(.system(size: 13, design: .monospaced))
					FBIconButton(icon: reveal ? "eye-off" : "eye", variant: .ghost, size: .small,
					             tooltip: reveal ? L("set.keyHide") : L("set.keyShow")) { reveal.toggle() }
				}
				if let page = keyPages[provider], let url = URL(string: page) {
					Link(destination: url) {
						Text("\(L("set.keyWhere")) \(url.host ?? page) ↗").font(.fbCaption)
					}
				}
			}

			HStack(alignment: .top, spacing: 8) {
				FBIcon(name: "lock", size: 13, color: FB.textSecondary)
				SettingsNote(L("set.keySafety"))
			}
			.padding(10)
			.frame(maxWidth: .infinity, alignment: .leading)
			.background(RoundedRectangle(cornerRadius: 8).fill(FB.surfaceSecondary))

			HStack {
				Spacer()
				Button(L("set.cancel"), action: close).keyboardShortcut(.cancelAction)
				Button(L("set.save")) { save(trimmed) }
					.keyboardShortcut(.defaultAction)
					.buttonStyle(.borderedProminent)
					.disabled(trimmed.isEmpty)
			}
		}
		.padding(24)
		.frame(width: 460)
		.fixedSize(horizontal: false, vertical: true)
	}
}

struct KeyTarget: Identifiable { let id: String }

struct TerminalSettings: View {
	@EnvironmentObject private var terminals: TerminalStore
	@ObservedObject private var settings = AppSettings.shared

	var body: some View {
		Form {
			Section {
				Stepper(value: Binding(get: { Double(terminals.fontSize) }, set: { terminals.setFontSize(CGFloat($0)) }),
				        in: 9 ... 28, step: 1) {
					LabeledContent(L("set.termFont"), value: "\(Int(terminals.fontSize)) pt")
				}
				Toggle(L("set.termOptionMeta"), isOn: $settings.terminalOptionAsMeta)
					.onChange(of: settings.terminalOptionAsMeta) { _, _ in terminals.restyle() }
				LabeledContent(L("set.termShell"), value: ProcessInfo.processInfo.environment["SHELL"] ?? "/bin/zsh")
				LabeledContent(L("set.termTabs"), value: "\(terminals.tabs.count)")
			} footer: { SettingsNote(L("set.termNote")) }
		}
	}
}

struct StudioSettings: View {
	@EnvironmentObject private var editor: EditorLauncher
	@EnvironmentObject private var engine: ChatEngine
	@ObservedObject private var settings = AppSettings.shared

	var body: some View {
		Form {
			Section {
				LabeledContent(L("set.studioApp")) {
					Text(editor.appURL?.path ?? L("ide.notFound")).font(.fbCaption)
						.foregroundStyle(editor.appURL == nil ? FB.errorText : FB.textSecondary)
						.lineLimit(1).truncationMode(.middle)
				}
				LabeledContent(L("set.studioBridge")) {
					Text(editor.devExtension == nil ? L("set.studioBridgeOff") : L("set.studioBridgeOn")).font(.fbCaption)
						.foregroundStyle(editor.devExtension == nil ? FB.warningText : FB.successText)
				}
				TextField(L("set.studioCheckout"), text: $settings.ideCheckout)
				Button(L("ide.title")) { editor.open(folder: engine.workspace) }.disabled(editor.appURL == nil)
				if case .failed(let why) = editor.status { SettingsNote(why) }
			} footer: { SettingsNote(L("set.studioNote")) }
		}
	}
}

struct UpdateSettings: View {
	@EnvironmentObject private var runtime: RuntimeUpdater
	@EnvironmentObject private var editor: EditorLauncher
	@EnvironmentObject private var engine: ChatEngine

	var body: some View {
		Form {
			Section {
				versionRow("yana-rt", runtime.rtInstalled, runtime.rtLatest)
				versionRow("yana-ai (PyPI)", runtime.pyInstalled, runtime.pyLatest)
				HStack {
					Button(L("rt.recheck")) { Task { await runtime.check() } }
					if runtime.showsBanner {
						Button(L("rt.installNow")) { runtime.install(via: editor, folder: engine.workspace) }
							.buttonStyle(.borderedProminent)
					}
				}
			} footer: { SettingsNote(L("set.updatesNote")) }
		}
	}

	private func versionRow(_ name: String, _ installed: String?, _ latest: String?) -> some View {
		LabeledContent(name) {
			let old = installed.flatMap { i in latest.map { RuntimeUpdater.isOlder(i, than: $0) } } ?? false
			Text("\(installed ?? L("rt.notInstalled")) · \(L("rt.latest")) \(latest ?? "?")").font(.fbCaption)
				.foregroundStyle(installed == nil || old ? FB.warningText : FB.textSecondary)
		}
	}
}

struct SystemSettings: View {
	@ObservedObject private var settings = AppSettings.shared

	var body: some View {
		Form {
			Section {
				TextField(L("set.runtimePath"), text: $settings.runtimePath, prompt: Text("~/.local/bin/yana-rt"))
				LabeledContent(L("set.runtimeFound"), value: RtClient.binaryPath() ?? L("rt.notInstalled"))
			} footer: { SettingsNote(L("set.runtimePathNote")) }
		}
	}
}

struct AboutSettings: View {
	var body: some View {
		Form {
			Section {
				LabeledContent("Yana", value: L("set.aboutBuild"))
				LabeledContent("Fluent Blue", value: "MIT")
				LabeledContent("SwiftTerm 1.20.0", value: "MIT")
			} footer: { SettingsNote(L("set.aboutNote")) }
		}
	}
}
