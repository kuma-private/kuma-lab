import XCTest
@testable import Seaman

@MainActor
final class SongEngineTests: XCTestCase {
    // MARK: - latestVCVocals

    func testLatestVCVocalsPicksMostRecent() throws {
        let fm = FileManager.default
        let dir = fm.temporaryDirectory
            .appendingPathComponent("SongEngineTests-\(UUID().uuidString)")
        try fm.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? fm.removeItem(at: dir) }

        let a = dir.appendingPathComponent("vc_vocals_a.wav")
        let b = dir.appendingPathComponent("vc_vocals_b.wav")
        let c = dir.appendingPathComponent("vc_vocals_c.wav")
        for url in [a, b, c] {
            try Data().write(to: url)
        }

        let now = Date()
        try fm.setAttributes([.modificationDate: now.addingTimeInterval(-300)], ofItemAtPath: a.path)
        try fm.setAttributes([.modificationDate: now.addingTimeInterval(-100)], ofItemAtPath: b.path)
        try fm.setAttributes([.modificationDate: now], ofItemAtPath: c.path)

        let engine = SongEngine()
        let latest = try engine.latestVCVocals(in: dir.path)
        XCTAssertEqual((latest as NSString).lastPathComponent, "vc_vocals_c.wav")
    }

    func testLatestVCVocalsThrowsWhenEmpty() throws {
        let fm = FileManager.default
        let dir = fm.temporaryDirectory
            .appendingPathComponent("SongEngineTests-\(UUID().uuidString)")
        try fm.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? fm.removeItem(at: dir) }

        let engine = SongEngine()
        XCTAssertThrowsError(try engine.latestVCVocals(in: dir.path))
    }

    // MARK: - absolutePath

    func testAbsolutePathPassThroughForAbsolute() {
        let engine = SongEngine()
        XCTAssertEqual(engine.absolutePath("/foo/bar", relativeTo: "/anything"), "/foo/bar")
    }

    func testAbsolutePathPrependsBase() {
        let engine = SongEngine()
        XCTAssertEqual(engine.absolutePath("a.wav", relativeTo: "/proj"), "/proj/a.wav")
    }
}
