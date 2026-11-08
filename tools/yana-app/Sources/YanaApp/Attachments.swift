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
	private static let maxBase64 = 8 * 1024 * 1024
	private static let maxSide: CGFloat = 2048
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
		if accepted.contains(mime), data.base64EncodedString().count <= maxBase64 {
			return ChatImage(name: name, mimeType: mime, base64: data.base64EncodedString(), preview: image)
		}
		return try reencode(image, name: name)
	}

	static func from(_ image: NSImage, name: String) throws -> ChatImage { try reencode(image, name: name) }

	// PNG when it fits, otherwise a scaled-down JPEG.
	private static func reencode(_ image: NSImage, name: String) throws -> ChatImage {
		if let png = encode(image, as: .png), png.base64EncodedString().count <= maxBase64 {
			return ChatImage(name: name, mimeType: "image/png", base64: png.base64EncodedString(), preview: image)
		}
		let scaled = scale(image, maxSide: maxSide)
		guard let jpeg = encode(scaled, as: .jpeg), jpeg.base64EncodedString().count <= maxBase64 else {
			throw LoadError.unreadable(name)
		}
		return ChatImage(name: name, mimeType: "image/jpeg", base64: jpeg.base64EncodedString(), preview: scaled)
	}

	private static func encode(_ image: NSImage, as type: NSBitmapImageRep.FileType) -> Data? {
		guard let tiff = image.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff) else { return nil }
		return rep.representation(using: type, properties: type == .jpeg ? [.compressionFactor: 0.85] : [:])
	}

	private static func scale(_ image: NSImage, maxSide: CGFloat) -> NSImage {
		let size = image.size
		let factor = min(1, maxSide / max(size.width, size.height, 1))
		guard factor < 1 else { return image }
		let target = NSSize(width: (size.width * factor).rounded(), height: (size.height * factor).rounded())
		let result = NSImage(size: target)
		result.lockFocus()
		image.draw(in: NSRect(origin: .zero, size: target))
		result.unlockFocus()
		return result
	}
}
