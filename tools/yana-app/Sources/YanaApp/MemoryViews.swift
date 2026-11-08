import AppKit
import SwiftUI

// "Remember this?" under a reply: nothing is saved until the user presses Remember.
struct MemoryProposalCard: View {
	let lineID: UUID
	let fact: String
	@EnvironmentObject private var engine: ChatEngine

	var body: some View {
		HStack(spacing: 10) {
			Image(systemName: "brain").foregroundStyle(FB.primary)
			VStack(alignment: .leading, spacing: 2) {
				Text(L("mem.proposal")).font(.fbCaption).foregroundStyle(FB.textSecondary)
				Text(fact).font(.fbBody).foregroundStyle(FB.text).fixedSize(horizontal: false, vertical: true)
			}
			Spacer(minLength: 8)
			FBButton(title: L("mem.dismiss"), variant: .ghost, size: .small) { engine.dismissProposal(lineID) }
			FBButton(title: L("mem.remember"), variant: .primary, size: .small) { engine.acceptProposal(lineID) }
		}
		.padding(.horizontal, 12).padding(.vertical, 10)
		.background(RoundedRectangle(cornerRadius: FB.radiusXL).fill(FB.primarySubtle))
		.overlay(RoundedRectangle(cornerRadius: FB.radiusXL).stroke(FB.primaryBorder, lineWidth: 1))
	}
}

// Settings > Memory: on/off, what is remembered, saved files, export, backup, restore, delete.
struct MemorySettings: View {
	@ObservedObject private var settings = AppSettings.shared
	@ObservedObject private var store = MemoryStore.shared
	@State private var notice: String?
	@State private var confirmClear = false

	var body: some View {
		Form {
			Section {
				Toggle(L("mem.toggle"), isOn: $settings.persistentMemory)
			} footer: { SettingsNote(L("mem.toggleNote")) }

			Section(L("mem.memories")) {
				if store.memories.isEmpty { Text(L("mem.none")).foregroundStyle(FB.textTertiary) }
				ForEach(store.memories) { memory in
					HStack(alignment: .top) {
						Text(memory.text).textSelection(.enabled)
						Spacer()
						Text(memory.created, style: .date).font(.fbCaption).foregroundStyle(FB.textTertiary)
						Button(role: .destructive) { store.forget(memory.id) } label: { Image(systemName: "trash") }
							.buttonStyle(.borderless).help(L("mem.delete"))
					}
				}
			}

			Section(L("mem.library")) {
				if store.library.isEmpty { Text(L("mem.noFiles")).foregroundStyle(FB.textTertiary) }
				ForEach(store.library) { item in
					HStack {
						Image(systemName: "doc.text")
						Text(item.name)
						Spacer()
						Text("\(item.chars) \(L("mem.chars"))").font(.fbCaption).foregroundStyle(FB.textTertiary)
						Button(role: .destructive) { store.removeItem(item.id) } label: { Image(systemName: "trash") }
							.buttonStyle(.borderless).help(L("mem.delete"))
					}
				}
			}

			Section {
				LabeledContent(L("mem.backupFolder")) {
					HStack {
						Text(settings.backupFolder.isEmpty ? L("mem.noBackup") : settings.backupFolder)
							.lineLimit(1).truncationMode(.middle).foregroundStyle(FB.textSecondary)
						Button(L("mem.choose")) { if let url = pickFolder() { settings.backupFolder = url.path } }
						if !settings.backupFolder.isEmpty { Button(L("mem.stopBackup")) { settings.backupFolder = "" } }
					}
				}
				if settings.lastBackup > 0 {
					LabeledContent(L("mem.lastBackup"), value: Date(timeIntervalSince1970: settings.lastBackup).formatted())
				}
				HStack {
					Button(L("mem.backupNow")) { run { try store.backup(into: requireFolder()); return L("mem.backupDone") } }
						.disabled(settings.backupFolder.isEmpty)
					Button(L("mem.export")) {
						guard let url = pickFolder() else { return }
						run { try store.export(to: url.appendingPathComponent("Yana-du-lieu", isDirectory: true)); return L("mem.exportDone") }
					}
					Button(L("mem.restore")) {
						guard let url = pickFolder() else { return }
						run { String(format: L("mem.restoreDone"), try store.restore(from: url)) }
					}
					Spacer()
					Button(L("mem.clearAll"), role: .destructive) { confirmClear = true }
				}
				if let notice { Text(notice).font(.fbCaption).foregroundStyle(FB.textSecondary) }
				if let error = store.lastError { Text(error).font(.fbCaption).foregroundStyle(FB.errorText) }
			} header: { Text(L("mem.backup")) } footer: { SettingsNote(L("mem.backupNote")) }
		}
		.confirmationDialog(L("mem.clearConfirm"), isPresented: $confirmClear) {
			Button(L("mem.clearAll"), role: .destructive) { store.clearAll() }
		} message: { Text(L("mem.clearConfirmNote")) }
	}

	private func requireFolder() -> URL { URL(fileURLWithPath: settings.backupFolder, isDirectory: true) }

	private func run(_ work: () throws -> String) {
		do { notice = try work() } catch { notice = "\(L("mem.failed")): \(error.localizedDescription)" }
	}

	private func pickFolder() -> URL? {
		let panel = NSOpenPanel()
		panel.canChooseDirectories = true
		panel.canChooseFiles = false
		panel.canCreateDirectories = true
		return panel.runModal() == .OK ? panel.url : nil
	}
}

// Menu "Uninstall Yana…": asks whether to keep the memories (backup first), then removes the app's data
// and moves Yana.app to the Trash. macOS gives an app no notice when it is dragged to the Trash, so this
// menu item is the only place the question can be asked.
enum Uninstaller {
	@MainActor
	static func run() {
		let alert = NSAlert()
		alert.messageText = L("uninst.title")
		alert.informativeText = L("uninst.question")
		alert.addButton(withTitle: L("uninst.keep"))
		alert.addButton(withTitle: L("uninst.delete"))
		alert.addButton(withTitle: L("uninst.cancel"))
		alert.alertStyle = .warning
		let answer = alert.runModal()
		guard answer != .alertThirdButtonReturn else { return }
		if answer == .alertFirstButtonReturn {
			let panel = NSOpenPanel()
			panel.canChooseDirectories = true
			panel.canChooseFiles = false
			panel.canCreateDirectories = true
			panel.message = L("uninst.pick")
			guard panel.runModal() == .OK, let folder = panel.url else { return }
			do { try MemoryStore.shared.backup(into: folder) } catch {
				show(L("uninst.backupFailed"), error.localizedDescription)
				return // never delete when the backup did not work
			}
		}
		let data = MemoryStore.shared.folder.deletingLastPathComponent() // .../Application Support/YanaApp
		do {
			if FileManager.default.fileExists(atPath: data.path) { try FileManager.default.trashItem(at: data, resultingItemURL: nil) }
			let app = Bundle.main.bundleURL
			if app.pathExtension == "app" { try FileManager.default.trashItem(at: app, resultingItemURL: nil) }
		} catch {
			show(L("uninst.failed"), error.localizedDescription)
			return
		}
		NSApplication.shared.terminate(nil)
	}

	@MainActor
	private static func show(_ title: String, _ detail: String) {
		let alert = NSAlert()
		alert.messageText = title
		alert.informativeText = detail
		alert.runModal()
	}
}
