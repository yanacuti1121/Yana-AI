import AppKit
import UniformTypeIdentifiers

// Images attached to the next chat message (dragged in, pasted with the + button, or picked from Finder).
// yana-rt's headless chat takes `images: [{mime_type, data}]`: at most 8, JPEG/PNG/WebP/GIF, base64 up to
// 8 MiB each (src/chat/headless.rs validate_images). Anything else (HEIC, TIFF, screenshots as TIFF...)
// is converted to PNG here, and an image that would exceed the limit is scaled down and sent as JPEG,
// so a drop never turns into a runtime error.

struct ChatImage: Identifiable {
	let id = UUID()
	let name: String
	let mimeType: String
	let base64: String
	let preview: NSImage
}

enum ChatImages {
	static let maxCount = 8
	// yana-rt allows 8 MiB and some providers stop at ~5 MB; images are compressed well below both, to
	// this budget (base64 bytes), so uploads stay fast and cheap in tokens.
	private static let maxBase64 = 1_500_000
	// PNG is kept only when it is already this small (screenshots, text: stays sharp); else JPEG.
	private static let pngBudget = 600_000
	private static let jpegQualities: [Double] = [0.85, 0.75, 0.65, 0.5]
	private static let minSide = 512
	// Longest edge in real pixels; bigger images are scaled down before sending.
	private static let maxSide = 2048
	private static let accepted: Set<String> = ["image/jpeg", "image/png", "image/webp", "image/gif"]
	// Providers whose yana-rt adapter accepts images (supports_vision in src/chat/*.rs).
	static let visionProviders: Set<String> = ["anthropic", "gemini", "openai", "groq", "openrouter", "xai", "glm"]

	enum LoadError: LocalizedError {
		case notImage(String), unreadable(String)
		var errorDescription: String? {
			switch self {
			case .notImage(let name): return "\(L("attach.notImage")): \(name)"
			case .unreadable(let name): return "\(L("attach.unreadable")): \(name)"
			}
		}
	}

	static func load(_ url: URL) throws -> ChatImage {
		let name = url.lastPathComponent
		guard let type = UTType(filenameExtension: url.pathExtension), type.conforms(to: .image) else {
			throw LoadError.notImage(name)
		}
		guard let data = try? Data(contentsOf: url), let image = NSImage(data: data) else { throw LoadError.unreadable(name) }
		let mime = type.preferredMIMEType ?? ""
		if accepted.contains(mime), pixelSide(image) <= maxSide, data.base64EncodedString().count <= maxBase64 {
			return ChatImage(name: name, mimeType: mime, base64: data.base64EncodedString(), preview: image)
		}
		return try reencode(image, name: name)
	}

	static func from(_ image: NSImage, name: String) throws -> ChatImage { try reencode(image, name: name) }

	static func from(_ cgImage: CGImage, name: String) throws -> ChatImage {
		try reencode(NSImage(cgImage: cgImage, size: NSSize(width: cgImage.width, height: cgImage.height)), name: name)
	}

	// Compression: scale to maxSide real pixels; keep PNG if it is small; otherwise JPEG at falling quality
	// until it fits the budget; if even the lowest quality is too big, shrink the image by a quarter and
	// try again (never below minSide).
	private static func reencode(_ image: NSImage, name: String) throws -> ChatImage {
		var side = maxSide
		while side >= minSide {
			guard let rep = bitmap(image, maxSide: side) else { throw LoadError.unreadable(name) }
			let preview = NSImage(size: NSSize(width: rep.pixelsWide, height: rep.pixelsHigh))
			preview.addRepresentation(rep)
			if let png = rep.representation(using: .png, properties: [:]), png.base64EncodedString().count <= pngBudget {
				return ChatImage(name: name, mimeType: "image/png", base64: png.base64EncodedString(), preview: preview)
			}
			for quality in jpegQualities {
				if let jpeg = rep.representation(using: .jpeg, properties: [.compressionFactor: quality]),
				   jpeg.base64EncodedString().count <= maxBase64 {
					return ChatImage(name: name, mimeType: "image/jpeg", base64: jpeg.base64EncodedString(), preview: preview)
				}
			}
			side = side * 3 / 4
		}
		throw LoadError.unreadable(name)
	}

	// The largest pixel edge of an image (points can be half of that on Retina-tagged files).
	private static func pixelSide(_ image: NSImage) -> Int {
		image.representations.map { max($0.pixelsWide, $0.pixelsHigh) }.max() ?? Int(max(image.size.width, image.size.height))
	}

	// Draws the image into a bitmap of at most maxSide pixels on the longest edge, in real pixels.
	private static func bitmap(_ image: NSImage, maxSide: Int) -> NSBitmapImageRep? {
		var rect = NSRect(origin: .zero, size: image.size)
		guard let cg = image.cgImage(forProposedRect: &rect, context: nil, hints: nil) else { return nil }
		let factor = min(1, Double(maxSide) / Double(max(cg.width, cg.height, 1)))
		let width = max(1, Int((Double(cg.width) * factor).rounded()))
		let height = max(1, Int((Double(cg.height) * factor).rounded()))
		guard let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: width, pixelsHigh: height, bitsPerSample: 8,
		                                 samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
		                                 bytesPerRow: 0, bitsPerPixel: 0),
		      let context = NSGraphicsContext(bitmapImageRep: rep) else { return nil }
		NSGraphicsContext.saveGraphicsState()
		NSGraphicsContext.current = context
		context.cgContext.interpolationQuality = .high
		context.cgContext.draw(cg, in: CGRect(x: 0, y: 0, width: width, height: height))
		NSGraphicsContext.restoreGraphicsState()
		return rep
	}
}
