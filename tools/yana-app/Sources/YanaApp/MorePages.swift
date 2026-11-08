import SwiftUI

// Health, Connectors, Tasks and Skills. All read-only, all from yana-rt or the skill folders (RtExtra.swift).

func statusColor(_ status: String) -> Color {
	switch status.uppercased() {
	case "OK", "SUCCESS": return FB.successText
	case "WARN", "HIGH", "MEDIUM", "CREDENTIAL-REQUIRED": return FB.warningText
	case "FAIL", "ERROR", "CRITICAL": return FB.errorText
	default: return FB.textSecondary
	}
}

struct PageHeader: View {
	let title: String
	let subtitle: String
	let refresh: () -> Void

	var body: some View {
		HStack(alignment: .top) {
			VStack(alignment: .leading, spacing: 4) {
				Text(title).font(.system(size: 24, weight: .semibold)).foregroundStyle(FB.text)
				Text(subtitle).font(.fbBody).foregroundStyle(FB.textSecondary)
			}
			Spacer()
			FBButton(title: L("refresh"), variant: .secondary, size: .small, icon: "refresh", action: refresh)
		}
	}
}

struct Panel<Content: View>: View {
	let title: String
	var count: Int? = nil
	@ViewBuilder var content: Content

	var body: some View {
		VStack(alignment: .leading, spacing: 8) {
			HStack(spacing: 8) {
				Text(title).font(.fbHeading5).foregroundStyle(FB.text)
				if let count {
					Text("\(count)").font(.fb(12, .medium)).foregroundStyle(FB.primaryText)
						.padding(.horizontal, 8).frame(height: 20).background(Capsule().fill(FB.primarySubtle))
				}
			}
			content
		}
		.padding(14)
		.frame(maxWidth: .infinity, alignment: .topLeading)
		.background(RoundedRectangle(cornerRadius: FB.radiusXL).fill(FB.surface))
		.overlay(RoundedRectangle(cornerRadius: FB.radiusXL).stroke(FB.borderSubtle, lineWidth: 1))
	}
}

struct Tag: View {
	let text: String
	var body: some View {
		Text(text).font(.fb(12, .medium)).foregroundStyle(statusColor(text)).lineLimit(1)
	}
}

private struct PageScroll<Content: View>: View {
	@ViewBuilder var content: Content
	var body: some View {
		ScrollView {
			VStack(alignment: .leading, spacing: 14) { content }
				.padding(EdgeInsets(top: 8, leading: 24, bottom: 24, trailing: 24))
				.frame(maxWidth: .infinity, alignment: .topLeading)
		}
	}
}

private struct Loading: View {
	var body: some View { Text(L("loading")).font(.fbBody).foregroundStyle(FB.textSecondary) }
}

struct HealthPage: View {
	@State private var data: HealthData? = nil

	var body: some View {
		PageScroll {
			PageHeader(title: L("nav.Health"), subtitle: L("health.subtitle")) { Task { await load() } }
			if let data {
				if let error = data.error { FBAlert(kind: .error, text: error, closable: false) }
				if let score = data.score {
					Panel(title: L("health.score")) {
						HStack(alignment: .firstTextBaseline, spacing: 14) {
							Text("\(score.score)/100").font(.system(size: 30, weight: .semibold)).foregroundStyle(statusColor(score.riskLevel))
							Tag(text: score.riskLevel)
							Text("\(score.filesScanned) \(L("health.files"))").font(.fbCaption).foregroundStyle(FB.textTertiary)
						}
						Text("CRITICAL \(score.summary.critical) · HIGH \(score.summary.high) · MEDIUM \(score.summary.medium) · LOW \(score.summary.low)")
							.font(.fbCaption).foregroundStyle(FB.textSecondary)
					}
				}
				if let doctor = data.doctor {
					Panel(title: L("health.checks"), count: doctor.checks.count) {
						ForEach(doctor.checks) { check in
							HStack(alignment: .top, spacing: 10) {
								Tag(text: check.status).frame(width: 46, alignment: .leading)
								VStack(alignment: .leading, spacing: 2) {
									Text(check.label).font(.fbBodyMedium).foregroundStyle(FB.text)
									Text(check.detail).font(.fbCaption).foregroundStyle(FB.textSecondary)
									if !check.fix.isEmpty { Text(check.fix).font(.fbCaption).foregroundStyle(FB.warningText) }
								}
							}
						}
					}
				}
				Panel(title: L("health.findings"), count: data.groups.count) {
					ForEach(data.groups) { group in
						HStack(alignment: .top, spacing: 10) {
							Tag(text: group.severity).frame(width: 70, alignment: .leading)
							VStack(alignment: .leading, spacing: 2) {
								Text(group.description).font(.fbBodyMedium).foregroundStyle(FB.text)
								Text("\(group.files.count) \(L("health.filesCount")) · \(group.files.first ?? "")")
									.font(.fbCaption).foregroundStyle(FB.textSecondary).lineLimit(1).truncationMode(.middle)
							}
						}
					}
				}
			} else {
				Loading()
			}
		}
		.task { await load() }
	}

