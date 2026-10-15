// make-dmg-background.swift
// Generates premium Retina DMG background artwork for Yana Studio:
// - Dark theme #111317
// - Soft Cyan & Violet neon glow
// - Custom smooth drag-and-drop arrow
// - Yana emblem & slogan "AI works. You hold authority."
// - First-launch 3-step Gatekeeper bypass tip
import Cocoa

let width: CGFloat = 640
let height: CGFloat = 420
let scale: CGFloat = 2.0 // @2x Retina

let pixelW = Int(width * scale)
let pixelH = Int(height * scale)

let colorSpace = CGColorSpaceCreateDeviceRGB()
guard let ctx = CGContext(
    data: nil,
    width: pixelW,
    height: pixelH,
    bitsPerComponent: 8,
    bytesPerRow: 0,
    space: colorSpace,
    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
) else {
    fatalError("Failed to create CGContext")
}

// Scale context for 2x rendering
ctx.scaleBy(x: scale, y: scale)

// In AppKit/CoreGraphics without flip, Y=0 is bottom, Y=420 is top.
// Let's create helper to map Top-Left (x, y) to CG coordinates (x, height - y)
func pt(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
    return CGPoint(x: x, y: height - y)
}

func rct(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat) -> CGRect {
    return CGRect(x: x, y: height - y - h, width: w, height: h)
}

// 1. Base Background: Deep Dark #111317
ctx.setFillColor(CGColor(red: 17/255.0, green: 19/255.0, blue: 23/255.0, alpha: 1.0))
ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))

// 2. Subtle ambient grid & radial glow gradients
// Cyan Glow on Left (around App icon at x: 160, y: 215)
let cyanColors = [
    CGColor(red: 56/255.0, green: 189/255.0, blue: 248/255.0, alpha: 0.18),
    CGColor(red: 56/255.0, green: 189/255.0, blue: 248/255.0, alpha: 0.0)
] as CFArray
if let cyanGradient = CGGradient(colorsSpace: colorSpace, colors: cyanColors, locations: [0.0, 1.0]) {
    ctx.drawRadialGradient(cyanGradient,
        startCenter: pt(160, 215), startRadius: 0,
        endCenter: pt(160, 215), endRadius: 210,
        options: .drawsAfterEndLocation)
}

// Violet Glow on Right (around Applications folder at x: 480, y: 215)
let violetColors = [
    CGColor(red: 168/255.0, green: 85/255.0, blue: 247/255.0, alpha: 0.16),
    CGColor(red: 168/255.0, green: 85/255.0, blue: 247/255.0, alpha: 0.0)
] as CFArray
if let violetGradient = CGGradient(colorsSpace: colorSpace, colors: violetColors, locations: [0.0, 1.0]) {
    ctx.drawRadialGradient(violetGradient,
        startCenter: pt(480, 215), startRadius: 0,
        endCenter: pt(480, 215), endRadius: 210,
        options: .drawsAfterEndLocation)
}

// Subtle Center Aura
let centerGlowColors = [
    CGColor(red: 99/255.0, green: 102/255.0, blue: 241/255.0, alpha: 0.08),
    CGColor(red: 99/255.0, green: 102/255.0, blue: 241/255.0, alpha: 0.0)
] as CFArray
if let centerGradient = CGGradient(colorsSpace: colorSpace, colors: centerGlowColors, locations: [0.0, 1.0]) {
    ctx.drawRadialGradient(centerGradient,
        startCenter: pt(320, 210), startRadius: 0,
        endCenter: pt(320, 210), endRadius: 320,
        options: .drawsAfterEndLocation)
}

// Subtle Top Accent Line with Gradient
let accentColors = [
    CGColor(red: 56/255.0, green: 189/255.0, blue: 248/255.0, alpha: 0.0),
    CGColor(red: 56/255.0, green: 189/255.0, blue: 248/255.0, alpha: 0.8),
    CGColor(red: 168/255.0, green: 85/255.0, blue: 247/255.0, alpha: 0.8),
    CGColor(red: 168/255.0, green: 85/255.0, blue: 247/255.0, alpha: 0.0)
] as CFArray
if let accentGrad = CGGradient(colorsSpace: colorSpace, colors: accentColors, locations: [0.0, 0.3, 0.7, 1.0]) {
    ctx.saveGState()
    ctx.addRect(CGRect(x: 40, y: height - 1.5, width: width - 80, height: 1.5))
    ctx.clip()
    ctx.drawLinearGradient(accentGrad, start: CGPoint(x: 40, y: height - 1), end: CGPoint(x: width - 40, y: height - 1), options: [])
    ctx.restoreGState()
}

