import SwiftUI

// The feature frame taken from Goose (aaif-goose/goose, Apache-2.0): ten feature groups, each with the
// capabilities Goose offers inside it. Only the structure is borrowed. No Goose code is used.
// Every capability is "not connected" until yana-rt supplies real data, and the page says so plainly.

struct Capability: Identifiable {
	let id: String
	let icon: String
	let detail: String
}

struct Feature: Identifiable {
	let id: String
	let icon: String
	let title: String
	let summary: String
	let section: String?
	let capabilities: [Capability]
}

let features: [Feature] = [
	.init(id: "chat", icon: "message", title: "Chat", summary: "Talk to the agent and watch it work.", section: "Work", capabilities: [
		.init(id: "stream", icon: "message", detail: "Message stream with markdown and code"),
		.init(id: "composer", icon: "edit", detail: "Composer with attachments and images"),
		.init(id: "queue", icon: "list-ordered", detail: "Queue messages while the agent is busy"),
		.init(id: "mention", icon: "tag", detail: "@ mentions for files and resources"),
		.init(id: "thinking", icon: "layers", detail: "Show the model's reasoning, collapsible"),
		.init(id: "usage", icon: "chart-bar", detail: "Token and cost per message"),
	]),
	.init(id: "approvals", icon: "shield", title: "Tool approvals", summary: "Every tool call waits for your decision.", section: nil, capabilities: [
		.init(id: "calls", icon: "terminal", detail: "Each tool call with its arguments"),
		.init(id: "decide", icon: "check-circle", detail: "Allow once, allow always, or deny"),
		.init(id: "ask", icon: "help", detail: "The agent asks you a question mid-task"),
		.init(id: "status", icon: "loader", detail: "Live status of running calls"),
	]),
	.init(id: "sessions", icon: "inbox", title: "Sessions", summary: "Every conversation, kept and reopenable.", section: nil, capabilities: [
		.init(id: "list", icon: "list", detail: "All sessions, newest first"),
		.init(id: "resume", icon: "refresh", detail: "Reopen a session where it stopped"),
		.init(id: "sub", icon: "tree", detail: "Sub-agent sessions under their parent"),
		.init(id: "share", icon: "link", detail: "Copy a link to a message"),
	]),
	.init(id: "providers", icon: "cpu", title: "Providers", summary: "Which model does the thinking.", section: "Models", capabilities: [
		.init(id: "keys", icon: "key", detail: "Cloud providers with your own API keys"),
		.init(id: "local", icon: "monitor", detail: "Local models on this Mac"),
		.init(id: "sub", icon: "user", detail: "Use an existing Claude, ChatGPT or Gemini plan"),
		.init(id: "pick", icon: "sliders", detail: "Choose the model per session"),
	]),
	.init(id: "extensions", icon: "layers", title: "Extensions", summary: "MCP tools the agent can use.", section: nil, capabilities: [
		.init(id: "list", icon: "grid", detail: "Installed MCP extensions"),
		.init(id: "install", icon: "download", detail: "Install from a link, after Yana's review"),
		.init(id: "toggle", icon: "toggle", detail: "Turn each extension on or off"),
		.init(id: "apps", icon: "layout", detail: "Extension apps rendered inside the chat"),
	]),
	.init(id: "recipes", icon: "wand", title: "Recipes", summary: "Saved workflows you can run again.", section: "Automate", capabilities: [
		.init(id: "library", icon: "bookmark", detail: "Your recipe library"),
		.init(id: "params", icon: "form", detail: "Fill in parameters before a run"),
		.init(id: "consent", icon: "lock", detail: "Review what a recipe is allowed to do"),
		.init(id: "run", icon: "play", detail: "Run a recipe in a new session"),
	]),
	.init(id: "schedule", icon: "clock", title: "Scheduler", summary: "Runs that start on their own time.", section: nil, capabilities: [
		.init(id: "jobs", icon: "calendar", detail: "Scheduled recipes with a cron rule"),
		.init(id: "history", icon: "archive", detail: "What each past run did"),
		.init(id: "pause", icon: "pause", detail: "Pause or stop a schedule"),
	]),
	.init(id: "skills", icon: "zap", title: "Skills", summary: "Know-how the agent can load.", section: nil, capabilities: [
		.init(id: "browse", icon: "search", detail: "Browse installed skills"),
		.init(id: "enable", icon: "toggle", detail: "Enable or disable a skill"),
		.init(id: "view", icon: "file-text", detail: "Read what a skill tells the agent"),
	]),
	.init(id: "context", icon: "database", title: "Context", summary: "What the agent currently remembers.", section: "Control", capabilities: [
		.init(id: "xray", icon: "eye", detail: "See exactly what is in the context"),
		.init(id: "trim", icon: "scissors", detail: "Summarise or drop old turns"),
		.init(id: "limit", icon: "chart-pie", detail: "How much of the window is used"),
	]),
	.init(id: "system", icon: "monitor", title: "System", summary: "Voice, onboarding, git and diagnostics.", section: nil, capabilities: [
		.init(id: "voice", icon: "volume", detail: "Live voice input"),
		.init(id: "onboard", icon: "compass", detail: "First-run setup"),
		.init(id: "git", icon: "code", detail: "Current git branch in the header"),
		.init(id: "diag", icon: "info-circle", detail: "Diagnostics and error reports"),
	]),
]

