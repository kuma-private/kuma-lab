import XCTest
@testable import Seaman

final class SetupCheckerTests: XCTestCase {
    // MARK: - checkProjectPath

    func testProjectPathMissingReturnsMissing() {
        let item = SetupChecker.checkProjectPath("/nonexistent/path/that/should/never/exist")
        if case .missing = item.status {
            // pass
        } else {
            XCTFail("expected .missing, got \(item.status)")
        }
    }

    func testProjectPathWithMakefileReturnsOK() throws {
        let fm = FileManager.default
        let dir = fm.temporaryDirectory
            .appendingPathComponent("SetupCheckerTests-\(UUID().uuidString)")
        try fm.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? fm.removeItem(at: dir) }

        let makefile = dir.appendingPathComponent("Makefile")
        try Data().write(to: makefile)

        let item = SetupChecker.checkProjectPath(dir.path)
        if case .ok = item.status {
            // pass
        } else {
            XCTFail("expected .ok, got \(item.status)")
        }
    }

    // MARK: - checkTTSVenv

    func testTTSVenvMissing() throws {
        let fm = FileManager.default
        let dir = fm.temporaryDirectory
            .appendingPathComponent("SetupCheckerTests-\(UUID().uuidString)")
        try fm.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? fm.removeItem(at: dir) }

        let item = SetupChecker.checkTTSVenv(dir.path)
        if case .missing = item.status {
            // pass
        } else {
            XCTFail("expected .missing, got \(item.status)")
        }
    }

    // MARK: - checkSeedVCVenv

    func testSeedVCVenvMissing() throws {
        let fm = FileManager.default
        let dir = fm.temporaryDirectory
            .appendingPathComponent("SetupCheckerTests-\(UUID().uuidString)")
        try fm.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? fm.removeItem(at: dir) }

        let item = SetupChecker.checkSeedVCVenv(dir.path)
        if case .missing = item.status {
            // pass
        } else {
            XCTFail("expected .missing, got \(item.status)")
        }
    }

    // MARK: - checkFFmpeg

    func testFFmpegDetectsHomebrewOrSystem() {
        // Machine-dependent: both .ok and .missing are acceptable.
        // Just smoke-test that the call returns a well-formed item.
        let item = SetupChecker.checkFFmpeg()
        XCTAssertFalse(item.title.isEmpty)
        XCTAssertEqual(item.id, "ffmpeg")
    }
}
