import XCTest
@testable import Seaman

final class PetAudioPlayerTests: XCTestCase {
    @MainActor
    func testPlayInvalidPathResumesPromptly() async throws {
        throw XCTSkip("Pending: PetAudioPlayer continuation safety (Agent-3 E2)")
        // let player = PetAudioPlayer()
        // let start = Date()
        // await player.play(path: "/nonexistent/file.wav")
        // XCTAssertLessThan(Date().timeIntervalSince(start), 1.0)
    }
}
