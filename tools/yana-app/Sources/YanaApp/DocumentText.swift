import AppKit
import PDFKit
import UniformTypeIdentifiers

// Reads the text out of a document attached to a chat message. yana-rt's headless chat only takes images
// as attachments, so documents are turned into text here, on this Mac, and sent inside the message.
// Supported: PDF; Word (.docx/.doc), RTF, OpenDocument text, HTML via macOS's own text readers;
// PowerPoint (.pptx) and Excel (.xlsx) by reading the text runs out of their XML parts; any plain text or
// source file. Apple's Keynote/Pages/Numbers formats are not readable here (export to PDF instead).
// Text is capped per file so one large file cannot flood the model's context.

struct ChatDocument: Identifiable {
	let id = UUID()
	let name: String
	let text: String
	let truncated: Bool
}

enum DocumentText {
	static let maxChars = 60_000
	private static let sniffBytes = 8192

	enum ReadError: LocalizedError {
		case unsupported(String), empty(String), unreadable(String)
		var errorDescription: String? {
			switch self {
			case .unsupported(let name): return "\(L("doc.unsupported")): \(name)"
			case .empty(let name): return "\(L("doc.empty")): \(name)"
			case .unreadable(let name): return "\(L("attach.unreadable")): \(name)"
			}
		}
	}

	static func read(_ url: URL) throws -> ChatDocument {
		let name = url.lastPathComponent
		let text = try extract(url, name: name).trimmingCharacters(in: .whitespacesAndNewlines)
		guard !text.isEmpty else { throw ReadError.empty(name) }
		let truncated = text.count > maxChars
		return ChatDocument(name: name, text: truncated ? String(text.prefix(maxChars)) : text, truncated: truncated)
	}

	private static func extract(_ url: URL, name: String) throws -> String {
		switch url.pathExtension.lowercased() {
		case "pdf":
			guard let doc = PDFDocument(url: url), let text = doc.string else { throw ReadError.unreadable(name) }
			return text
		case "docx": return try attributed(url, .officeOpenXML, name)
		case "doc": return try attributed(url, .docFormat, name)
		case "rtf": return try attributed(url, .rtf, name)
		case "odt": return try attributed(url, .openDocument, name)
		case "html", "htm": return try attributed(url, .html, name)
		case "pptx":
			// Slides in their real order (slide1, slide2 … slide10), not the order inside the zip.
			let slides = unzip(["-Z1", url.path]).split(separator: "\n").map(String.init)
				.filter { $0.hasPrefix("ppt/slides/slide") && $0.hasSuffix(".xml") }
				.sorted { slideNumber($0) < slideNumber($1) }
			return slides.map { xmlText(zip: url, part: $0, tag: "a:t") }.filter { !$0.isEmpty }.joined(separator: "\n\n")
		case "xlsx": return xmlText(zip: url, part: "xl/sharedStrings.xml", tag: "t")
		case "key", "pages", "numbers": throw ReadError.unsupported(name)
		default:
			// Anything else is accepted only if it looks like text (no NUL byte near the start).
			guard let data = try? Data(contentsOf: url) else { throw ReadError.unreadable(name) }
			if data.prefix(sniffBytes).contains(0) { throw ReadError.unsupported(name) }
			return String(decoding: data, as: UTF8.self)
		}
	}

	private static func attributed(_ url: URL, _ type: NSAttributedString.DocumentType, _ name: String) throws -> String {
		do {
			return try NSAttributedString(url: url, options: [.documentType: type], documentAttributes: nil).string
		} catch {
			throw ReadError.unreadable(name)
		}
	}

	// Office Open XML files are zip archives; `unzip -p` (macOS's own /usr/bin/unzip, fixed arguments, no
	// shell) prints the matching parts, and the text runs are the contents of the given tag.
	private static func slideNumber(_ path: String) -> Int {
		Int(path.dropFirst("ppt/slides/slide".count).dropLast(".xml".count)) ?? Int.max
	}

	// Runs /usr/bin/unzip with a fixed argument list (no shell) and returns its stdout.
	private static func unzip(_ arguments: [String]) -> String {
		let process = Process()
		process.executableURL = URL(fileURLWithPath: "/usr/bin/unzip")
		process.arguments = arguments
		let out = Pipe()
		process.standardOutput = out
		process.standardError = Pipe()
		guard (try? process.run()) != nil else { return "" }
		let data = out.fileHandleForReading.readDataToEndOfFile()
		process.waitUntilExit()
		return String(decoding: data, as: UTF8.self)
	}

	private static func xmlText(zip url: URL, part: String, tag: String) -> String {
		let xml = unzip(["-p", url.path, part])
		let pattern = "<\(NSRegularExpression.escapedPattern(for: tag))(?:\\s[^>]*)?>([^<]*)</\(NSRegularExpression.escapedPattern(for: tag))>"
		guard let regex = try? NSRegularExpression(pattern: pattern) else { return "" }
		let range = NSRange(xml.startIndex..., in: xml)
		let runs = regex.matches(in: xml, range: range).compactMap { match in
			Range(match.range(at: 1), in: xml).map { decode(String(xml[$0])) }
		}
		return runs.joined(separator: "\n")
	}

	private static func decode(_ text: String) -> String {
		text.replacingOccurrences(of: "&lt;", with: "<").replacingOccurrences(of: "&gt;", with: ">")
			.replacingOccurrences(of: "&quot;", with: "\"").replacingOccurrences(of: "&apos;", with: "'")
			.replacingOccurrences(of: "&amp;", with: "&")
	}
}
