import AppKit
import Foundation

// Opens Yana Studio (the Electron IDE layer) only when the user asks for it: the chat layer starts alone.
// The two layers talk through a request file that yana-agent's features/app-bridge.js watches; the file
// only names a job from that extension's fixed list, never a command.
//
// Where Yana Studio comes from, first match wins:
//   1. Yana.app/Contents/Applications/Yana Studio.app (the packaged one-app layout)
//   2. /Applications/Yana Studio.app (installed separately)
// Until the packaged Yana Studio ships app-bridge.js, the yana-agent copy in the Code-OSS checkout
// (Settings: ideCheckout) is loaded with --extensionDevelopmentPath when it has the bridge.

@MainActor
final class EditorLauncher: ObservableObject {
	enum Status: Equatable { case idle, opening, failed(String) }
	@Published private(set) var status: Status = .idle

	private static let installed = URL(fileURLWithPath: "/Applications/Yana Studio.app")
	private var stateDir: URL {
		FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/YanaApp")
	}

	var appURL: URL? {
		let bundled = Bundle.main.bundleURL.appendingPathComponent("Contents/Applications/Yana Studio.app")
		return [bundled, Self.installed].first { FileManager.default.fileExists(atPath: $0.path) }
	}

	// The yana-agent folder that has the bridge, when the bundled extension does not yet.
	var devExtension: String? {
		let path = URL(fileURLWithPath: AppSettings.shared.ideCheckout).appendingPathComponent("extensions/yana-agent")
		let bridge = path.appendingPathComponent("features/app-bridge.js").path
		return FileManager.default.fileExists(atPath: bridge) ? path.path : nil
	}

	// Opens Yana Studio on `folder`. If it is already running, Code-OSS hands the folder to that window.
	func open(folder: String) {
		guard let app = appURL else { status = .failed(L("ide.notFound")); return }
		let config = NSWorkspace.OpenConfiguration()
		// A new process carries the arguments; Code-OSS forwards them to a running instance and exits.
		config.createsNewApplicationInstance = true
		var arguments = [folder]
		if let devExtension { arguments.insert("--extensionDevelopmentPath=\(devExtension)", at: 0) }
		config.arguments = arguments
		status = .opening
		NSWorkspace.shared.openApplication(at: app, configuration: config) { _, error in
			let message = error?.localizedDescription
			DispatchQueue.main.async {
				MainActor.assumeIsolated { self.status = message.map { .failed($0) } ?? .idle }
			}
		}
	}

	// Asks Yana Studio to run a named job in its terminal, opening it on `folder` if needed.
	func request(action: String, folder: String) throws {
		guard appURL != nil else { throw LauncherError.notFound }
		try FileManager.default.createDirectory(at: stateDir, withIntermediateDirectories: true)
		let body = try JSONSerialization.data(withJSONObject: ["action": action])
		try body.write(to: stateDir.appendingPathComponent("ide-request.json"), options: .atomic)
		open(folder: folder)
	}

	enum LauncherError: LocalizedError {
		case notFound
		var errorDescription: String? { L("ide.notFound") }
	}
}
