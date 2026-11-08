import SwiftUI

// The Overview page: a design showcase laid out like the Fluent Blue Design Studio (bento cards on a soft grey page).
// Sizes come from the 1536 x 1024 reference screenshot. Copy is Yana's; the structure and look are Fluent Blue's.

struct OverviewPage: View {
	var body: some View {
		VStack(spacing: 12) {
			HStack(spacing: 12) {
				HeroCard().frame(width: 646, height: 347)
				VStack(spacing: 12) {
					PaletteCard().frame(height: 203)
					TypographyCard().frame(height: 132)
				}
				.frame(width: 413)
				ElevationCard().frame(width: 230, height: 347)
			}
			HStack(spacing: 12) {
				ButtonsCard().frame(width: 315)
				InputsCard().frame(width: 255)
				SelectCard().frame(width: 255)
				SwitchCard().frame(width: 219)
				NotificationsCard().frame(width: 224)
			}
			.frame(height: 299)
			HStack(spacing: 12) {
				NavigationCard().frame(width: 341)
				DataCard().frame(width: 354)
				DialogCard().frame(width: 281)
				ThemesCard().frame(width: 298)
			}
			.frame(height: 246)
		}
		.padding(EdgeInsets(top: 6, leading: 12, bottom: 12, trailing: 13))
		.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
	}
}

struct HeroCard: View {
	var body: some View {
		ZStack(alignment: .topLeading) {
			HeroBackdrop()
			VStack(alignment: .leading, spacing: 0) {
				Rectangle().fill(FB.primary).frame(width: 40, height: 2).padding(.bottom, 14)
				Text("Yana Studio").font(.system(size: 36, weight: .bold)).foregroundStyle(FB.text)
				Text("AI works. You keep control.").font(.system(size: 18, weight: .semibold)).foregroundStyle(FB.text).padding(.top, 8)
				Text("A native app that lets AI do the work while you approve, audit and revoke every action it takes.")
					.font(.system(size: 14)).foregroundStyle(FB.textSecondary).frame(width: 330, alignment: .leading).padding(.top, 8)
				HStack(spacing: 12) {
					FBButton(title: "Get started", variant: .primary, size: .large, trailing: "arrow-right", pill: true)
					FBButton(title: "Learn more", variant: .secondary, size: .large, pill: true)
				}
				.padding(.top, 18)
				Spacer(minLength: 0)
				HStack(spacing: 28) {
					HeroFeature(icon: "shield", line1: "Approve", line2: "every action")
					HeroFeature(icon: "list", line1: "Audit", line2: "chain")
					HeroFeature(icon: "cpu", line1: "Runs on", line2: "your Mac")
				}
			}
			.padding(32)
		}
		.clipShape(RoundedRectangle(cornerRadius: FB.radiusXL))
		.overlay(RoundedRectangle(cornerRadius: FB.radiusXL).stroke(FB.borderSubtle, lineWidth: 1))
	}
}

struct HeroFeature: View {
	let icon: String, line1: String, line2: String
	var body: some View {
		HStack(spacing: 8) {
			FBIcon(name: icon, size: 16, color: FB.textSecondary)
			VStack(alignment: .leading, spacing: 0) {
				Text(line1).font(.fbBodyMedium).foregroundStyle(FB.text)
				Text(line2).font(.fbBodyMedium).foregroundStyle(FB.text)
			}
		}
	}
}

struct PaletteCard: View {
	private let swatches: [(String, UInt32)] = [("Primary", 0x1470F0), ("Info", 0x1677FF), ("Success", 0x52C41A), ("Warning", 0xFAAD14), ("Error", 0xD92D30), ("Neutral", 0xBFBFBF)]
	var body: some View {
		FBCard(title: "Color Palette") {
			HStack(spacing: 14) {
				ForEach(swatches, id: \.0) { name, hex in
					VStack(spacing: 4) {
						Circle().fill(Color(hex: hex)).frame(width: 34, height: 34)
						Text(name).font(.system(size: 11, weight: .medium)).foregroundStyle(FB.text)
						Text(String(format: "#%06X", hex)).font(.system(size: 9)).foregroundStyle(FB.textSecondary)
					}
				}
			}
			HStack(spacing: 8) {
				ForEach([("Primary", [0x69B1FF, 0x1470F0]), ("Deep", [0x1470F0, 0x003EB3]), ("Info", [0xBAE0FF, 0x4096FF]), ("Success", [0x1470F0, 0x52C41A])], id: \.0) { name, stops in
					VStack(spacing: 3) {
						RoundedRectangle(cornerRadius: FB.radiusMD).fill(LinearGradient(colors: stops.map { Color(hex: UInt32($0)) }, startPoint: .leading, endPoint: .trailing)).frame(height: 28)
						Text(name).font(.fbCaption).foregroundStyle(FB.textSecondary)
					}
				}
			}
		}
	}
}

