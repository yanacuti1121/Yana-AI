import AppKit
import Foundation

// Checks GitHub Releases for a newer Yana app (tags `app-vX.Y.Z`, prereleases and drafts ignored) and
// downloads it on request. Notifies only when the release is newer than the installed build
// (CFBundleShortVersionString); once the newest is installed it stays quiet. A version the user chose to
// skip is not offered again. The app is not signed yet, so it cannot replace itself the way Sparkle does:
// the download (.dmg or .zip) is saved to Downloads and opened for the user to drag into Applications.

@MainActor
final class AppUpdater: ObservableObject {
	struct Release: Equatable {
		let version: String
		let notes: String
		let page: URL
		let asset: URL?
		let assetName: String?
	}

	enum Phase: Equatable { case idle, available(Release), downloading(Double), downloaded(URL), failed(String) }

	@Published private(set) var phase: Phase = .idle
	@Published var showSheet = false
	// "What's new" for the version just installed, shown once after the app starts on it.
	@Published var whatsNew: Release?

	private static let api = URL(string: "https://api.github.com/repos/yanacuti1121/Yana-AI/releases?per_page=30")!
	private static let tagPrefix = "app-v"
	private static let skippedKey = "yana.update.skipped"
	private static let seenKey = "yana.update.lastSeenVersion"
	private static let notesKey = "yana.update.pendingNotes"
	private static let requestTimeout: TimeInterval = 10

	static var installedVersion: String? {
		Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String
	}

	var available: Release? {
		if case .available(let release) = phase { return release }
		return nil
	}

	// `userAsked` shows "you have the newest" feedback and ignores a skipped version.
	func check(userAsked: Bool = false) async {
		guard let installed = Self.installedVersion else { return }
		guard let release = await Self.latestRelease() else {
			if userAsked { phase = .failed(L("upd.offline")) }
			return
		}
		guard RuntimeUpdater.isOlder(installed, than: release.version) else {
			phase = .idle
			showSheet = userAsked // asked from the menu: say "you have the newest"; at launch: stay quiet
			return
		}
		if !userAsked && UserDefaults.standard.string(forKey: Self.skippedKey) == release.version { return }
		phase = .available(release)
		showSheet = true
	}

	// YANA_UPDATE_DEMO=1 shows the sheet with a made-up release (to check its look in the live window).
	func demo() {
		let notes = "**Yana 9.9.9**\n- Bộ nhớ thông suốt qua nhiều phiên\n- Sao lưu và khôi phục kí ức\n- Cập nhật ngay trong app"
		phase = .available(Release(version: "9.9.9", notes: notes, page: Self.api, asset: nil, assetName: nil))
		showSheet = true
	}

	func skip(_ release: Release) {
		UserDefaults.standard.set(release.version, forKey: Self.skippedKey)
		phase = .idle
		showSheet = false
	}

	func later() { showSheet = false }

	func download(_ release: Release) {
		guard let asset = release.asset else {
			NSWorkspace.shared.open(release.page)
			showSheet = false
			return
		}
		UserDefaults.standard.set(release.notes, forKey: Self.notesKey)
		phase = .downloading(0)
		let downloader = Downloader { [weak self] progress in
			Task { @MainActor in if case .downloading = self?.phase { self?.phase = .downloading(progress) } }
		} finished: { [weak self] result in
			Task { @MainActor in self?.finish(result, name: release.assetName ?? asset.lastPathComponent) }
		}
		downloader.start(asset)
		self.downloader = downloader
	}

	private var downloader: Downloader?

