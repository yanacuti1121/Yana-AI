// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "YanaNotch",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(name: "YanaNotch", path: "Sources/YanaNotch"),
    ]
)
