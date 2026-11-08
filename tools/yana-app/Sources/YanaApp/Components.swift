import SwiftUI

// Core components in the Fluent Blue style: buttons, fields, switch, checkbox, radio, alerts, cards.

enum FBVariant { case primary, secondary, outline, ghost, text, danger }
enum FBSize {
	case small, medium, large
	var height: CGFloat { self == .small ? FB.heightSmall : self == .large ? FB.heightLarge : FB.heightMedium }
	var hpad: CGFloat { self == .small ? 10 : self == .large ? 18 : 14 }
	var font: Font { self == .small ? .fb(12, .medium) : self == .large ? .fb(14, .medium) : .fbButton }
}

struct FBButton: View {
	let title: String
	var variant: FBVariant = .secondary
	var size: FBSize = .medium
	var icon: String? = nil
	var trailing: String? = nil
	var pill = false
	var action: () -> Void = {}
	@State private var hover = false

	private var fg: Color {
		switch variant {
		case .primary, .danger: return .white
		case .ghost: return hover ? FB.text : FB.textSecondary
		case .text: return hover ? FB.primary : FB.primaryText
		default: return FB.text
		}
	}
	private var bg: Color {
		switch variant {
		case .primary: return hover ? FB.primaryHover : FB.primary
		case .danger: return hover ? Color(hex: 0xC4262A) : FB.error
		case .secondary: return hover ? FB.surfaceSecondary : FB.surface
		case .outline: return hover ? FB.surfaceSecondary : .clear
		case .ghost: return hover ? FB.ghostHover : .clear
		case .text: return .clear
		}
	}
	private var stroke: Color {
		switch variant {
		case .secondary, .outline: return hover ? FB.borderStrong : FB.border
		default: return .clear
		}
	}

	var body: some View {
		let radius = pill ? size.height / 2 : FB.radiusMD
		Button(action: action) {
			HStack(spacing: 6) {
				if let icon { FBIcon(name: icon, size: size == .small ? 13 : 15, color: fg) }
				Text(title).font(size.font)
				if let trailing { FBIcon(name: trailing, size: 13, color: fg) }
			}
			.foregroundStyle(fg)
			.padding(.horizontal, variant == .text ? 4 : size.hpad)
			.frame(height: size.height)
			.background(RoundedRectangle(cornerRadius: radius).fill(bg))
			.overlay(RoundedRectangle(cornerRadius: radius).stroke(stroke, lineWidth: 1))
		}
		.buttonStyle(.plain)
		.onHover { hover = $0 }
		.animation(FB.fast, value: hover)
	}
}

struct FBIconButton: View {
	let icon: String
	var variant: FBVariant = .secondary
	var size: FBSize = .medium
	var tooltip: String = ""
	var action: () -> Void = {}
	@State private var hover = false

	var body: some View {
		let primary = variant == .primary
		Button(action: action) {
			FBIcon(name: icon, size: size == .small ? 14 : 16, color: primary ? .white : hover ? FB.text : FB.textSecondary)
				.frame(width: size.height, height: size.height)
				.background(RoundedRectangle(cornerRadius: FB.radiusMD).fill(primary ? (hover ? FB.primaryHover : FB.primary) : (hover ? FB.ghostHover : (variant == .secondary ? FB.surface : .clear))))
				.overlay(RoundedRectangle(cornerRadius: FB.radiusMD).stroke(variant == .secondary ? FB.border : .clear, lineWidth: 1))
		}
		.buttonStyle(.plain)
		.help(tooltip)
		.onHover { hover = $0 }
		.animation(FB.fast, value: hover)
	}
}

enum FBFieldState { case normal, hover, focus, error, success, disabled }

struct FBField: View {
	var text: String
	var placeholder: String = ""
	var state: FBFieldState = .normal
	var icon: String? = nil
	var height: CGFloat = FB.heightMedium

	private var stroke: Color {
		switch state {
		case .normal, .disabled: return FB.border
		case .hover: return FB.primary
		case .focus: return FB.primary
		case .error: return FB.error
		case .success: return FB.success
		}
	}

