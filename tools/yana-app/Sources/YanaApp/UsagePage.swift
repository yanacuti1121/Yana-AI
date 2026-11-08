import SwiftUI

// Token usage from yana-rt's own ledger, `.yana-ai/ledger.jsonl` (one CostEntry per model call, see
// src/cost.rs) and its spend policy, `.yana-ai/cost-policy.json`. Read-only: the app never writes either.
// The dollar column is yana-rt's estimate from per-tier rates, not a bill, and the page says so.

struct LedgerEntry: Decodable, Identifiable {
	let id: String
	let ts: String
	let task: String
	let tier: String
	let model: String
	let inputTokens: Int
	let outputTokens: Int
	let costUsd: Double
	var tokens: Int { inputTokens + outputTokens }
	var day: String { String(ts.prefix(10)) } // UTC date, as written by yana-rt
}

struct CostPolicy: Decodable {
	let dailyBudgetUsd: Double
	let monthlyBudgetUsd: Double?
}

struct UsageData {
	var entries: [LedgerEntry] = []
	var policy: CostPolicy? = nil
	var skippedLines = 0

	static func load(workspace: String) -> UsageData {
		let dir = URL(fileURLWithPath: workspace).appendingPathComponent(".yana-ai")
		let decoder = JSONDecoder()
		decoder.keyDecodingStrategy = .convertFromSnakeCase
		var data = UsageData()
		if let text = try? String(contentsOf: dir.appendingPathComponent("ledger.jsonl"), encoding: .utf8) {
			for line in text.split(separator: "\n") where !line.trimmingCharacters(in: .whitespaces).isEmpty {
				if let entry = try? decoder.decode(LedgerEntry.self, from: Data(line.utf8)) {
					data.entries.append(entry)
				} else {
					data.skippedLines += 1
				}
			}
		}
		if let raw = try? Data(contentsOf: dir.appendingPathComponent("cost-policy.json")) {
			data.policy = try? decoder.decode(CostPolicy.self, from: raw)
		}
		return data
	}
}

struct UsagePage: View {
	@State private var data: UsageData? = nil
	private static let chartDays = 14
	private static let recentCount = 15
	private static let barHeight: CGFloat = 90

	private static let utcDay: DateFormatter = {
		let f = DateFormatter()
		f.dateFormat = "yyyy-MM-dd"
		f.timeZone = TimeZone(identifier: "UTC")
		f.locale = Locale(identifier: "en_US_POSIX")
		return f
	}()

	var body: some View {
		ScrollView {
			VStack(alignment: .leading, spacing: 14) {
				PageHeader(title: L("nav.Usage"), subtitle: L("usage.subtitle")) { reload() }
				FBAlert(kind: .info, text: L("usage.estimateNote"), closable: false)
				if let data {
					content(data)
				} else {
					Text(L("loading")).font(.fbBody).foregroundStyle(FB.textSecondary)
				}
			}
			.padding(EdgeInsets(top: 8, leading: 24, bottom: 24, trailing: 24))
			.frame(maxWidth: .infinity, alignment: .topLeading)
		}
		.task { reload() }
	}

	private func reload() {
		let workspace = RtClient.workspace()
		Task { data = await Task.detached { UsageData.load(workspace: workspace) }.value }
	}

