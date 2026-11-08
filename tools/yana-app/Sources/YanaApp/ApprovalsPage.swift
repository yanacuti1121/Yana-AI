import SwiftUI

// Tool approvals: what yana-rt decided about each capability, and what actually ran. Read-only.
// Source: `yana-rt authority pending-approvals | receipts | executions`. Nothing here is invented.

struct ApprovalsPage: View {
	@State private var data = RtClient.loadApprovals()

	private func shortTime(_ iso: String) -> String { iso.replacingOccurrences(of: "T", with: " ").prefix(16).description }

	// "Success" and "Error" are translated; any other outcome from yana-rt is shown as it came.
	private func outcome(_ raw: String) -> String {
		let key = "outcome.\(raw)"
		let text = L(key)
		return text == key ? raw : text
	}

	private func outcomeColor(_ raw: String) -> Color { raw == "Success" ? FB.successText : FB.errorText }

	var body: some View {
		VStack(alignment: .leading, spacing: 14) {
			HStack(alignment: .top) {
				VStack(alignment: .leading, spacing: 4) {
					Text(L("nav.Tool approvals")).font(.system(size: 24, weight: .semibold)).foregroundStyle(FB.text)
					Text(L("appr.subtitle")).font(.fbBody).foregroundStyle(FB.textSecondary)
				}
				Spacer()
				FBButton(title: L("refresh"), variant: .secondary, size: .small, icon: "refresh") { data = RtClient.loadApprovals() }
			}

			if let error = data.error {
				FBAlert(kind: .error, text: error, closable: false)
			} else {
				FBAlert(kind: .info, text: L("appr.readonly"), closable: false)
				HStack(alignment: .top, spacing: 12) {
					section(L("appr.waiting"), count: data.pending.count) {
						if data.pending.isEmpty {
							Text(L("appr.nothingWaiting")).font(.fbBody).foregroundStyle(FB.textSecondary)
						} else {
							ForEach(data.pending) { Text($0.id).font(.fbBody).foregroundStyle(FB.text) }
						}
					}
					.frame(width: 300)
					section(L("appr.decisions"), count: data.decisions.count) {
						ForEach(data.decisions) { receipt in
							let label = decisionLabel(receipt.decision)
							row(title: receipt.capability, tag: label.text, tagColor: label.color, note: receipt.reason, time: receipt.timestamp)
						}
					}
				}
				section(L("appr.whatRan"), count: data.executions.count) {
					ForEach(data.executions) { run in
						row(title: run.capabilityId, tag: outcome(run.outcome), tagColor: outcomeColor(run.outcome), note: nil, time: run.startedAt)
					}
				}
			}
			Spacer(minLength: 0)
		}
		.padding(EdgeInsets(top: 8, leading: 24, bottom: 24, trailing: 24))
		.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
	}

	private func section<Content: View>(_ title: String, count: Int, @ViewBuilder content: () -> Content) -> some View {
		VStack(alignment: .leading, spacing: 8) {
			HStack(spacing: 8) {
				Text(title).font(.fbHeading5).foregroundStyle(FB.text)
				Text("\(count)").font(.fb(12, .medium)).foregroundStyle(FB.primaryText)
					.padding(.horizontal, 8).frame(height: 20).background(Capsule().fill(FB.primarySubtle))
			}
			content()
		}
		.padding(14)
		.frame(maxWidth: .infinity, alignment: .topLeading)
		.background(RoundedRectangle(cornerRadius: FB.radiusXL).fill(FB.surface))
		.overlay(RoundedRectangle(cornerRadius: FB.radiusXL).stroke(FB.borderSubtle, lineWidth: 1))
	}

	private func row(title: String, tag: String, tagColor: Color, note: String?, time: String) -> some View {
		HStack(alignment: .top, spacing: 10) {
			VStack(alignment: .leading, spacing: 2) {
				Text(title).font(.fbBodyMedium).foregroundStyle(FB.text)
				if let note { Text(note).font(.fbCaption).foregroundStyle(FB.textSecondary).lineLimit(1) }
			}
			Spacer(minLength: 8)
			Text(tag).font(.fb(12, .medium)).foregroundStyle(tagColor)
			Text(shortTime(time)).font(.fbCaption).foregroundStyle(FB.textTertiary).frame(width: 110, alignment: .trailing)
		}
		.padding(.vertical, 4)
	}
}
