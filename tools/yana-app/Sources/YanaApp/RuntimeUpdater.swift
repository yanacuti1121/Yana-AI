import AppKit
import Combine
import Foundation
import SwiftUI

// Checks at launch that Yana's two command-line parts are installed and current, and installs or
// upgrades them in Terminal when the user agrees (like Yana Studio IDE, features/updates.js):
//   yana-rt  (native core)      newest from crates.io, installed with `cargo install yana-rt --force`
//   yana-ai  (Python CLI, PyPI) newest from pypi.org,  installed with `pipx install/upgrade yana-ai`
// The two have independent version numbers by design. On a new Mac without Rust or pipx, Homebrew
// installs them first; with no Homebrew either, the banner links the official install pages.

enum PartAction { case none, install, upgrade }

@MainActor
final class RuntimeUpdater: ObservableObject {
	enum Phase: Equatable { case checking, current, needsAction, installing, needsTools, failed(String), unknown }

	@Published private(set) var phase: Phase = .checking
	@Published private(set) var rtInstalled: String? = nil
	@Published private(set) var rtLatest: String? = nil
	@Published private(set) var pyInstalled: String? = nil
	@Published private(set) var pyLatest: String? = nil

	static let rustInstallPage = URL(string: "https://www.rust-lang.org/tools/install")!
	static let pipxInstallPage = URL(string: "https://pipx.pypa.io/stable/installation/")!
	private static let crateURL = URL(string: "https://crates.io/api/v1/crates/yana-rt")!
	private static let pypiURL = URL(string: "https://pypi.org/pypi/yana-ai/json")!
	private static let requestTimeout: TimeInterval = 10
	private nonisolated static let home = NSHomeDirectory()
	private static let cargoCandidates = ["/opt/homebrew/bin/cargo", "\(home)/.cargo/bin/cargo", "/usr/local/bin/cargo"]
	private static let brewCandidates = ["/opt/homebrew/bin/brew", "/usr/local/bin/brew"]
	private static let pipxCandidates = ["/opt/homebrew/bin/pipx", "\(home)/.local/bin/pipx", "/usr/local/bin/pipx"]
	private nonisolated static let yanaAiCandidates = ["\(home)/.local/bin/yana-ai", "/opt/homebrew/bin/yana-ai", "/usr/local/bin/yana-ai"]

	var showsBanner: Bool {
		switch phase {
		case .needsAction, .installing, .needsTools, .failed: return true
		default: return false
		}
	}

	var rtAction: PartAction { Self.action(installed: rtInstalled, latest: rtLatest) }
	var pyAction: PartAction { Self.action(installed: pyInstalled, latest: pyLatest) }

	private static func action(installed: String?, latest: String?) -> PartAction {
		guard let installed else { return .install }
		guard let latest else { return .none } // offline: cannot tell, do not nag
		return isOlder(installed, than: latest) ? .upgrade : .none
	}

	func check() async {
		phase = .checking
		let local = await Task.detached { () -> (String?, String?) in
			(RtClient.binaryPath() == nil ? nil : RtClient.versionString(), Self.localYanaAiVersion())
		}.value
		rtInstalled = local.0
		pyInstalled = local.1
		async let rt = Self.fetchVersion(Self.crateURL) { ($0["crate"] as? [String: Any]).flatMap { $0["max_stable_version"] as? String } }
		async let py = Self.fetchVersion(Self.pypiURL) { ($0["info"] as? [String: Any]).flatMap { $0["version"] as? String } }
		rtLatest = await rt
		pyLatest = await py
		if rtAction == .none && pyAction == .none {
			phase = (rtLatest == nil || pyLatest == nil) ? .unknown : .current
		} else {
			phase = .needsAction
		}
	}

	// Runs the fixed install script (RuntimeInstallScript) in the app's own terminal panel after the user
	// agrees. The app keeps running; when the script ends, the versions are checked again.
	func install(in terminals: TerminalStore, folder: String) {
		guard phase != .installing else { return }
		do {
			try? FileManager.default.removeItem(at: RuntimeInstallScript.doneMarker)
			let script = try RuntimeInstallScript.write()
			terminals.run(TerminalTab.Job(executable: "/bin/bash", args: [script.path], title: L("rt.installTab")), folder: folder)
			phase = .installing
			watch(terminals.current)
		} catch {
			phase = .failed(error.localizedDescription)
		}
	}

	// Re-checks once the install part is over: the script's done marker appears (it then may keep the tab
	// open with `yana-rt chat --provider ollama`), or the tab's program exits (install failed or no Ollama).
	private func watch(_ tab: TerminalTab?) {
		guard let tab else { return }
		finishWatch = tab.$exited.first { $0 }.sink { [weak self] _ in
			Task { @MainActor in self?.installEnded() }
		}
		markerWatch?.cancel()
		markerWatch = Task { [weak self] in
			let marker = RuntimeInstallScript.doneMarker
			for _ in 0 ..< Self.markerPolls {
				try? await Task.sleep(for: .seconds(Self.markerPollSeconds))
				if Task.isCancelled { return }
				if FileManager.default.fileExists(atPath: marker.path) { await self?.installEnded(); return }
			}
		}
	}