	private func load() async {
		data = nil
		data = await Task.detached { RtClient.loadHealth() }.value
	}
}

struct ConnectorsPage: View {
	@State private var connectors: [Connector]? = nil
	@State private var error: String? = nil

	private func stateLabel(_ state: String) -> String {
		switch state {
		case "credential-required": return L("conn.credentialRequired")
		case "disabled": return L("conn.disabled")
		default: return state
		}
	}

	var body: some View {
		PageScroll {
			PageHeader(title: L("nav.Connectors"), subtitle: L("conn.subtitle")) { Task { await load() } }
			if let error { FBAlert(kind: .error, text: error, closable: false) }
			if let connectors {
				Panel(title: L("nav.Connectors"), count: connectors.count) {
					ForEach(connectors) { item in
						HStack(alignment: .top, spacing: 10) {
							VStack(alignment: .leading, spacing: 2) {
								Text(item.name).font(.fbBodyMedium).foregroundStyle(FB.text)
								Text(item.description).font(.fbCaption).foregroundStyle(FB.textSecondary)
								Text("\(L("conn.enabled")): \(item.enabledScopes.isEmpty ? L("conn.none") : item.enabledScopes.joined(separator: ", ")) / \(item.allowedScopes.joined(separator: ", "))")
									.font(.fbCaption).foregroundStyle(FB.textTertiary)
							}
							Spacer(minLength: 8)
							Text(stateLabel(item.connectionState)).font(.fb(12, .medium))
								.foregroundStyle(item.connectionState == "disabled" ? FB.textSecondary : statusColor(item.connectionState))
						}
						.padding(.vertical, 4)
					}
				}
			} else if error == nil {
				Loading()
			}
		}
		.task { await load() }
	}

	private func load() async {
		connectors = nil
		error = nil
		switch await Task.detached(operation: { RtClient.loadConnectors() }).value {
		case .success(let list): connectors = list
		case .failure(let failure): error = failure.message
		}
	}
}

struct TasksPage: View {
	@State private var loaded = false
	@State private var tasks: [LooseItem] = []
	@State private var leases: [LooseItem] = []
	@State private var error: String? = nil

	var body: some View {
		PageScroll {
			PageHeader(title: L("nav.Tasks"), subtitle: L("tasks.subtitle")) { Task { await load() } }
			if let error { FBAlert(kind: .error, text: error, closable: false) }
			if !loaded {
				Loading()
			} else {
				list(L("tasks.tasks"), tasks, empty: L("tasks.noTasks"))
				list(L("tasks.leases"), leases, empty: L("tasks.noLeases"))
			}
		}
		.task { await load() }
	}

	private func list(_ title: String, _ items: [LooseItem], empty: String) -> some View {
		Panel(title: title, count: items.count) {
			if items.isEmpty {
				Text(empty).font(.fbBody).foregroundStyle(FB.textSecondary)
			}
			ForEach(items) { item in
				HStack {
					Text(item.title).font(.fbBodyMedium).foregroundStyle(FB.text)
					Spacer()
					Tag(text: item.status)
				}
			}
		}
	}

	private func load() async {
		loaded = false
		let result = await Task.detached { RtClient.loadTasksAndLeases() }.value
		tasks = result.tasks
		leases = result.leases
		error = result.error
		loaded = true
	}
}

struct SkillsPage: View {
	@State private var skills: [SkillInfo]? = nil
	@State private var query = ""

	private var shown: [SkillInfo] {
		guard let skills else { return [] }
		let q = query.trimmingCharacters(in: .whitespaces).lowercased()
		return q.isEmpty ? skills : skills.filter { $0.id.lowercased().contains(q) || $0.description.lowercased().contains(q) }
	}

	var body: some View {
		PageScroll {
			PageHeader(title: L("nav.Skills"), subtitle: L("skills.subtitle")) { Task { await load() } }
			TextField(L("skills.search"), text: $query)
				.textFieldStyle(.plain).font(.fbBody)
				.padding(.horizontal, 12).frame(height: 34)
				.background(RoundedRectangle(cornerRadius: 10).fill(FB.surface))
				.overlay(RoundedRectangle(cornerRadius: 10).stroke(FB.border, lineWidth: 1))
				.frame(maxWidth: 420)
			if skills == nil {
				Loading()
			} else {
				Panel(title: L("nav.Skills"), count: shown.count) {
					if shown.isEmpty { Text(L("skills.none")).font(.fbBody).foregroundStyle(FB.textSecondary) }
					LazyVStack(alignment: .leading, spacing: 8) {
						ForEach(shown) { skill in
							VStack(alignment: .leading, spacing: 2) {
								Text(skill.id).font(.fbBodyMedium).foregroundStyle(FB.text)
								if !skill.description.isEmpty {
									Text(skill.description).font(.fbCaption).foregroundStyle(FB.textSecondary).lineLimit(2)
								}
							}
						}
					}
				}
			}
		}
		.task { await load() }
	}

	private func load() async {
		skills = nil
		skills = await Task.detached { RtClient.loadSkills() }.value
	}
}
