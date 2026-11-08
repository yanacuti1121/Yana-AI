import SwiftUI

// Overview: Yana's own page. Every number comes from `yana-rt` (audit chain, authority receipts) or git.

// Shared by the Overview and Tool approvals pages.
func decisionLabel(_ raw: String) -> (text: String, color: Color) {
	switch raw {
	case "Allow": return (L("dec.allowed"), FB.successText)
	case "HumanApprovalRequired": return (L("dec.needed"), FB.warningText)
	case "Deny": return (L("dec.denied"), FB.errorText)
	default: return (raw, FB.textSecondary)
	}
}

struct HomePage: View {
	@State private var data = RtClient.loadOverview()

	private var allowed: Int { data.activity.byDecision["allow", default: 0] }
	private var blocked: Int { data.activity.total - allowed }
	private var topTools: [(name: String, count: Int)] {
		data.activity.byTool.sorted { $0.value > $1.value }.prefix(6).map { ($0.key, $0.value) }
	}

	var body: some View {
		VStack(alignment: .leading, spacing: 14) {
			HStack(alignment: .top) {
				VStack(alignment: .leading, spacing: 4) {
					Text(L("nav.Overview")).font(.system(size: 24, weight: .semibold)).foregroundStyle(FB.text)
					Text(data.workspace).font(.fbCaption).foregroundStyle(FB.textSecondary).lineLimit(1).truncationMode(.middle)
				}
				Spacer()
				FBButton(title: L("refresh"), variant: .secondary, size: .small, icon: "refresh") { data = RtClient.loadOverview() }
			}

			if let error = data.error {
				FBAlert(kind: .error, text: error, closable: false)
			} else if data.activity.total == 0 {
				FBAlert(kind: .info, text: L("home.noActivity"), closable: false)
			}

			HStack(spacing: 12) {
				stat(L("home.toolCalls"), "\(data.activity.total)", note: L("home.toolCallsNote"), tone: FB.primaryText)
				stat(L("home.allowed"), "\(allowed)", note: L("home.allowedNote"), tone: FB.successText)
				stat(L("home.blocked"), "\(blocked)", note: L("home.blockedNote"), tone: blocked > 0 ? FB.warningText : FB.textSecondary)
				stat(L("home.waiting"), "\(data.pendingCount)", note: L("home.waitingNote"), tone: data.pendingCount > 0 ? FB.errorText : FB.textSecondary)
			}

			HStack(alignment: .top, spacing: 12) {
				panel(L("home.busiest")) {
					if topTools.isEmpty {
						Text(L("home.noActivityShort")).font(.fbBody).foregroundStyle(FB.textSecondary)
					} else {
						ForEach(topTools, id: \.name) { tool in
							HStack(spacing: 10) {
								Text(tool.name).font(.fbBody).foregroundStyle(FB.text).frame(width: 110, alignment: .leading)
								GeometryReader { geo in
									let ratio = CGFloat(tool.count) / CGFloat(topTools[0].count)
									Capsule().fill(FB.primary).frame(width: max(6, geo.size.width * ratio), height: 8).frame(maxHeight: .infinity)
								}
								.frame(height: 18)
								Text("\(tool.count)").font(.fb(12, .medium)).foregroundStyle(FB.textSecondary).frame(width: 36, alignment: .trailing)
							}
						}
					}
				}
				panel(L("home.latest")) {
					if data.latestDecisions.isEmpty {
						Text(L("home.noDecisions")).font(.fbBody).foregroundStyle(FB.textSecondary)
					} else {
						ForEach(data.latestDecisions) { receipt in
							let label = decisionLabel(receipt.decision)
							HStack(spacing: 8) {
								Text(receipt.capability).font(.fbBodyMedium).foregroundStyle(FB.text)
								Spacer(minLength: 8)
								Text(label.text).font(.fb(12, .medium)).foregroundStyle(label.color)
								Text(String(receipt.timestamp.prefix(10))).font(.fbCaption).foregroundStyle(FB.textTertiary)
							}
						}
					}
				}
				.frame(width: 440)
			}

			panel(L("home.workspace")) {
				HStack(spacing: 28) {
					fact(L("home.branch"), data.branch)
					fact("yana-rt", data.version)
					fact("Workspace", URL(fileURLWithPath: data.workspace).lastPathComponent)
				}
			}
			Spacer(minLength: 0)
		}
		.padding(EdgeInsets(top: 8, leading: 24, bottom: 24, trailing: 24))
		.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
	}

	private func stat(_ title: String, _ value: String, note: String, tone: Color) -> some View {
		VStack(alignment: .leading, spacing: 4) {
			Text(title).font(.fb(12, .medium)).foregroundStyle(FB.textSecondary)
			Text(value).font(.system(size: 30, weight: .semibold)).foregroundStyle(tone)
			Text(note).font(.fbCaption).foregroundStyle(FB.textTertiary)
		}
		.padding(14)
		.frame(maxWidth: .infinity, alignment: .leading)
		.background(RoundedRectangle(cornerRadius: FB.radiusXL).fill(FB.surface))
		.overlay(RoundedRectangle(cornerRadius: FB.radiusXL).stroke(FB.borderSubtle, lineWidth: 1))
	}

	private func fact(_ title: String, _ value: String) -> some View {
		VStack(alignment: .leading, spacing: 2) {
			Text(title).font(.fbCaption).foregroundStyle(FB.textTertiary)
			Text(value).font(.fbBodyMedium).foregroundStyle(FB.text)
		}
	}

	private func panel<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
		VStack(alignment: .leading, spacing: 10) {
			Text(title).font(.fbHeading5).foregroundStyle(FB.text)
			content()
		}
		.padding(14)
		.frame(maxWidth: .infinity, alignment: .topLeading)
		.background(RoundedRectangle(cornerRadius: FB.radiusXL).fill(FB.surface))
		.overlay(RoundedRectangle(cornerRadius: FB.radiusXL).stroke(FB.borderSubtle, lineWidth: 1))
	}
}
