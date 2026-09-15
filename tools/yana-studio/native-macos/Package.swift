// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "YanaStudioNative",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "YanaStudioNative", targets: ["YanaStudioNative"]),
    ],
    targets: [
        .executableTarget(name: "YanaStudioNative"),
        .testTarget(name: "YanaStudioNativeTests", dependencies: ["YanaStudioNative"]),
    ]
)