// 3. Draw Watermark Stylized Rabbit in Center Background (low opacity 0.06)
ctx.saveGState()
ctx.setStrokeColor(CGColor(red: 223/255.0, green: 229/255.0, blue: 241/255.0, alpha: 0.045))
ctx.setLineWidth(5)
ctx.setLineCap(.round)
ctx.setLineJoin(.round)

// Draw centered rabbit watermark
let rx: CGFloat = 280
let ry: CGFloat = 145
let rw: CGFloat = 80
let rh: CGFloat = 80

// Geometric diamond / face
ctx.move(to: pt(rx + 40, ry + 15))
ctx.addLine(to: pt(rx + 65, ry + 40))
ctx.addLine(to: pt(rx + 40, ry + 75))
ctx.addLine(to: pt(rx + 15, ry + 40))
ctx.closePath()
ctx.strokePath()

// Ears
ctx.move(to: pt(rx + 25, ry + 15))
ctx.addLine(to: pt(rx + 15, ry - 15))
ctx.addLine(to: pt(rx + 32, ry - 5))
ctx.strokePath()

ctx.move(to: pt(rx + 55, ry + 15))
ctx.addLine(to: pt(rx + 65, ry - 15))
ctx.addLine(to: pt(rx + 48, ry - 5))
ctx.strokePath()
ctx.restoreGState()

// 4. Pedestal Target Rings under icons
// Left Pedestal (under Yana Studio at x: 160, y: 225)
ctx.saveGState()
ctx.setStrokeColor(CGColor(red: 56/255.0, green: 189/255.0, blue: 248/255.0, alpha: 0.25))
ctx.setFillColor(CGColor(red: 56/255.0, green: 189/255.0, blue: 248/255.0, alpha: 0.03))
ctx.setLineWidth(1.5)
let leftRing = rct(95, 145, 130, 130)
ctx.fillEllipse(in: leftRing)
ctx.strokeEllipse(in: leftRing)

// Inner dashed ring
ctx.setStrokeColor(CGColor(red: 56/255.0, green: 189/255.0, blue: 248/255.0, alpha: 0.35))
ctx.setLineWidth(1)
ctx.setLineDash(phase: 0, lengths: [4, 4])
ctx.strokeEllipse(in: rct(108, 158, 104, 104))
ctx.restoreGState()

// Right Pedestal (under Applications at x: 480, y: 225)
ctx.saveGState()
ctx.setStrokeColor(CGColor(red: 168/255.0, green: 85/255.0, blue: 247/255.0, alpha: 0.25))
ctx.setFillColor(CGColor(red: 168/255.0, green: 85/255.0, blue: 247/255.0, alpha: 0.03))
ctx.setLineWidth(1.5)
let rightRing = rct(415, 145, 130, 130)
ctx.fillEllipse(in: rightRing)
ctx.strokeEllipse(in: rightRing)

// Inner dashed ring
ctx.setStrokeColor(CGColor(red: 168/255.0, green: 85/255.0, blue: 247/255.0, alpha: 0.35))
ctx.setLineWidth(1)
ctx.setLineDash(phase: 0, lengths: [4, 4])
ctx.strokeEllipse(in: rct(428, 158, 104, 104))
ctx.restoreGState()

// 5. Custom Sleek Gradient Drag-and-Drop Arrow
let arrowStartX: CGFloat = 245
let arrowEndX: CGFloat = 395
let arrowY: CGFloat = 208

ctx.saveGState()
// Shadow/Glow for arrow
ctx.setShadow(offset: .zero, blur: 12, color: CGColor(red: 56/255.0, green: 189/255.0, blue: 248/255.0, alpha: 0.45))

