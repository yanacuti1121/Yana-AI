// swift-tools-version:5.9
import PackageDescription

// Yana Studio, native macOS (Apple Silicon). SwiftUI, no web view, no Python.
// The look follows the Fluent Blue design system (MIT): colors, sizes and the 133-icon set. See NOTICE.
// SwiftTerm (MIT, github.com/migueldeicaza/SwiftTerm) draws the built-in terminal. Pinned to one exact
// version, vetted and approved 2026-11-07. v1.99.1 does not compile with Swift 6.4 (ByteRunScanner,
// fixed upstream in #810, only in v1.99.3, which was under 7 days old), so this is v1.20.0 (2026-08-18).
let package = Package(
	name: "YanaApp",
	platforms: [.macOS(.v14)],
	dependencies: [
		.package(url: "https://github.com/migueldeicaza/SwiftTerm", exact: "1.20.0"),
	],
	targets: [
		.executableTarget(
			name: "YanaApp",
			dependencies: [.product(name: "SwiftTerm", package: "SwiftTerm")],
			path: "Sources/YanaApp",
			resources: [.process("Resources")]
		),
	]
)