	private func installEnded() {
		guard phase == .installing else { return }
		finishWatch = nil
		markerWatch?.cancel()
		try? FileManager.default.removeItem(at: RuntimeInstallScript.doneMarker)
		Task { await check() }
	}

	private var finishWatch: AnyCancellable?
	private var markerWatch: Task<Void, Never>?
	private static let markerPollSeconds = 3
	private static let markerPolls = 1200 // one hour at most: cargo can take a long time on a cold cache

	// `yana-ai --version` prints "yana-ai 1.5.0". It is a Python launcher, run with a fixed argument.
	private nonisolated static func localYanaAiVersion() -> String? {
		guard let path = yanaAiCandidates.first(where: { FileManager.default.isExecutableFile(atPath: $0) }) else { return nil }
		let process = Process()
		process.executableURL = URL(fileURLWithPath: path)
		process.arguments = ["--version"]
		let out = Pipe()
		process.standardOutput = out
		process.standardError = Pipe()
		guard (try? process.run()) != nil else { return nil }
		let data = out.fileHandleForReading.readDataToEndOfFile()
		process.waitUntilExit()
		return String(decoding: data, as: UTF8.self).split(separator: " ").last
			.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
	}

	private static func fetchVersion(_ url: URL, _ pick: @escaping ([String: Any]) -> String?) async -> String? {
		var request = URLRequest(url: url, timeoutInterval: requestTimeout)
		request.setValue("yana-app-version-check", forHTTPHeaderField: "User-Agent") // crates.io requires one
		guard let (data, response) = try? await URLSession.shared.data(for: request),
		      (response as? HTTPURLResponse)?.statusCode == 200,
		      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
		return pick(json)
	}

	static func isOlder(_ a: String, than b: String) -> Bool {
		let x = a.split(separator: ".").map { Int($0) ?? 0 }
		let y = b.split(separator: ".").map { Int($0) ?? 0 }
		for i in 0 ..< max(x.count, y.count) {
			let l = i < x.count ? x[i] : 0, r = i < y.count ? y[i] : 0
			if l != r { return l < r }
		}
		return false
	}
}

struct RuntimeBanner: View {
	@ObservedObject var updater: RuntimeUpdater
	let install: () -> Void

	private func line(_ name: String, _ action: PartAction, _ installed: String?, _ latest: String?) -> String? {
		switch action {
		case .none: return nil
		case .install: return "\(name): \(L("rt.notInstalled"))\(latest.map { " (\(L("rt.latest")) \($0))" } ?? "")"
		case .upgrade: return "\(name): \(installed ?? "?") → \(latest ?? "?")"
		}
	}

	private var text: String {
		switch updater.phase {
		case .needsAction:
			let parts = [line("yana-rt", updater.rtAction, updater.rtInstalled, updater.rtLatest),
			             line("yana-ai (PyPI)", updater.pyAction, updater.pyInstalled, updater.pyLatest)].compactMap { $0 }
			return "\(L("rt.needUpdate")) \(parts.joined(separator: " · "))"
		case .installing: return L("rt.installing")
		case .needsTools: return L("rt.needsRust")
		case .failed(let why): return "\(L("rt.failed")): \(why)"
		default: return ""
		}
	}

	var body: some View {
		HStack(spacing: 12) {
			FBIcon(name: "alert-triangle", size: 16, color: FB.warningText)
			Text(text).font(.fbBody).foregroundStyle(FB.text).lineLimit(3)
			Spacer(minLength: 8)
			switch updater.phase {
			case .needsAction, .failed:
				FBButton(title: L("rt.installNow"), variant: .primary, size: .small) { install() }
			case .installing:
				FBButton(title: L("rt.recheck"), variant: .secondary, size: .small) { Task { await updater.check() } }
			case .needsTools:
				FBButton(title: L("rt.openRust"), variant: .secondary, size: .small) { NSWorkspace.shared.open(RuntimeUpdater.rustInstallPage) }
				FBButton(title: L("rt.openPipx"), variant: .secondary, size: .small) { NSWorkspace.shared.open(RuntimeUpdater.pipxInstallPage) }
				FBButton(title: L("rt.recheck"), variant: .primary, size: .small) { Task { await updater.check() } }
			default:
				EmptyView()
			}
		}
		.padding(.horizontal, 14).padding(.vertical, 10)
		.frame(maxWidth: 860)
		.background(RoundedRectangle(cornerRadius: 12).fill(FB.warningSubtle))
		.overlay(RoundedRectangle(cornerRadius: 12).stroke(FB.warningBorder, lineWidth: 1))
		.shadow(color: FB.shadow, radius: 10, y: 3)
	}
}