struct TypographyCard: View {
	var body: some View {
		FBCard(title: "Typography") {
			HStack(alignment: .top) {
				Text("Aa").font(.system(size: 40, weight: .bold)).foregroundStyle(FB.text)
				VStack(alignment: .leading, spacing: 2) {
					Text("SF Pro").font(.system(size: 14, weight: .semibold)).foregroundStyle(FB.text)
					Text("System font on macOS").font(.fbCaption).foregroundStyle(FB.textSecondary)
				}
				Spacer()
				VStack(alignment: .leading, spacing: 1) {
					ForEach(["H1  28px / 36px · 700", "H2  22px / 30px · 650", "H3  18px / 26px · 600", "Body  13px / 20px · 400", "Caption  11px / 16px · 400"], id: \.self) {
						Text($0).font(.system(size: 9.5)).foregroundStyle(FB.textSecondary)
					}
				}
			}
		}
	}
}

struct ElevationCard: View {
	var body: some View {
		FBCard(title: "Elevation") {
			VStack(spacing: 10) {
				ForEach([("Level 0", "Background", 0.0), ("Level 1", "Card", 2.0), ("Level 2", "Popover", 6.0), ("Level 3", "Modal", 12.0)], id: \.0) { level, name, blur in
					VStack(alignment: .leading, spacing: 1) {
						Text(level).font(.fbBodyMedium).foregroundStyle(FB.text)
						Text(name).font(.fbCaption).foregroundStyle(FB.textSecondary)
					}
					.frame(maxWidth: .infinity, alignment: .leading).padding(10).frame(height: 54)
					.background(RoundedRectangle(cornerRadius: FB.radiusMD).fill(FB.surface).shadow(color: .black.opacity(blur == 0 ? 0 : 0.14), radius: blur, y: blur / 3))
					.overlay(RoundedRectangle(cornerRadius: FB.radiusMD).stroke(FB.borderSubtle, lineWidth: 1))
				}
			}
		}
	}
}

struct ButtonsCard: View {
	var body: some View {
		FBCard(title: "Buttons") {
			VStack(alignment: .leading, spacing: 8) {
				HStack(spacing: 8) { FBButton(title: "Primary", variant: .primary, size: .small); FBButton(title: "Primary", variant: .primary, size: .small, trailing: "chevron-down"); FBIconButton(icon: "download", variant: .primary, size: .small) }
				HStack(spacing: 8) { FBButton(title: "Secondary", size: .small); FBButton(title: "Secondary", size: .small, trailing: "chevron-down"); FBIconButton(icon: "download", size: .small) }
				HStack(spacing: 8) { FBButton(title: "Outline", variant: .outline, size: .small); FBButton(title: "Outline", variant: .outline, size: .small, trailing: "chevron-down"); FBIconButton(icon: "download", variant: .outline, size: .small) }
				HStack(spacing: 10) { FBButton(title: "Text", variant: .text, size: .small); FBButton(title: "Text", variant: .text, size: .small, trailing: "chevron-down"); FBButton(title: "", variant: .text, size: .small, icon: "download") }
				HStack(spacing: 8) { FBButton(title: "Small", size: .small); FBButton(title: "Default"); FBButton(title: "Large", variant: .primary, size: .large) }
				HStack(spacing: 8) { FBIconButton(icon: "search", variant: .ghost, size: .small); FBIconButton(icon: "settings", size: .small); FBIconButton(icon: "plus", variant: .primary, size: .small) }
			}
		}
	}
}

