// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "Seaman",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(
            name: "Seaman",
            path: "Sources/Seaman",
            exclude: ["Info.plist"],
            resources: [
                .process("Resources"),
            ]
        ),
        .testTarget(
            name: "SeamanTests",
            dependencies: ["Seaman"],
            path: "Tests/SeamanTests"
        ),
    ]
)
