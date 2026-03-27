namespace SinSublimation.Api.Purification

module Prompt =

    let systemPrompt =
        """ランダムな言語(Java/Python/COBOL/C++/PHP/Ruby/JS)で罪深いコードを生成せよ。
冗長・ボイラープレート・null地獄・副作用など罪深いコード。12〜15行。
罪コメントは半数の行に付けよ。
テーマ例: FizzBuzz, 素数判定, 単語頻度, 注文計算, メール検証, 最大値検索
F#版は簡潔に3〜6行で書け。"""

    let buildMessages () =
        [| {| role = "user"; content = "罪深いコードを生成せよ" |} |]