// Arrow shaft & head path
let arrowPath = CGMutablePath()
let shaftH: CGFloat = 6.0
let headL: CGFloat = 24.0
let headH: CGFloat = 20.0

arrowPath.move(to: pt(arrowStartX, arrowY - shaftH / 2))
arrowPath.addLine(to: pt(arrowEndX - headL, arrowY - shaftH / 2))
arrowPath.addLine(to: pt(arrowEndX - headL, arrowY - headH / 2))
arrowPath.addLine(to: pt(arrowEndX, arrowY))
arrowPath.addLine(to: pt(arrowEndX - headL, arrowY + headH / 2))
arrowPath.addLine(to: pt(arrowEndX - headL, arrowY + shaftH / 2))
arrowPath.addLine(to: pt(arrowStartX, arrowY + shaftH / 2))
arrowPath.closeSubpath()

// Fill arrow with Cyan-to-Violet gradient
ctx.addPath(arrowPath)
ctx.clip()

let arrowGradColors = [
    CGColor(red: 56/255.0, green: 189/255.0, blue: 248/255.0, alpha: 0.95),
    CGColor(red: 168/255.0, green: 85/255.0, blue: 247/255.0, alpha: 0.95)
] as CFArray
if let arrowGrad = CGGradient(colorsSpace: colorSpace, colors: arrowGradColors, locations: [0.0, 1.0]) {
    ctx.drawLinearGradient(arrowGrad, start: pt(arrowStartX, arrowY), end: pt(arrowEndX, arrowY), options: [])
}
ctx.restoreGState()

// Sleek Chevron motion markers inside arrow shaft
ctx.saveGState()
ctx.setStrokeColor(CGColor(red: 255/255.0, green: 255/255.0, blue: 255/255.0, alpha: 0.75))
ctx.setLineWidth(2)
ctx.setLineCap(.round)
ctx.setLineJoin(.round)

for offset in [40.0, 70.0, 100.0] {
    let cx = arrowStartX + CGFloat(offset)
    ctx.move(to: pt(cx - 4, arrowY - 4))
    ctx.addLine(to: pt(cx, arrowY))
    ctx.addLine(to: pt(cx - 4, arrowY + 4))
    ctx.strokePath()
}
ctx.restoreGState()

// 6. Typography rendering using AppKit (NSAttributedString)
NSGraphicsContext.saveGraphicsState()
let nsContext = NSGraphicsContext(cgContext: ctx, flipped: false)
NSGraphicsContext.current = nsContext

func drawText(_ str: String, x: CGFloat, y: CGFloat, font: NSFont, color: NSColor, align: NSTextAlignment = .center, width: CGFloat = 640) {
    let pStyle = NSMutableParagraphStyle()
    pStyle.alignment = align
    let attrs: [NSAttributedString.Key: Any] = [
        .font: font,
        .foregroundColor: color,
        .paragraphStyle: pStyle
    ]
    let nsStr = NSAttributedString(string: str, attributes: attrs)
    // Draw in flipped coordinates:
    let cgRect = CGRect(x: x, y: height - y - font.pointSize * 1.5, width: width, height: font.pointSize * 2)
    nsStr.draw(in: cgRect)
}

// Header: Yana Emblem & Slogan
// Title: "Yana Studio"
let titleFont = NSFont.systemFont(ofSize: 22, weight: .bold)
drawText("Yana Studio", x: 0, y: 38, font: titleFont, color: NSColor.white, align: .center, width: width)

// Slogan: "AI works. You hold authority."
let sloganFont = NSFont.systemFont(ofSize: 11.5, weight: .medium)
let sloganColor = NSColor(calibratedRed: 160/255.0, green: 175/255.0, blue: 200/255.0, alpha: 0.95)
drawText("AI works. You hold authority.", x: 0, y: 64, font: sloganFont, color: sloganColor, align: .center, width: width)

// Drag & drop instruction above/below arrow
let dragFont = NSFont.systemFont(ofSize: 11, weight: .semibold)
let dragColor = NSColor(calibratedRed: 200/255.0, green: 220/255.0, blue: 255/255.0, alpha: 0.85)
drawText("KÉO THẢ ĐỂ CÀI ĐẶT", x: 230, y: 172, font: dragFont, color: dragColor, align: .center, width: 180)

