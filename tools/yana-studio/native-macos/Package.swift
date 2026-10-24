// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "YanaStudioNative",
    platforms: [.macOS("26.0")],
    products: [
        .executable(name: "YanaStudioNative", targets: ["YanaStudioNative"]),
    ],
    targets: [
        .executableTarget(name: "YanaStudioNative"),
        .testTarget(name: "YanaStudioNativeTests", dependencies: ["YanaStudioNative"]),
    ]
)