struct InputsCard: View {
	var body: some View {
		FBCard(title: "Inputs") {
			HStack(alignment: .top, spacing: 8) {
				VStack(alignment: .leading, spacing: 4) {
					Text("Input Label").font(.fbCaption).foregroundStyle(FB.textSecondary)
					FBField(text: "", placeholder: "Input…", height: 32)
					Text("Select Label").font(.fbCaption).foregroundStyle(FB.textSecondary).padding(.top, 4)
					FBField(text: "", placeholder: "Select…", height: 32)
					Text("Search").font(.fbCaption).foregroundStyle(FB.textSecondary).padding(.top, 4)
					FBField(text: "", placeholder: "Search…", icon: "search", height: 32)
				}
				VStack(alignment: .leading, spacing: 4) {
					Text("Input States").font(.fbCaption).foregroundStyle(FB.textSecondary)
					FBField(text: "Normal", height: 30); FBField(text: "Hover", state: .hover, height: 30); FBField(text: "Focus", state: .focus, height: 30)
					FBField(text: "Error", state: .error, height: 30); FBField(text: "Success", state: .success, height: 30); FBField(text: "Disabled", state: .disabled, height: 30)
				}
			}
		}
	}
}

struct SelectCard: View {
	var body: some View {
		FBCard(title: "Select & Dropdown") {
			VStack(alignment: .leading, spacing: 8) {
				HStack { Text("Option 1").font(.fbBody); Spacer(); FBIcon(name: "chevron-down", size: 14, color: FB.textSecondary) }
					.padding(.horizontal, 10).frame(height: 34)
					.overlay(RoundedRectangle(cornerRadius: FB.radiusMD).stroke(FB.border, lineWidth: 1))
				VStack(spacing: 0) {
					Text("Option 1").font(.fbBody).foregroundStyle(FB.primaryText).frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 10).frame(height: 28).background(FB.primarySubtle)
					ForEach(["Option 2", "Option 3", "Option 4"], id: \.self) { Text($0).font(.fbBody).foregroundStyle(FB.text).frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 10).frame(height: 28) }
				}
				HStack(spacing: 0) {
					Text("Option 1").font(.fb(12, .semibold)).foregroundStyle(FB.primaryText).padding(.horizontal, 8).frame(height: 28).background(RoundedRectangle(cornerRadius: FB.radiusSM).fill(FB.surface).shadow(color: .black.opacity(0.1), radius: 1, y: 1)).padding(2)
					Text("Option 2").font(.fb(12)).foregroundStyle(FB.textSecondary).padding(.horizontal, 8)
					Text("Option 3").font(.fb(12)).foregroundStyle(FB.textSecondary).padding(.horizontal, 8)
				}
				.background(RoundedRectangle(cornerRadius: FB.radiusMD).fill(FB.surfaceTertiary))
				HStack(spacing: 8) { FBButton(title: "Dropdown", size: .small, trailing: "chevron-down"); FBButton(title: "More", size: .small, trailing: "chevron-right") }
			}
		}
	}
}

struct SwitchCard: View {
	var body: some View {
		FBCard(title: "Switch & Checkbox") {
			VStack(alignment: .leading, spacing: 14) {
				FBLabeledRow(label: "On") { FBSwitch(isOn: true) }
				FBLabeledRow(label: "Off") { FBSwitch(isOn: false) }
				FBLabeledRow(label: "Checkbox") { FBCheckbox(isOn: true) }
				FBLabeledRow(label: "Checkbox") { FBCheckbox(isOn: false) }
				FBLabeledRow(label: "Radio") { FBCheckbox(isOn: true, radio: true) }
				FBLabeledRow(label: "Radio 2") { FBCheckbox(isOn: false, radio: true) }
				FBLabeledRow(label: "Switch") { FBSwitch(isOn: true) }
			}
		}
	}
}

