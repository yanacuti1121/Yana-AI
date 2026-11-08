import AVFoundation
import AppKit
import SwiftUI

// What each guide page shows. A real screen recording wins when the app bundle has one (resource
// "tour-<page id>.mp4" or ".mov", recorded by hand); otherwise a small drawn copy of the real screen plays
// the action on a loop. The drawn demos read the time from a TimelineView, so nothing else in the sheet is
// animated by them (a shared repeating animation once made the buttons bob).

struct TourMedia: View {
	let pageID: String

	var body: some View {
		if let url = Self.video(pageID) {
			LoopingVideo(url: url)
		} else {
			TimelineView(.animation) { context in
				let t = context.date.timeIntervalSinceReferenceDate
				switch pageID {
				case "welcome": WelcomeDemo(t: t)
				case "models": ModelDemo(t: t)
				case "approve": ApproveDemo(t: t)
				case "tools": ToolsDemo(t: t)
				default: MemoryDemo(t: t)
				}
			}
		}
	}

	static func video(_ id: String) -> URL? {
		Bundle.module.url(forResource: "tour-\(id)", withExtension: "mp4")
			?? Bundle.module.url(forResource: "tour-\(id)", withExtension: "mov")
	}
}

// Muted, looping, no controls: a demo clip, not a movie.
private struct LoopingVideo: NSViewRepresentable {
	let url: URL

	final class PlayerView: NSView {
		private let player = AVQueuePlayer()
		private var looper: AVPlayerLooper?
		private let playerLayer = AVPlayerLayer()

		init(url: URL) {
			super.init(frame: .zero)
			wantsLayer = true
			player.isMuted = true
			looper = AVPlayerLooper(player: player, templateItem: AVPlayerItem(url: url))
			playerLayer.player = player
			playerLayer.videoGravity = .resizeAspectFill
			layer?.addSublayer(playerLayer)
			player.play()
		}

		required init?(coder: NSCoder) { nil }

		override func layout() {
			super.layout()
			playerLayer.frame = bounds
		}
	}

	func makeNSView(context: Context) -> PlayerView { PlayerView(url: url) }
	func updateNSView(_ view: PlayerView, context: Context) {}
}

// Seconds into the current loop of `cycle` seconds.
private func phase(_ t: Double, _ cycle: Double) -> Double { t.truncatingRemainder(dividingBy: cycle) }
// 0 before `start`, 1 after `start + length`, linear between.
private func ramp(_ p: Double, _ start: Double, _ length: Double = 0.3) -> Double { min(max((p - start) / length, 0), 1) }

// macOS window buttons (close, minimize, zoom) for the mini window.
private let windowLights: [Color] = [Color(hex: 0xFF5F57), Color(hex: 0xFEBC2E), Color(hex: 0x28C840)]

// A small app window frame the demos draw into.
private struct MiniWindow<Content: View>: View {
	@ViewBuilder let content: Content

	var body: some View {
		VStack(spacing: 0) {
			HStack(spacing: 5) {
				ForEach(0 ..< 3, id: \.self) { i in Circle().fill(windowLights[i]).frame(width: 8, height: 8) }
				Spacer()
			}
			.padding(8)
			content.frame(maxWidth: .infinity, maxHeight: .infinity)
		}
		.background(RoundedRectangle(cornerRadius: 12).fill(FB.canvas))
		.overlay(RoundedRectangle(cornerRadius: 12).stroke(FB.border, lineWidth: 1))
		.shadow(color: FB.primary.opacity(0.15), radius: 18, y: 8)
	}
}

private struct WelcomeDemo: View {
	let t: Double
	private let question = "Tóm tắt giúp mình file báo cáo này"
	private let answer = "Báo cáo có 3 ý chính: doanh thu quý tăng 12%, chi phí quảng cáo giảm, cần tuyển thêm 2 người."

