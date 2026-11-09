import SwiftUI
import AppKit

// The application shell, laid out like Codex and Goose: a narrow icon rail on the far left, a list sidebar
// that belongs to the chat section, and the page on the right. The two sidebars use the macOS sidebar
// material (frosted glass). That material is a live AppKit view, so image renders use a flat color instead.

// The window hides its title bar, but macOS still treats the top ~28 pt as the drag area: a button there
// moves the window instead of being pressed. Controls near the top edge sit at least this far down.
let titleBarClearance: CGFloat = 34

// Set by `--render`. ImageRenderer cannot draw AppKit-backed views (the material, Menu), so it gets stand-ins.
var isRenderingForImage = false

struct RailEntry: Identifiable {
	let id: String
	let icon: String
}

// The icons in the rail. `id` is the page key; the label comes from L("nav.<id>").
// Only pages backed by real data are listed. The planned pages in Features.swift (Extensions, Recipes,
// Scheduler, Sessions, Providers, Context, System) come back here once each is wired to yana-rt.
let railEntries: [RailEntry] = [
	.init(id: "Chat", icon: "message"),
	.init(id: "Overview", icon: "dashboard"),
	.init(id: "Tool approvals", icon: "shield"),
	.init(id: "Tasks", icon: "check-circle"),
	.init(id: "Skills", icon: "zap"),
	.init(id: "Plugins", icon: "layers"),
	.init(id: "Health", icon: "chart-pie"),
	.init(id: "Usage", icon: "chart-bar"),
]

// Sidebars are solid token colors. A behind-window material was tried first (2026-11-07): with macOS in
// dark mode it took the dark desktop color and turned the sidebar and the glass composer a muddy grey.
private let railColor = FB.chrome
private let sidebarColor = FB.chrome
private let dividerColor = FB.divider

struct SidebarBackground: View {
	var color: Color
	var body: some View {
		color.overlay(alignment: .trailing) { dividerColor.frame(width: 1) }
	}
}

// A white card with a thin border and a soft shadow (the composer).
struct GlassCard: ViewModifier {
	var radius: CGFloat

	func body(content: Content) -> some View {
		content
			.background(RoundedRectangle(cornerRadius: radius).fill(FB.canvas))
			.overlay(RoundedRectangle(cornerRadius: radius).stroke(dividerColor, lineWidth: 1))
			.shadow(color: FB.shadow, radius: 14, y: 4)
	}
}

extension View {
	func glassCard(radius: CGFloat = 22) -> some View { modifier(GlassCard(radius: radius)) }
}

struct RailButton: View {
	let icon: String
	let label: String
	let selected: Bool
	@State private var hover = false

	var body: some View {
		FBIcon(name: icon, size: 18, color: selected ? FB.primaryText : FB.textSecondary)
			.frame(width: 40, height: 40)
			.background(RoundedRectangle(cornerRadius: 12).fill(selected ? FB.canvas : hover ? FB.hoverOnChrome : .clear))
			.overlay(RoundedRectangle(cornerRadius: 12).stroke(selected ? FB.primaryBorder : .clear, lineWidth: 1))
			.contentShape(Rectangle())
			.help(label)
			.onHover { hover = $0 }
			.animation(FB.fast, value: hover)
	}
}

struct IconRail: View {
	@Binding var selected: String
	@EnvironmentObject private var runtime: RuntimeUpdater
	@EnvironmentObject private var terminals: TerminalStore
	@EnvironmentObject private var appUpdater: AppUpdater
	@EnvironmentObject private var engine: ChatEngine
	@State private var showUpdate = false

	var body: some View {
		VStack(spacing: 6) {
			ForEach(railEntries) { entry in
				RailButton(icon: entry.icon, label: L("nav.\(entry.id)"), selected: selected == entry.id)
					.onTapGesture { selected = entry.id }
			}
			Spacer(minLength: 0)
			// A newer Yana app on GitHub Releases, kept reachable after "Remind me later".
			if appUpdater.available != nil && !appUpdater.showSheet {
				UpdatePill { appUpdater.showSheet = true }.padding(.bottom, 4)
			}
			// Install/update notice, folded into one button (red dot) instead of a banner over the content.
			if runtime.showsBanner {
				RailButton(icon: "download", label: L("rt.updateButton"), selected: showUpdate)
					.overlay(alignment: .topTrailing) { Circle().fill(FB.error).frame(width: 8, height: 8).offset(x: -6, y: 6) }
					.onTapGesture { showUpdate.toggle() }
					.popover(isPresented: $showUpdate, arrowEdge: .trailing) {
						// Install runs in the app's own terminal panel; the app keeps working meanwhile.
						RuntimeBanner(updater: runtime) {
							runtime.install(in: terminals, folder: engine.workspace)
							selected = "Chat" // the terminal panel lives on the chat page
							showUpdate = false
						}
						.frame(width: 520).padding(10)
					}
			}
			RailButton(icon: "settings", label: L("nav.Settings"), selected: selected == "Settings")
				.onTapGesture { selected = "Settings" }
		}
		// 76 wide with a 52 pt top inset: the window's close/minimize/zoom buttons (about 70 pt wide, size
		// fixed by macOS) sit inside the rail instead of spilling over its edge, with room above the icons.
		.padding(EdgeInsets(top: 52, leading: 18, bottom: 14, trailing: 18))
		.frame(width: 76)
		.frame(maxHeight: .infinity)
		.background(SidebarBackground(color: railColor))
	}
}