struct NotificationsCard: View {
	var body: some View {
		FBCard(title: "Notifications") {
			VStack(spacing: 6) {
				FBAlert(kind: .info, text: "This is an informational message.")
				FBAlert(kind: .success, text: "Operation completed successfully!")
				FBAlert(kind: .warning, text: "Please check your input.")
				FBAlert(kind: .error, text: "An error occurred.", closable: false)
				HStack(spacing: 8) { FBIcon(name: "check-circle", size: 15, color: FB.success); Text("Saved!").font(.fbBody); Spacer(); FBIcon(name: "close", size: 12, color: FB.textSecondary) }
					.padding(.horizontal, 12).frame(height: 40).background(RoundedRectangle(cornerRadius: FB.radiusLG).fill(FB.surface).shadow(color: .black.opacity(0.12), radius: 6, y: 2))
					.overlay(RoundedRectangle(cornerRadius: FB.radiusLG).stroke(FB.borderSubtle, lineWidth: 1))
					.padding(.horizontal, 14)
			}
		}
	}
}

struct NavigationCard: View {
	var body: some View {
		FBCard(title: "Navigation") {
			HStack(alignment: .top, spacing: 14) {
				VStack(alignment: .leading, spacing: 4) {
					HStack(spacing: 8) { FBIcon(name: "home", size: 14, color: FB.primaryText); Text("Home").font(.fb(13, .semibold)).foregroundStyle(FB.primaryText); Spacer() }
						.padding(.horizontal, 8).frame(height: 30).background(RoundedRectangle(cornerRadius: FB.radiusMD).fill(FB.primarySubtle))
					ForEach([("folder", "Projects"), ("chart-bar", "Analytics"), ("settings", "Settings"), ("info-circle", "About")], id: \.1) { icon, name in
						HStack(spacing: 8) { FBIcon(name: icon, size: 14, color: FB.textSecondary); Text(name).font(.fbBody).foregroundStyle(FB.textSecondary); Spacer() }.padding(.horizontal, 8).frame(height: 30)
					}
				}
				.frame(width: 120)
				VStack(alignment: .leading, spacing: 12) {
					HStack(spacing: 4) { Text("Home").font(.fbBody).foregroundStyle(FB.textTertiary); FBIcon(name: "chevron-right", size: 12, color: FB.textTertiary); Text("Dashboard").font(.fbBodyMedium).foregroundStyle(FB.text) }
					HStack(spacing: 18) {
						VStack(spacing: 4) { Text("Tab 1").font(.fb(13, .medium)).foregroundStyle(FB.primaryText); Rectangle().fill(FB.primary).frame(height: 2) }.fixedSize()
						Text("Tab 2").font(.fbBody).foregroundStyle(FB.textSecondary); Text("Tab 3").font(.fbBody).foregroundStyle(FB.textSecondary)
					}
					Text("Content of tab 1").font(.fbBody).foregroundStyle(FB.textSecondary)
				}
			}
		}
	}
}

struct DataCard: View {
	var body: some View {
		FBCard(title: "Data Display") {
			HStack(alignment: .top, spacing: 12) {
				VStack(alignment: .leading, spacing: 4) {
					LinearGradient(colors: [FB.ramp300, FB.ramp100], startPoint: .top, endPoint: .bottom).frame(height: 62).clipShape(RoundedRectangle(cornerRadius: FB.radiusMD))
					Text("Beautiful Landscape").font(.fbBodyMedium).foregroundStyle(FB.text)
					Text("A peaceful view of nature.").font(.fbCaption).foregroundStyle(FB.textSecondary)
					Spacer(minLength: 0)
					HStack(spacing: 4) { Text("Read More").font(.fb(12, .medium)).foregroundStyle(FB.primaryText); FBIcon(name: "arrow-right", size: 12, color: FB.primaryText) }
				}
				.padding(8).frame(width: 150).overlay(RoundedRectangle(cornerRadius: FB.radiusLG).stroke(FB.borderSubtle, lineWidth: 1))
				VStack(alignment: .leading, spacing: 10) {
					Text("List").font(.fbBodyMedium).foregroundStyle(FB.text)
					ForEach([("AJ", "Alice Johnson", "Online", 0x1470F0), ("BS", "Bob Smith", "2m ago", 0x1470F0), ("CB", "Charlie Brown", "1h ago", 0xFAAD14)], id: \.1) { initials, name, status, hex in
						HStack(spacing: 8) {
							Text(initials).font(.system(size: 10, weight: .bold)).foregroundStyle(.white).frame(width: 30, height: 30).background(Circle().fill(Color(hex: UInt32(hex))))
							VStack(alignment: .leading, spacing: 0) { Text(name).font(.fb(12, .medium)).foregroundStyle(FB.text); Text(status).font(.fb(10)).foregroundStyle(FB.textSecondary) }
						}
					}
				}
			}
		}
	}
}