	var body: some View {
		let p = phase(t, 7)
		let shown = Int(Double(answer.count) * min(max((p - 1.6) / 3.2, 0), 1))
		MiniWindow {
			VStack(alignment: .leading, spacing: 10) {
				HStack {
					Spacer()
					Text("📎 bao-cao-quy3.pdf\n\(question)").font(.system(size: 12)).foregroundStyle(FB.text)
						.padding(10).background(RoundedRectangle(cornerRadius: 12).fill(FB.primarySubtle))
				}
				.opacity(ramp(p, 0.4))
				Text(String(answer.prefix(shown))).font(.system(size: 12)).foregroundStyle(FB.text)
					.frame(maxWidth: .infinity, alignment: .leading)
				Spacer(minLength: 0)
				HStack {
					Text("Hỏi Yana…").font(.system(size: 11)).foregroundStyle(FB.textTertiary)
					Spacer()
					Circle().fill(FB.primary).frame(width: 18, height: 18)
				}
				.padding(8).background(RoundedRectangle(cornerRadius: 10).stroke(FB.border))
			}
			.padding(.horizontal, 14).padding(.bottom, 12)
		}
	}
}

private struct ModelDemo: View {
	let t: Double
	private let rows: [(group: String?, name: String)] =
		[("Ollama · trên máy", "llama3.2"), (nil, "qwen2.5-coder"), ("Anthropic", "claude-sonnet"), ("Groq", "qwen3-32b")]

	var body: some View {
		let p = phase(t, 6.5)
		let open = p > 0.8 && p < 4.2
		let target = 1
		let hover = p < 1.6 ? -1 : min(Int((p - 1.6) / 0.5), target)
		let picked = p >= 4.2 || p < 0.1 ? rows[target].name : "Chọn model"
		MiniWindow {
			VStack(alignment: .trailing, spacing: 6) {
				Spacer(minLength: 0)
				if open {
					VStack(alignment: .leading, spacing: 2) {
						ForEach(rows.indices, id: \.self) { i in
							if let group = rows[i].group {
								Text(group).font(.system(size: 9, weight: .semibold)).foregroundStyle(FB.textTertiary).padding(.top, 4)
							}
							Text(rows[i].name).font(.system(size: 12)).foregroundStyle(i == hover ? FB.onPrimary : FB.text)
								.padding(.horizontal, 8).padding(.vertical, 4)
								.frame(maxWidth: .infinity, alignment: .leading)
								.background(RoundedRectangle(cornerRadius: 6).fill(i == hover ? FB.primary : .clear))
						}
					}
					.padding(8).frame(width: 190)
					.background(RoundedRectangle(cornerRadius: 10).fill(FB.canvas))
					.overlay(RoundedRectangle(cornerRadius: 10).stroke(FB.border))
				}
				HStack(spacing: 6) {
					Image(systemName: "cpu").font(.system(size: 11))
					Text(picked).font(.system(size: 12, weight: .medium))
					Image(systemName: "chevron.down").font(.system(size: 9))
				}
				.foregroundStyle(FB.text).padding(.horizontal, 10).padding(.vertical, 6)
				.background(Capsule().fill(open ? FB.primarySubtle : FB.surfaceSecondary))
			}
			.padding(.horizontal, 14).padding(.bottom, 14)
		}
	}
}

private struct ApproveDemo: View {
	let t: Double
	var body: some View {
		let p = phase(t, 6)
		let pressed = p > 2.6 && p < 3.0
		let done = p >= 3.0
		MiniWindow {
			VStack(alignment: .leading, spacing: 8) {
				Label("Yana muốn chạy một lệnh", systemImage: "shield").font(.system(size: 12, weight: .semibold)).foregroundStyle(FB.text)
				Text("npm test").font(.system(size: 12, design: .monospaced)).foregroundStyle(FB.text)
					.padding(8).frame(maxWidth: .infinity, alignment: .leading)
					.background(RoundedRectangle(cornerRadius: 6).fill(FB.surfaceTertiary))
				Text("Để kiểm tra bản sửa vừa viết.").font(.system(size: 11)).foregroundStyle(FB.textSecondary)
				if done {
					Label("Đã cho phép · đã ghi lại", systemImage: "checkmark.circle.fill").font(.system(size: 12, weight: .medium))
						.foregroundStyle(FB.successText).opacity(ramp(p, 3.0))
				} else {
					HStack {
						Spacer()
						Text("Từ chối").font(.system(size: 12)).padding(.horizontal, 12).padding(.vertical, 5)
							.background(RoundedRectangle(cornerRadius: 6).stroke(FB.border))
						Text("Cho phép").font(.system(size: 12, weight: .semibold)).foregroundStyle(FB.onPrimary)
							.padding(.horizontal, 12).padding(.vertical, 5)
							.background(RoundedRectangle(cornerRadius: 6).fill(pressed ? FB.primaryPressed : FB.primary))
							.scaleEffect(pressed ? 0.95 : 1)
					}
				}
			}
			.padding(12)
			.background(RoundedRectangle(cornerRadius: 10).fill(FB.warningSubtle))
			.overlay(RoundedRectangle(cornerRadius: 10).stroke(FB.warningBorder))
			.opacity(ramp(p, 0.3)).padding(.horizontal, 14).padding(.bottom, 14)
		}
	}
}