	private func finish(_ result: Result<URL, Error>, name: String) {
		downloader = nil
		switch result {
		case .failure(let error):
			phase = .failed(error.localizedDescription)
		case .success(let temp):
			do {
				let downloads = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask)[0]
				var target = downloads.appendingPathComponent(name)
				var counter = 1
				while FileManager.default.fileExists(atPath: target.path) {
					let base = (name as NSString).deletingPathExtension
					target = downloads.appendingPathComponent("\(base) (\(counter)).\((name as NSString).pathExtension)")
					counter += 1
				}
				try FileManager.default.moveItem(at: temp, to: target)
				phase = .downloaded(target)
			} catch {
				phase = .failed(error.localizedDescription)
			}
		}
	}

	// Opens the downloaded disk image or zip; the user drags Yana into Applications and relaunches.
	func openDownload(_ url: URL) {
		NSWorkspace.shared.open(url)
		showSheet = false
	}

	// Called at launch: when the app now runs a version newer than the last one it ran, show its notes once.
	func showWhatsNewIfUpdated() {
		guard let installed = Self.installedVersion else { return }
		let seen = UserDefaults.standard.string(forKey: Self.seenKey)
		UserDefaults.standard.set(installed, forKey: Self.seenKey)
		guard let seen, RuntimeUpdater.isOlder(seen, than: installed),
		      let notes = UserDefaults.standard.string(forKey: Self.notesKey), !notes.isEmpty else { return }
		UserDefaults.standard.removeObject(forKey: Self.notesKey)
		whatsNew = Release(version: installed, notes: notes, page: Self.api, asset: nil, assetName: nil)
	}

	private static func latestRelease() async -> Release? {
		var request = URLRequest(url: api, timeoutInterval: requestTimeout)
		request.setValue("yana-app-update-check", forHTTPHeaderField: "User-Agent")
		request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
		guard let (data, response) = try? await URLSession.shared.data(for: request),
		      (response as? HTTPURLResponse)?.statusCode == 200,
		      let list = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { return nil }
		return list.lazy.compactMap(release(from:)).first
	}

	static func release(from json: [String: Any]) -> Release? {
		guard (json["draft"] as? Bool) != true, (json["prerelease"] as? Bool) != true,
		      let tag = json["tag_name"] as? String, tag.hasPrefix(tagPrefix) else { return nil }
		let version = String(tag.dropFirst(tagPrefix.count))
		guard version.range(of: #"^\d+\.\d+\.\d+$"#, options: .regularExpression) != nil,
		      let page = (json["html_url"] as? String).flatMap(URL.init(string:)),
		      page.host == "github.com" else { return nil }
		let assets = (json["assets"] as? [[String: Any]]) ?? []
		let mac = assets.first { ($0["name"] as? String).map { $0.hasSuffix(".dmg") || $0.hasSuffix(".zip") } ?? false }
		let asset = (mac?["browser_download_url"] as? String).flatMap(URL.init(string:))
		let safeAsset = asset?.scheme == "https" && asset?.host == "github.com" ? asset : nil
		return Release(version: version, notes: (json["body"] as? String) ?? "", page: page,
		               asset: safeAsset, assetName: safeAsset == nil ? nil : (mac?["name"] as? String).map { ($0 as NSString).lastPathComponent })
	}
}

// URLSession download with progress, reported through two closures.
private final class Downloader: NSObject, URLSessionDownloadDelegate, @unchecked Sendable {
	private let progress: (Double) -> Void
	private let finished: (Result<URL, Error>) -> Void
	private var session: URLSession?

	init(progress: @escaping (Double) -> Void, finished: @escaping (Result<URL, Error>) -> Void) {
		self.progress = progress
		self.finished = finished
	}

	func start(_ url: URL) {
		let session = URLSession(configuration: .default, delegate: self, delegateQueue: nil)
		self.session = session
		session.downloadTask(with: url).resume()
	}

	func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData _: Int64,
	                totalBytesWritten written: Int64, totalBytesExpectedToWrite expected: Int64) {
		if expected > 0 { progress(Double(written) / Double(expected)) }
	}

	func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
		// The file at `location` is deleted when this returns, so move it first.
		let keep = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
		do {
			try FileManager.default.moveItem(at: location, to: keep)
			finished(.success(keep))
		} catch {
			finished(.failure(error))
		}
		session.finishTasksAndInvalidate()
	}

	func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
		if let error { finished(.failure(error)); session.finishTasksAndInvalidate() }
	}
}
