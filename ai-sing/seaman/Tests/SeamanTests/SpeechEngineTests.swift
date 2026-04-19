import XCTest
@testable import Seaman

final class SpeechEngineTests: XCTestCase {
    func testSynthKeyGenerationIsCollisionFree() {
        let keys = Set((0..<100).map { _ in SpeechEngine.generateSynthKey() })
        XCTAssertEqual(keys.count, 100)
    }
}