	var body: some View {
		HStack(spacing: 8) {
			if state == .focus || state == .normal || state == .hover || state == .disabled, let icon { FBIcon(name: icon, size: 14, color: FB.textTertiary) }
			Text(text.isEmpty ? placeholder : text)
				.font(.fbBody)
				.lineLimit(1)
				.foregroundStyle(text.isEmpty ? FB.textTertiary : state == .disabled ? FB.textDisabled : FB.text)
			Spacer(minLength: 0)
			if state == .error { FBIcon(name: "info-circle", size: 14, color: FB.error) }
			if state == .success { FBIcon(name: "check-circle", size: 14, color: FB.success) }
		}
		.padding(.horizontal, 10)
		.frame(height: height)
		.background(RoundedRectangle(cornerRadius: FB.radiusMD).fill(state == .disabled ? FB.background : FB.surface))
		.overlay(RoundedRectangle(cornerRadius: FB.radiusMD).stroke(stroke, lineWidth: state == .focus ? 2 : 1))
	}
}

struct FBSwitch: View {
	var isOn: Bool
	var body: some View {
		Capsule().fill(isOn ? FB.primary : FB.borderStrong)
			.frame(width: 38, height: 22)
			.overlay(alignment: isOn ? .trailing : .leading) { Circle().fill(.white).frame(width: 18, height: 18).padding(2).shadow(color: .black.opacity(0.2), radius: 1, y: 1) }
	}
}

struct FBCheckbox: View {
	var isOn: Bool
	var radio = false
	var body: some View {
		ZStack {
			if radio {
				Circle().stroke(isOn ? FB.primary : FB.borderStrong, lineWidth: isOn ? 5 : 1.5).frame(width: 18, height: 18)
			} else {
				RoundedRectangle(cornerRadius: FB.radiusSM).fill(isOn ? FB.primary : FB.surface)
					.overlay(RoundedRectangle(cornerRadius: FB.radiusSM).stroke(isOn ? FB.primary : FB.borderStrong, lineWidth: 1.5))
					.frame(width: 18, height: 18)
				if isOn { FBIcon(name: "check", size: 13, color: .white) }
			}
		}
	}
}

struct FBLabeledRow<Content: View>: View {
	let label: String
	@ViewBuilder var content: Content
	var body: some View {
		HStack(spacing: 8) { content; Text(label).font(.fbBody).foregroundStyle(FB.text) }
	}
}

enum FBAlertKind { case info, success, warning, error }

struct FBAlert: View {
	let kind: FBAlertKind
	let text: String
	var closable = true

	private var colors: (bg: Color, border: Color, fg: Color, icon: String) {
		switch kind {
		case .info: return (FB.primarySubtle, FB.primaryBorder, FB.primaryText, "info-circle")
		case .success: return (FB.successSubtle, FB.successBorder, FB.successText, "check-circle")
		case .warning: return (FB.warningSubtle, FB.warningBorder, FB.warningText, "alert-triangle")
		case .error: return (FB.errorSubtle, FB.errorBorder, FB.errorText, "alert-circle")
		}
	}

	var body: some View {
		HStack(alignment: .top, spacing: 8) {
			FBIcon(name: colors.icon, size: 15, color: colors.fg)
			Text(text).font(.fb(11)).foregroundStyle(colors.fg).fixedSize(horizontal: false, vertical: true)
			Spacer(minLength: 0)
			if closable { FBIcon(name: "close", size: 12, color: colors.fg) }
		}
		.padding(.horizontal, 10).padding(.vertical, 8)
		.background(RoundedRectangle(cornerRadius: FB.radiusMD).fill(colors.bg))
		.overlay(RoundedRectangle(cornerRadius: FB.radiusMD).stroke(colors.border, lineWidth: 1))
	}
}

// A "bento" card: white, radius 12, subtle border, heading and a Copy pill like the Fluent Blue Design Studio.
struct FBCard<Content: View>: View {
	let title: String
	var showCopy = true
	@ViewBuilder var content: Content

	var body: some View {
		VStack(alignment: .leading, spacing: 10) {
			HStack {
				Text(title).font(.fbHeading5).foregroundStyle(FB.text).lineLimit(1).minimumScaleFactor(0.85)
				Spacer(minLength: 4)
				if showCopy {
					Text("Copy").font(.fb(12, .medium)).foregroundStyle(FB.text)
						.padding(.horizontal, 10).frame(height: 26)
						.background(Capsule().fill(FB.surface))
						.overlay(Capsule().stroke(FB.border, lineWidth: 1))
				}
			}
			content
			Spacer(minLength: 0)
		}
		.padding(12)
		.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
		.background(RoundedRectangle(cornerRadius: FB.radiusXL).fill(FB.surface))
		.overlay(RoundedRectangle(cornerRadius: FB.radiusXL).stroke(FB.borderSubtle, lineWidth: 1))
	}
}
