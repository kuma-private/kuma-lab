import XCTest
@testable import Seaman

final class PetBrainTests: XCTestCase {
    func testPostprocessTruncatesToTwoSentences() throws {
        throw XCTSkip("Pending: PetBrain.postprocess extraction (Agent-3 E1)")
        // Once extracted:
        // XCTAssertEqual(PetBrain.postprocess("一。二。三。"), "一。二。")
    }

    func testPostprocessEmptyReturnsFallback() throws {
        throw XCTSkip("Pending: PetBrain.postprocess extraction (Agent-3 E1)")
        // XCTAssertEqual(PetBrain.postprocess(""), "…水槽の中は今日も退屈だ。")
    }

    func testPostprocessSingleSentencePassesThrough() throws {
        throw XCTSkip("Pending: PetBrain.postprocess extraction (Agent-3 E1)")
        // XCTAssertEqual(PetBrain.postprocess("一文だけ"), "一文だけ")
    }
}
