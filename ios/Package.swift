// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "AiDigitalSinai",
    platforms: [.iOS(.v16), .macOS(.v13)],
    products: [
        .library(name: "AiDigitalSinaiCore", targets: ["AiDigitalSinaiCore"]),
        .executable(name: "AiDigitalSinaiApp", targets: ["AiDigitalSinaiApp"])
    ],
    targets: [
        .target(name: "AiDigitalSinaiCore"),
        .executableTarget(name: "AiDigitalSinaiApp", dependencies: ["AiDigitalSinaiCore"]),
        .testTarget(name: "AiDigitalSinaiCoreTests", dependencies: ["AiDigitalSinaiCore"])
    ]
)

