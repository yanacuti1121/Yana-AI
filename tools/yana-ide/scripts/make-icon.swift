// Usage: swift make-icon.swift <yana-emblem.svg> <out.png>
// Full-bleed square: macOS applies its own mask, so we must not pre-round or pad (that causes the white tile).
import Cocoa

let args = CommandLine.arguments
guard args.count == 3, let svg = NSImage(contentsOfFile: args[1]) else { print("usage: make-icon.swift in.svg out.png"); exit(1) }

let size = 1024
let space = CGColorSpaceCreateDeviceRGB()
let ctx = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0, space: space,
                    bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!

// Background: near-black with a soft blue glow behind the rabbit.
ctx.setFillColor(CGColor(red: 0.067, green: 0.071, blue: 0.09, alpha: 1))
ctx.fill(CGRect(x: 0, y: 0, width: size, height: size))
let glow = CGGradient(colorsSpace: space, colors: [CGColor(red: 0.22, green: 0.5, blue: 0.95, alpha: 0.38), CGColor(red: 0.22, green: 0.5, blue: 0.95, alpha: 0)] as CFArray, locations: [0, 1])!
ctx.drawRadialGradient(glow, startCenter: CGPoint(x: 512, y: 500), startRadius: 0, endCenter: CGPoint(x: 512, y: 500), endRadius: 560, options: [])

// Rabbit: SVG viewBox is 260x340, drawn about 720px tall and centred.
let h: CGFloat = 720
let w = h * 260 / 340
let rect = NSRect(x: (CGFloat(size) - w) / 2, y: (CGFloat(size) - h) / 2, width: w, height: h)
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(cgContext: ctx, flipped: false)
ctx.setShadow(offset: .zero, blur: 40, color: CGColor(red: 0.22, green: 0.6, blue: 1, alpha: 0.7))
svg.draw(in: rect)
NSGraphicsContext.restoreGraphicsState()

let out = NSBitmapImageRep(cgImage: ctx.makeImage()!)
try! out.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: args[2]))
print("wrote \(args[2])")
