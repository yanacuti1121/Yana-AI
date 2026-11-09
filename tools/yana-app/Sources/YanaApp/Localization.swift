import SwiftUI

// Three interface languages: Vietnamese, English, Korean. The choice is saved in UserDefaults and applies
// immediately: RootView rebuilds its content when the language changes (see `.id(loc.lang)` there).
// Strings live in Strings.swift. A missing key shows the key itself, so a gap is visible, never blank.

enum Lang: String, CaseIterable, Identifiable {
	case vi, en, ko
	var id: String { rawValue }
	var nativeName: String {
		switch self {
		case .vi: return "Tiếng Việt"
		case .en: return "English"
		case .ko: return "한국어"
		}
	}
}

final class Loc: ObservableObject {
	static let shared = Loc()
	private static let storageKey = "yana.language"

	@Published var lang: Lang {
		didSet { UserDefaults.standard.set(lang.rawValue, forKey: Loc.storageKey) }
	}

	private init() {
		// Order: YANA_LANG (for headless renders), the saved choice, the system language, then English.
		let env = ProcessInfo.processInfo.environment["YANA_LANG"]
		let saved = UserDefaults.standard.string(forKey: Loc.storageKey)
		let system = Locale.preferredLanguages.first.map { String($0.prefix(2)) }
		lang = [env, saved, system].compactMap { $0 }.compactMap { Lang(rawValue: $0) }.first ?? .en
	}
}

struct StringRow {
	let key: String
	let vi: String
	let en: String
	let ko: String

	init(_ key: String, _ vi: String, _ en: String, _ ko: String) {
		self.key = key; self.vi = vi; self.en = en; self.ko = ko
	}
}

private let table: [String: StringRow] = Dictionary(uniqueKeysWithValues: allStringRows.map { ($0.key, $0) })

// The text for `key` in the current language.
func L(_ key: String) -> String {
	guard let row = table[key] else { return key }
	switch Loc.shared.lang {
	case .vi: return row.vi
	case .en: return row.en
	case .ko: return row.ko
	}
}
