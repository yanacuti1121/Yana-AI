import AVFoundation
import AppKit

// Videos attached to a chat message. yana-rt takes no video, so a few frames are taken evenly across the
// clip (AVFoundation, on this Mac) and sent as images, with a note naming the video, its length and the
// time of each frame so the model knows they are stills from one video. The sound track is not sent.

enum VideoFrames {
	static let maxFrames = 6

	struct Result {
		let frames: [ChatImage]
		let note: String
	}

	enum VideoError: LocalizedError {
		case unreadable(String)
		var errorDescription: String? {
			switch self { case .unreadable(let name): return "\(L("video.unreadable")): \(name)" }
		}
	}

	// `count` frames at the middle of `count` equal slices of the clip (never the black first frame).
	static func extract(_ url: URL, count: Int) async throws -> Result {
		let name = url.lastPathComponent
		let asset = AVURLAsset(url: url)
		guard let duration = try? await asset.load(.duration), duration.seconds.isFinite, duration.seconds > 0 else {
			throw VideoError.unreadable(name)
		}
		let generator = AVAssetImageGenerator(asset: asset)
		generator.appliesPreferredTrackTransform = true
		generator.requestedTimeToleranceBefore = .zero
		generator.requestedTimeToleranceAfter = CMTime(seconds: 0.5, preferredTimescale: 600)
		let total = duration.seconds
		let n = max(1, min(count, maxFrames))
		var frames: [ChatImage] = []
		var stamps: [String] = []
		for index in 0 ..< n {
			let seconds = total * (Double(index) + 0.5) / Double(n)
			let time = CMTime(seconds: seconds, preferredTimescale: 600)
			guard let (cgImage, _) = try? await generator.image(at: time) else { continue }
			frames.append(try ChatImages.from(cgImage, name: "\(name) @\(clock(seconds))"))
			stamps.append(clock(seconds))
		}
		guard !frames.isEmpty else { throw VideoError.unreadable(name) }
		let note = "\(L("video.note")): \(name) (\(clock(total))). \(L("video.frames")): \(stamps.joined(separator: ", "))."
		return Result(frames: frames, note: note)
	}

	private static func clock(_ seconds: Double) -> String {
		let whole = Int(seconds.rounded())
		return String(format: "%d:%02d", whole / 60, whole % 60)
	}
}
