// swift-tools-version: 5.9
// NOTE: Swift Package Manager can't build .saver bundles directly — use Xcode project instead.
// This Package.swift exists for IDE tooling (code completion, linting) only.
import PackageDescription

let package = Package(
    name: "OrigamiScreensaver",
    platforms: [.macOS(.v12)],
    targets: [
        .target(
            name: "OrigamiScreensaver",
            path: "Sources/OrigamiScreensaver",
            linkerSettings: [
                .linkedFramework("ScreenSaver"),
                .linkedFramework("WebKit"),
            ]
        ),
    ]
)
