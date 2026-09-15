import AppKit
import SwiftUI

struct SyntaxTextEditor: NSViewRepresentable {
    @Binding var text: String
    let fileName: String

    func makeCoordinator() -> Coordinator {
        Coordinator(parent: self)
    }

    func makeNSView(context: Context) -> NSScrollView {
        let scrollView = NSScrollView()
        scrollView.hasVerticalScroller = true
        scrollView.hasHorizontalScroller = true
        scrollView.autohidesScrollers = true
        scrollView.drawsBackground = false

        let textView = NSTextView()
        textView.delegate = context.coordinator
        textView.isRichText = false
        textView.allowsUndo = true
        textView.isAutomaticQuoteSubstitutionEnabled = false
        textView.isAutomaticDashSubstitutionEnabled = false
        textView.isAutomaticTextReplacementEnabled = false
        textView.usesFindBar = true
        textView.drawsBackground = false
        textView.font = .monospacedSystemFont(ofSize: 13, weight: .regular)
        textView.textColor = .labelColor
        textView.insertionPointColor = .systemPink
        textView.textContainerInset = NSSize(width: 18, height: 18)
        textView.minSize = NSSize(width: 0, height: 0)
        textView.maxSize = NSSize(width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude)
        textView.isHorizontallyResizable = true
        textView.isVerticallyResizable = true
        textView.textContainer?.widthTracksTextView = false
        textView.string = text
        SyntaxHighlighter.highlight(textView.textStorage, fileName: fileName)

        scrollView.documentView = textView
        return scrollView
    }

    func updateNSView(_ scrollView: NSScrollView, context: Context) {
        context.coordinator.parent = self
        guard let textView = scrollView.documentView as? NSTextView, textView.string != text else { return }
        textView.string = text
        SyntaxHighlighter.highlight(textView.textStorage, fileName: fileName)
    }

    final class Coordinator: NSObject, NSTextViewDelegate {
        var parent: SyntaxTextEditor

        init(parent: SyntaxTextEditor) {
            self.parent = parent
        }

        func textDidChange(_ notification: Notification) {
            guard let textView = notification.object as? NSTextView else { return }
            parent.text = textView.string
            SyntaxHighlighter.highlight(textView.textStorage, fileName: parent.fileName)
        }
    }
}

private enum SyntaxHighlighter {
    private static let keywordPattern = "\\b(abstract|actor|any|as|async|await|break|case|catch|class|const|continue|def|default|defer|do|else|enum|export|extends|false|final|fn|for|func|function|if|impl|import|in|interface|is|let|match|mut|new|nil|none|null|open|private|protected|public|return|self|static|struct|super|switch|throw|throws|true|try|type|use|var|where|while|yield)\\b"
    private static let numberPattern = "\\b(?:0x[0-9a-fA-F]+|\\d+(?:\\.\\d+)?)\\b"
    private static let stringPattern = "(?:\\\"(?:\\\\.|[^\\\"])*\\\"|'(?:\\\\.|[^'])*')"
    private static let slashCommentPattern = "//[^\\n]*"
    private static let hashCommentPattern = "(?m)^\\s*#[^\\n]*"

    static func highlight(_ storage: NSTextStorage?, fileName: String) {
        guard let storage else { return }
        let source = storage.string as NSString
        let range = NSRange(location: 0, length: source.length)
        let baseFont = NSFont.monospacedSystemFont(ofSize: 13, weight: .regular)
        storage.setAttributes([
            .font: baseFont,
            .foregroundColor: NSColor.labelColor,
        ], range: range)

        apply(keywordPattern, color: .systemPink, to: storage, range: range)
        apply(numberPattern, color: .systemOrange, to: storage, range: range)
        apply(stringPattern, color: .systemTeal, to: storage, range: range)

        let extensionName = URL(fileURLWithPath: fileName).pathExtension.lowercased()
        let commentPattern = ["py", "sh", "yml", "yaml", "toml", "rb"].contains(extensionName)
            ? hashCommentPattern
            : slashCommentPattern
        apply(commentPattern, color: .secondaryLabelColor, to: storage, range: range)
    }

    private static func apply(_ pattern: String, color: NSColor, to storage: NSTextStorage, range: NSRange) {
        guard let expression = try? NSRegularExpression(pattern: pattern) else { return }
        expression.enumerateMatches(in: storage.string, range: range) { match, _, _ in
            guard let match else { return }
            storage.addAttribute(.foregroundColor, value: color, range: match.range)
        }
    }
}
