import XCTest
@testable import Seaman

final class PetBrainTests: XCTestCase {
    func testPostprocessTruncatesToTwoSentences() {
        XCTAssertEqual(PetBrain.postprocess("一。二。三。"), "一。二。")
    }

    func testPostprocessEmptyReturnsFallback() {
        XCTAssertEqual(PetBrain.postprocess(""), "…水槽の中は今日も退屈だ。")
    }

    func testPostprocessSingleSentencePassesThrough() {
        XCTAssertEqual(PetBrain.postprocess("一文だけ"), "一文だけ")
    }
}