private struct ToolsDemo: View {
	let t: Double
	private let lines = ["$ yana-rt --version", "yana-rt 1.5.2", "$ npm test", "✓ 22 passed, 0 failed"]

	var body: some View {
		let p = phase(t, 7)
		let shown = min(Int(max(p - 0.6, 0) / 0.9), lines.count)
		MiniWindow {
			HStack(spacing: 0) {
				VStack(alignment: .leading, spacing: 6) {
					ForEach(0 ..< 4, id: \.self) { i in
						RoundedRectangle(cornerRadius: 3).fill(FB.surfaceTertiary).frame(width: CGFloat(60 + i * 14), height: 7)
					}
					Spacer()
				}
				.padding(12).frame(width: 110, alignment: .leading)
				FB.divider.frame(width: 1)
				VStack(alignment: .leading, spacing: 4) {
					Text("Terminal").font(.system(size: 10, weight: .semibold)).foregroundStyle(FB.textSecondary)
					ForEach(0 ..< shown, id: \.self) { i in
						Text(lines[i]).font(.system(size: 11, design: .monospaced))
							.foregroundStyle(lines[i].hasPrefix("✓") ? FB.successText : FB.text)
					}
					Spacer()
				}
				.padding(12).frame(maxWidth: .infinity, alignment: .leading)
			}
		}
	}
}

private struct MemoryDemo: View {
	let t: Double
	private let fact = "Bạn thích câu trả lời ngắn gọn"
	var body: some View {
		let p = phase(t, 6.5)
		let saved = p >= 3.0
		MiniWindow {
			VStack(alignment: .leading, spacing: 10) {
				if saved {
					Label("Đã nhớ: \(fact)", systemImage: "bookmark.fill").font(.system(size: 12))
						.foregroundStyle(FB.primaryText).opacity(ramp(p, 3.0))
				} else {
					HStack(spacing: 8) {
						VStack(alignment: .leading, spacing: 2) {
							Text("Yana muốn ghi nhớ:").font(.system(size: 10)).foregroundStyle(FB.textSecondary)
							Text(fact).font(.system(size: 12)).foregroundStyle(FB.text)
						}
						Spacer()
						Text("Bỏ qua").font(.system(size: 11)).foregroundStyle(FB.textSecondary)
						Text("Nhớ").font(.system(size: 11, weight: .semibold)).foregroundStyle(FB.onPrimary)
							.padding(.horizontal, 10).padding(.vertical, 4)
							.background(RoundedRectangle(cornerRadius: 6).fill(p > 2.6 ? FB.primaryPressed : FB.primary))
					}
					.padding(10)
					.background(RoundedRectangle(cornerRadius: 10).fill(FB.primarySubtle))
					.opacity(ramp(p, 0.6))
				}
				Text("Cài đặt → Bộ nhớ").font(.system(size: 10, weight: .semibold)).foregroundStyle(FB.textTertiary)
				VStack(alignment: .leading, spacing: 4) {
					Text("• Dự án dùng màu chính #1470F0").font(.system(size: 11))
					if saved { Text("• \(fact)").font(.system(size: 11)).opacity(ramp(p, 3.3)) }
				}
				.foregroundStyle(FB.text)
				Spacer(minLength: 0)
			}
			.padding(.horizontal, 14).padding(.bottom, 12)
		}
	}
}