// The list sidebar of the chat section. It shows only real things: the current project and, when
// yana-rt can list them, chats. Today there is nothing to list, and it says so instead of inventing rows.
struct ChatSidebar: View {
	@EnvironmentObject private var engine: ChatEngine
	@ObservedObject private var history = ChatHistoryStore.shared
	let collapse: () -> Void

	var body: some View {
		VStack(alignment: .leading, spacing: 4) {
			HStack(spacing: 8) {
				RabbitLogo(cell: 1.3)
				Text("Yana").font(.system(size: 19, weight: .semibold)).foregroundStyle(FB.text)
				Spacer()
				FBIconButton(icon: "sidebar", variant: .ghost, size: .small, tooltip: L("sidebar.hide"), action: collapse)
			}
			.padding(EdgeInsets(top: 4, leading: 6, bottom: 10, trailing: 2))

			// Clears the conversation and starts a new yana-rt session id.
			SidebarRow(icon: "edit", title: L("chat.new"), strong: true)
				.onTapGesture { engine.reset() }
				.opacity(engine.running ? 0.4 : 1)

			SidebarHeading(L("chat.projects"))
			SidebarRow(icon: "folder", title: URL(fileURLWithPath: engine.workspace).lastPathComponent, strong: false)
				.help(engine.workspace)

			// Saved chats (ChatHistory.swift), newest first; the open one is highlighted. Right-click deletes.
			SidebarHeading(L("chat.recent"))
			ScrollView {
				LazyVStack(alignment: .leading, spacing: 2) {
					if engine.title != nil && history.chat(engine.currentChatID) == nil {
						RecentRow(title: engine.title ?? "", date: nil, current: true)
					}
					ForEach(history.chats) { chat in
						RecentRow(title: chat.title, date: chat.updated, current: chat.id == engine.currentChatID)
							.onTapGesture { engine.open(chat) }
							.contextMenu {
								Button(L("history.delete"), role: .destructive) {
									if chat.id == engine.currentChatID { engine.reset() }
									history.delete(chat.id)
								}
							}
					}
					if history.chats.isEmpty && engine.title == nil {
						Text(L("chat.noChats")).font(.fbCaption).foregroundStyle(FB.textSecondary)
							.padding(.horizontal, 10).padding(.vertical, 6)
					}
				}
			}
			.opacity(engine.running ? 0.6 : 1)
			if let error = history.lastError { Text(error).font(.fbCaption).foregroundStyle(FB.errorText).padding(.horizontal, 10) }
		}
		.padding(EdgeInsets(top: 38, leading: 12, bottom: 14, trailing: 12))
		.frame(width: 252)
		.frame(maxHeight: .infinity)
		.background(SidebarBackground(color: sidebarColor))
	}
}

// One saved chat in "Recent": its first message and when it was last used.
struct RecentRow: View {
	let title: String
	let date: Date?
	let current: Bool
	@State private var hover = false

	var body: some View {
		HStack(spacing: 8) {
			Text(title).font(.system(size: 13, weight: current ? .semibold : .regular)).foregroundStyle(FB.text).lineLimit(1)
			Spacer(minLength: 4)
			if let date {
				Text(date, format: .relative(presentation: .numeric)).font(.system(size: 10)).foregroundStyle(FB.textTertiary).lineLimit(1)
			}
		}
		.padding(.horizontal, 10)
		.frame(height: 30)
		.background(RoundedRectangle(cornerRadius: 9).fill(current ? FB.primarySubtle : (hover ? FB.hoverOnChrome : .clear)))
		.contentShape(Rectangle())
		.onHover { hover = $0 }
		.help(title)
	}
}

struct SidebarHeading: View {
	let text: String
	init(_ text: String) { self.text = text }

	var body: some View {
		Text(text).font(.system(size: 12, weight: .medium)).foregroundStyle(FB.textSecondary)
			.padding(EdgeInsets(top: 14, leading: 10, bottom: 4, trailing: 10))
	}
}

struct SidebarRow: View {
	let icon: String
	let title: String
	let strong: Bool
	@State private var hover = false

	var body: some View {
		HStack(spacing: 9) {
			FBIcon(name: icon, size: 15, color: strong ? FB.primaryText : FB.textSecondary)
			Text(title).font(.system(size: 13, weight: strong ? .semibold : .regular)).foregroundStyle(FB.text).lineLimit(1)
			Spacer(minLength: 0)
		}
		.padding(.horizontal, 10)
		.frame(height: 32)
		.background(RoundedRectangle(cornerRadius: 10).fill(hover ? FB.hoverOnChrome : .clear))
		.contentShape(Rectangle())
		.onHover { hover = $0 }
	}
}