struct CapabilityCard: View {
	let capability: Capability

	var body: some View {
		HStack(alignment: .top, spacing: 10) {
			FBIcon(name: capability.icon, size: 16, color: FB.primaryText)
				.frame(width: 32, height: 32)
				.background(RoundedRectangle(cornerRadius: FB.radiusMD).fill(FB.primarySubtle))
			VStack(alignment: .leading, spacing: 4) {
				Text(capability.detail).font(.fbBody).foregroundStyle(FB.text).fixedSize(horizontal: false, vertical: true)
				Text(L("feat.notConnected")).font(.fbCaption).foregroundStyle(FB.warningText)
			}
			Spacer(minLength: 0)
		}
		.padding(12)
		.frame(maxWidth: .infinity, minHeight: 72, alignment: .topLeading)
		.background(RoundedRectangle(cornerRadius: FB.radiusXL).fill(FB.surface))
		.overlay(RoundedRectangle(cornerRadius: FB.radiusXL).stroke(FB.borderSubtle, lineWidth: 1))
	}
}

struct FeaturePage: View {
	let feature: Feature
	// Two cards per row. A plain Grid (not LazyVGrid/ScrollView) so the headless --render check can draw it;
	// no feature has more than six capabilities, so it always fits the window.
	private var rows: [[Capability]] {
		stride(from: 0, to: feature.capabilities.count, by: 2).map { Array(feature.capabilities[$0 ..< min($0 + 2, feature.capabilities.count)]) }
	}

	var body: some View {
		VStack(alignment: .leading, spacing: 16) {
			VStack(alignment: .leading, spacing: 4) {
				Text(L("nav.\(feature.title)")).font(.system(size: 24, weight: .semibold)).foregroundStyle(FB.text)
				Text(feature.summary).font(.fbBody).foregroundStyle(FB.textSecondary)
			}
			FBAlert(kind: .warning, text: L("feat.planned"), closable: false)
			Grid(horizontalSpacing: 12, verticalSpacing: 12) {
				ForEach(rows.indices, id: \.self) { index in
					GridRow {
						ForEach(rows[index]) { CapabilityCard(capability: $0) }
						if rows[index].count == 1 { Color.clear }
					}
				}
			}
			Spacer(minLength: 0)
		}
		.padding(EdgeInsets(top: 8, leading: 24, bottom: 24, trailing: 24))
		.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
	}
}
