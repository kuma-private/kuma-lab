// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "Seaman",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(
            name: "Seaman",
            path: "Sources/Seaman"
        ),
    ]
)
