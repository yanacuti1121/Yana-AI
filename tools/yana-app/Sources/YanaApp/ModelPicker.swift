import SwiftUI

// Model picker in the chat bar. It lists only models the user can actually use, asked from each provider
// with the user's own key (ModelCatalog.swift), grouped by provider. There is no "auto" entry: the user
// picks a model. The pick applies to this chat and is remembered as the default for new chats.

struct ModelPicker: View {
	@ObservedObject var engine: ChatEngine
	@EnvironmentObject private var catalog: ModelCatalog
	let openSettings: () -> Void
	let close: () -> Void
	@State private var query = ""
	@State private var manual: [String: String] = [:]

	private func filtered(_ group: ProviderModels) -> [String] {
		let q = query.trimmingCharacters(in: .whitespaces).lowercased()
		guard !q.isEmpty else { return group.models }
		if group.provider.lowercased().contains(q) { return group.models }
		return group.models.filter { $0.lowercased().contains(q) }
	}

	var body: some View {
		VStack(alignment: .leading, spacing: 8) {
			HStack(spacing: 6) {
				TextField(L("model.search"), text: $query)
					.textFieldStyle(.plain).font(.fbBody)
					.padding(.horizontal, 10).frame(height: 30)
					.background(RoundedRectangle(cornerRadius: 8).fill(FB.surfaceSecondary))
				FBIconButton(icon: "refresh", variant: .ghost, size: .small, tooltip: L("refresh")) { catalog.refresh() }
			}
			if engine.running {
				Text(L("model.nextTurn")).font(.fbCaption).foregroundStyle(FB.warningText)
			}
			ScrollView {
				VStack(alignment: .leading, spacing: 2) {
					if catalog.groups.isEmpty { emptyState }
					ForEach(catalog.groups) { group in groupView(group) }
				}
			}
			.frame(maxHeight: 400)
			Divider()
			SidebarRow(icon: "key", title: L("model.manageKeys"), strong: false)
				.onTapGesture { close(); openSettings() }
		}
		.padding(10)
		.frame(width: 360)
		.onAppear { catalog.refreshIfStale() }
	}

	private var emptyState: some View {
		VStack(alignment: .leading, spacing: 6) {
			Text(catalog.loadedAt == nil ? L("loading") : L("model.noneYet")).font(.fbBodyMedium).foregroundStyle(FB.text)
			if catalog.loadedAt != nil {
				Text(L("model.noneYetHint")).font(.fbCaption).foregroundStyle(FB.textSecondary)
					.fixedSize(horizontal: false, vertical: true)
			}
		}
		.padding(10)
	}

	@ViewBuilder
	private func groupView(_ group: ProviderModels) -> some View {
		let rows = filtered(group)
		HStack {
			Text(group.provider).font(.system(size: 12, weight: .semibold)).foregroundStyle(FB.textSecondary)
			Spacer()
			switch group.state {
			case .loading: ProgressView().controlSize(.small)
			case .ready: Text("\(group.models.count)").font(.fbCaption).foregroundStyle(FB.textTertiary)
			case .failed: Text(L("model.failed")).font(.fbCaption).foregroundStyle(FB.errorText)
			case .manual: EmptyView()
			}
		}
		.padding(EdgeInsets(top: 10, leading: 8, bottom: 2, trailing: 8))
		switch group.state {
		case .failed(let why):
			Text(why).font(.fbCaption).foregroundStyle(FB.textSecondary).padding(.horizontal, 10).lineLimit(2)
		case .manual:
			HStack(spacing: 6) {
				TextField(L("model.typeName"), text: Binding(get: { manual[group.provider] ?? "" },
				                                               set: { manual[group.provider] = $0 }))
					.textFieldStyle(.roundedBorder).font(.fbBody)
				Button(L("model.use")) { pick(group.provider, manual[group.provider] ?? "") }
					.disabled((manual[group.provider] ?? "").trimmingCharacters(in: .whitespaces).isEmpty)
			}
			.padding(.horizontal, 8)
		default:
			ForEach(rows, id: \.self) { model in row(group.provider, model) }
		}
	}

	private func row(_ provider: String, _ model: String) -> some View {
		let chosen = engine.provider == provider && engine.model == model
		return HStack(spacing: 8) {
			FBIcon(name: chosen ? "check" : "cpu", size: 14, color: chosen ? FB.primaryText : FB.textTertiary)
			Text(model).font(.system(size: 13, weight: chosen ? .semibold : .regular)).foregroundStyle(FB.text).lineLimit(1)
			Spacer(minLength: 0)
		}
		.padding(.horizontal, 10)
		.frame(height: 30)
		.background(RoundedRectangle(cornerRadius: 8).fill(chosen ? FB.primarySubtle : .clear))
		.contentShape(Rectangle())
		.onTapGesture { pick(provider, model) }
	}

	private func pick(_ provider: String, _ model: String) {
		let name = model.trimmingCharacters(in: .whitespaces)
		guard !name.isEmpty else { return }
		engine.provider = provider
		engine.model = name
		// Remembered as the default for new chats.
		AppSettings.shared.provider = provider
		AppSettings.shared.model = name
		close()
	}
}
