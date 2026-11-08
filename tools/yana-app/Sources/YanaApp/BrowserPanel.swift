import SwiftUI
import WebKit

// A browser panel beside the chat, for previewing what is being built (for example http://localhost:3000).
// It uses macOS's own WebKit, not a bundled Chromium. Hidden by default; the chat page toggles it.
// Only http and https load: file://, javascript: and other schemes are refused before navigation.

final class BrowserModel: ObservableObject {
	let webView = WKWebView()
	@Published var address = ""
	@Published var canGoBack = false
	@Published var canGoForward = false
	@Published var error: String? = nil
	private var observers: [NSKeyValueObservation] = []

	init() {
		observers = [
			webView.observe(\.url, options: [.new]) { [weak self] view, _ in
				DispatchQueue.main.async { if let url = view.url?.absoluteString { self?.address = url } }
			},
			webView.observe(\.canGoBack, options: [.new]) { [weak self] view, _ in
				DispatchQueue.main.async { self?.canGoBack = view.canGoBack }
			},
			webView.observe(\.canGoForward, options: [.new]) { [weak self] view, _ in
				DispatchQueue.main.async { self?.canGoForward = view.canGoForward }
			},
		]
	}

	// Turns what was typed into a URL. Local addresses get http, everything else https.
	static func normalize(_ input: String) -> URL? {
		let text = input.trimmingCharacters(in: .whitespacesAndNewlines)
		guard !text.isEmpty else { return nil }
		let local = text.hasPrefix("localhost") || text.hasPrefix("127.0.0.1") || text.hasPrefix("[::1]")
		let withScheme = text.contains("://") ? text : (local ? "http://" : "https://") + text
		guard let url = URL(string: withScheme), let scheme = url.scheme?.lowercased(),
		      scheme == "http" || scheme == "https", url.host != nil else { return nil }
		return url
	}

	func open(_ input: String) {
		guard let url = Self.normalize(input) else { error = L("browser.badUrl"); return }
		error = nil
		webView.load(URLRequest(url: url))
	}

	// Cap on page text handed to the chat, so one page cannot flood the model's context.
	static let maxPageChars = 8_000

	// The open page as context for the chat: its address and visible text (document.body.innerText).
	// Read-only; the page is not changed. The user still reviews and sends the message.
	func pageForChat(_ done: @escaping (String) -> Void) {
		let address = webView.url?.absoluteString ?? ""
		guard !address.isEmpty else { return }
		webView.evaluateJavaScript("document.body ? document.body.innerText : ''") { result, _ in
			let text = String((result as? String ?? "").prefix(Self.maxPageChars))
			done("\(L("browser.pageFrom")) \(address)\n\n\(text)\n\n")
		}
	}
}

struct WebViewHost: NSViewRepresentable {
	let webView: WKWebView
	func makeNSView(context: Context) -> WKWebView { webView }
	func updateNSView(_ view: WKWebView, context: Context) {}
}

struct BrowserPanel: View {
	@ObservedObject var model: BrowserModel
	@Binding var expanded: Bool
	let sendToChat: (String) -> Void
	let close: () -> Void
	@State private var typed = ""

	var body: some View {
		VStack(spacing: 0) {
			HStack(spacing: 4) {
				FBIconButton(icon: "arrow-left", variant: .ghost, size: .small, tooltip: L("browser.back")) { model.webView.goBack() }
					.disabled(!model.canGoBack)
				FBIconButton(icon: "arrow-right", variant: .ghost, size: .small, tooltip: L("browser.forward")) { model.webView.goForward() }
					.disabled(!model.canGoForward)
				FBIconButton(icon: "refresh", variant: .ghost, size: .small, tooltip: L("refresh")) { model.webView.reload() }
				TextField(L("browser.placeholder"), text: $typed)
					.textFieldStyle(.plain).font(.system(size: 12))
					.padding(.horizontal, 10).frame(height: 28)
					.background(Capsule().fill(FB.surfaceSecondary))
					.onSubmit { model.open(typed) }
				FBIconButton(icon: "send", variant: .ghost, size: .small, tooltip: L("browser.toChat")) {
					model.pageForChat { text in sendToChat(text); expanded = false }
				}
				.disabled(model.address.isEmpty)
				FBIconButton(icon: expanded ? "zoom-out" : "maximize", variant: .ghost, size: .small,
				             tooltip: expanded ? L("browser.restore") : L("browser.expand")) { expanded.toggle() }
				FBIconButton(icon: "close", variant: .ghost, size: .small, tooltip: L("browser.hide")) { expanded = false; close() }
			}
			.padding(EdgeInsets(top: titleBarClearance, leading: 8, bottom: 8, trailing: 8))
			.onChange(of: model.address) { _, new in typed = new }
			if let error = model.error {
				Text(error).font(.fbCaption).foregroundStyle(FB.errorText).padding(.horizontal, 12).padding(.bottom, 6)
			}
			Divider()
			ZStack {
				WebViewHost(webView: model.webView)
				if model.address.isEmpty {
					Text(L("browser.empty")).font(.fbBody).foregroundStyle(FB.textTertiary)
						.multilineTextAlignment(.center).padding(24)
						.frame(maxWidth: .infinity, maxHeight: .infinity)
						.background(FB.canvas)
				}
			}
		}
		.background(FB.canvas)
		.overlay(alignment: .leading) { FB.divider.frame(width: 1) }
	}
}