let dragSubFont = NSFont.systemFont(ofSize: 9.5, weight: .regular)
let dragSubColor = NSColor(calibratedRed: 140/255.0, green: 155/255.0, blue: 180/255.0, alpha: 0.75)
drawText("DRAG TO APPLICATIONS", x: 230, y: 228, font: dragSubFont, color: dragSubColor, align: .center, width: 180)

// 7. Footer Banner: First-launch 3-Step Gatekeeper Guide
let footerRect = rct(24, 345, width - 48, 52)
ctx.saveGState()
ctx.setFillColor(CGColor(red: 255/255.0, green: 255/255.0, blue: 255/255.0, alpha: 0.035))
ctx.setStrokeColor(CGColor(red: 255/255.0, green: 255/255.0, blue: 255/255.0, alpha: 0.08))
ctx.setLineWidth(1)
let roundedPath = CGPath(roundedRect: footerRect, cornerWidth: 10, cornerHeight: 10, transform: nil)
ctx.addPath(roundedPath)
ctx.fillPath()
ctx.addPath(roundedPath)
ctx.strokePath()
ctx.restoreGState()

// Footer Guide Text
let stepFont = NSFont.systemFont(ofSize: 10.5, weight: .semibold)
let stepColor = NSColor(calibratedRed: 56/255.0, green: 189/255.0, blue: 248/255.0, alpha: 0.95)
let stepSubFont = NSFont.systemFont(ofSize: 9.5, weight: .regular)
let stepSubColor = NSColor(calibratedRed: 160/255.0, green: 175/255.0, blue: 195/255.0, alpha: 0.85)

drawText("🛡️ LẦN ĐẦU MỞ: Cài đặt hệ thống ➔ Quyền riêng tư & Bảo mật ➔ Bấm [Vẫn mở]",
         x: 0, y: 355, font: stepFont, color: stepColor, align: .center, width: width)
drawText("First launch: System Settings ➔ Privacy & Security ➔ Click [Open Anyway]",
         x: 0, y: 373, font: stepSubFont, color: stepSubColor, align: .center, width: width)

NSGraphicsContext.restoreGraphicsState()

// Export Images
guard let cgImage = ctx.makeImage() else {
    fatalError("Failed to make CGImage")
}

let rep2x = NSBitmapImageRep(cgImage: cgImage)
rep2x.size = NSSize(width: width, height: height) // 640x420 pt

guard let png2xData = rep2x.representation(using: .png, properties: [:]) else {
    fatalError("Failed to make PNG data")
}

// Generate 1x version (downsampled 640x420)
let ctx1x = CGContext(
    data: nil,
    width: Int(width),
    height: Int(height),
    bitsPerComponent: 8,
    bytesPerRow: 0,
    space: colorSpace,
    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
)!
ctx1x.interpolationQuality = .high
ctx1x.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))
let rep1x = NSBitmapImageRep(cgImage: ctx1x.makeImage()!)
rep1x.size = NSSize(width: width, height: height)
guard let png1xData = rep1x.representation(using: .png, properties: [:]) else {
    fatalError("Failed to make 1x PNG")
}

// Also make a TIFF version with both 1x and 2x representation for VS Code create-dmg
let tiffData = rep2x.representation(using: .tiff, properties: [:])!

let fileManager = FileManager.default

// Destination paths
let targets: [(String, Data)] = [
    ("tools/yana-studio/build/background@2x.png", png2xData),
    ("tools/yana-studio/build/background.png", png1xData),
    ("tools/yana-ide/branding/dmg-background@2x.png", png2xData),
    ("tools/yana-ide/branding/dmg-background.png", png1xData),
    ("tools/yana-ide/branding/dmg-background.tiff", tiffData)
]

for (relPath, data) in targets {
    let url = URL(fileURLWithPath: relPath)
    try fileManager.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    try data.write(to: url)
    print("✅ Generated: \(relPath) (\(data.count / 1024) KB)")
}
print("🎨 All DMG background assets generated successfully!")