struct DialogCard: View {
	var body: some View {
		FBCard(title: "Dialogs & Overlays") {
			HStack(alignment: .top, spacing: 10) {
				VStack(alignment: .leading, spacing: 6) {
					HStack(spacing: 6) { FBIcon(name: "info-circle", size: 14, color: FB.primary); Text("Confirm Action").font(.fb(13, .semibold)).foregroundStyle(FB.text) }
					Text("Are you sure you want to continue?").font(.fb(11)).foregroundStyle(FB.textSecondary).frame(width: 96, alignment: .leading)
					Spacer(minLength: 0)
					HStack(spacing: 6) { FBButton(title: "Cancel", size: .small); FBButton(title: "OK", variant: .primary, size: .small) }
				}
				.padding(10).frame(width: 130).overlay(RoundedRectangle(cornerRadius: FB.radiusLG).stroke(FB.borderSubtle, lineWidth: 1))
				VStack(alignment: .leading, spacing: 8) {
					Text("Progress").font(.fbBodyMedium).foregroundStyle(FB.text)
					ZStack {
						Circle().stroke(FB.primarySubtle, lineWidth: 6)
						Circle().trim(from: 0, to: 0.75).stroke(FB.primary, style: StrokeStyle(lineWidth: 6, lineCap: .round)).rotationEffect(.degrees(-90))
						Text("75%").font(.fb(11, .semibold)).foregroundStyle(FB.text)
					}.frame(width: 50, height: 50)
					Capsule().fill(FB.primarySubtle).frame(height: 5).overlay(alignment: .leading) { Capsule().fill(FB.primary).frame(width: 40) }
					Capsule().fill(FB.primarySubtle).frame(height: 5).overlay(alignment: .leading) { Capsule().fill(FB.primary).frame(width: 30) }.overlay(alignment: .leading) { Circle().fill(.white).overlay(Circle().stroke(FB.primary, lineWidth: 2)).frame(width: 14, height: 14).offset(x: 24) }
				}
			}
		}
	}
}

struct ThemesCard: View {
	var body: some View {
		FBCard(title: "Themes") {
			VStack(alignment: .leading, spacing: 10) {
				HStack(spacing: 10) {
					RoundedRectangle(cornerRadius: FB.radiusMD).fill(LinearGradient(colors: [FB.primarySubtle, FB.ramp300], startPoint: .topLeading, endPoint: .bottomTrailing)).frame(height: 56)
						.overlay(RoundedRectangle(cornerRadius: FB.radiusMD).stroke(FB.primary, lineWidth: 2))
					RoundedRectangle(cornerRadius: FB.radiusMD).fill(LinearGradient(colors: [Color(hex: 0x141414), FB.ramp700], startPoint: .topLeading, endPoint: .bottomTrailing)).frame(height: 56)
				}
				HStack { FBCheckbox(isOn: true, radio: true); Text("Light").font(.fbBody); Spacer(); FBCheckbox(isOn: false, radio: true); Text("Dark").font(.fbBody); Spacer() }
				FBLabeledRow(label: "Auto Switch") { FBSwitch(isOn: false) }
				HStack { Text("Follow System").font(.fbBody).foregroundStyle(FB.textDisabled); Spacer(); FBIcon(name: "chevron-down", size: 14, color: FB.textDisabled) }
					.padding(.horizontal, 10).frame(height: 32).background(RoundedRectangle(cornerRadius: FB.radiusMD).fill(FB.background))
					.overlay(RoundedRectangle(cornerRadius: FB.radiusMD).stroke(FB.border, lineWidth: 1))
			}
		}
	}
}