	@ViewBuilder
	private func content(_ data: UsageData) -> some View {
		let today = Self.utcDay.string(from: Date())
		let month = String(today.prefix(7))
		Panel(title: L("usage.summary")) {
			summaryRow(L("usage.all"), data.entries)
			summaryRow(L("usage.today"), data.entries.filter { $0.day == today })
			summaryRow(L("usage.month"), data.entries.filter { $0.day.hasPrefix(month) })
			if let policy = data.policy {
				Text("\(L("usage.policy")): \(L("usage.daily")) $\(String(format: "%.2f", policy.dailyBudgetUsd)) · \(L("usage.monthly")) \(policy.monthlyBudgetUsd.map { "$" + String(format: "%.2f", $0) } ?? L("usage.notEnforced"))")
					.font(.fbCaption).foregroundStyle(FB.textSecondary)
			}
			if data.skippedLines > 0 {
				Text("\(data.skippedLines) \(L("usage.skipped"))").font(.fbCaption).foregroundStyle(FB.warningText)
			}
		}
		Panel(title: L("usage.daily14")) { dailyChart(data.entries) }
		Panel(title: L("usage.byModel"), count: Set(data.entries.map(\.model)).count) {
			ForEach(byModel(data.entries), id: \.model) { row in
				HStack {
					Text(row.model).font(.fbBodyMedium).foregroundStyle(FB.text)
					Spacer()
					Text("\(row.calls) \(L("usage.calls")) · \(row.tokens.formatted()) \(L("usage.tokens"))")
						.font(.fbCaption).foregroundStyle(FB.textSecondary)
				}
			}
		}
		Panel(title: L("usage.recent"), count: min(Self.recentCount, data.entries.count)) {
			if data.entries.isEmpty { Text(L("usage.empty")).font(.fbBody).foregroundStyle(FB.textSecondary) }
			ForEach(data.entries.suffix(Self.recentCount).reversed()) { entry in
				HStack(spacing: 10) {
					Text(entry.ts.replacingOccurrences(of: "T", with: " ").prefix(16)).font(.fbCaption).foregroundStyle(FB.textTertiary)
						.frame(width: 120, alignment: .leading)
					Text(entry.model).font(.fbBody).foregroundStyle(FB.text).lineLimit(1)
					Text(entry.task).font(.fbCaption).foregroundStyle(FB.textSecondary).lineLimit(1)
					Spacer()
					Text("↑ \(entry.inputTokens)  ↓ \(entry.outputTokens)").font(.fbCaption).foregroundStyle(FB.textSecondary)
				}
			}
		}
	}

	private func summaryRow(_ label: String, _ entries: [LedgerEntry]) -> some View {
		let input = entries.reduce(0) { $0 + $1.inputTokens }
		let output = entries.reduce(0) { $0 + $1.outputTokens }
		let cost = entries.reduce(0) { $0 + $1.costUsd }
		return HStack {
			Text(label).font(.fbBodyMedium).foregroundStyle(FB.text).frame(width: 110, alignment: .leading)
			Text("\(entries.count) \(L("usage.calls")) · \((input + output).formatted()) \(L("usage.tokens")) (↑ \(input.formatted())  ↓ \(output.formatted())) · ~$\(String(format: "%.4f", cost))")
				.font(.fbBody).foregroundStyle(FB.textSecondary)
		}
	}

	private func byModel(_ entries: [LedgerEntry]) -> [(model: String, calls: Int, tokens: Int)] {
		Dictionary(grouping: entries, by: \.model)
			.map { (model: $0.key, calls: $0.value.count, tokens: $0.value.reduce(0) { $0 + $1.tokens }) }
			.sorted { $0.tokens > $1.tokens }
	}

	// Tokens per UTC day for the last 14 days, oldest on the left. Days with no calls show an empty bar.
	private func dailyChart(_ entries: [LedgerEntry]) -> some View {
		let days = (0 ..< Self.chartDays).reversed().map { offset in
			Self.utcDay.string(from: Date().addingTimeInterval(-Double(offset) * 86_400))
		}
		let totals = Dictionary(grouping: entries, by: \.day).mapValues { $0.reduce(0) { $0 + $1.tokens } }
		let peak = max(1, days.map { totals[$0] ?? 0 }.max() ?? 1)
		return HStack(alignment: .bottom, spacing: 8) {
			ForEach(days, id: \.self) { day in
				let value = totals[day] ?? 0
				VStack(spacing: 4) {
					RoundedRectangle(cornerRadius: 3)
						.fill(value > 0 ? FB.primary : FB.surfaceTertiary)
						.frame(width: 18, height: max(3, Self.barHeight * CGFloat(value) / CGFloat(peak)))
						.help("\(day): \(value.formatted()) \(L("usage.tokens"))")
					Text(String(day.suffix(2))).font(.fbCaption).foregroundStyle(FB.textTertiary)
				}
			}
		}
		.frame(height: Self.barHeight + 24, alignment: .bottom)
	}
}
