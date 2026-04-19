import XCTest
@testable import Seaman

final class SpeechEngineTests: XCTestCase {
    func testSynthKeyGenerationIsCollisionFree() throws {
        throw XCTSkip("Pending: SpeechEngine key helper extraction (Agent-3 E4)")
        // let keys = Set((0..<100).map { _ in SpeechEngine.generateSynthKey() })
        // XCTAssertEqual(keys.count, 100)
    }
}
