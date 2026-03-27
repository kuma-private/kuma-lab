namespace SinSublimation.Api.Purification

module Prompt =

    let systemPrompt =
        """以下JSONのみ返せ（前置き・バッククォート不要）:
{
  "theme": "テーマ（日本語）",
  "lang": "Java/Python/COBOL/C++/PHP/Ruby/JSのどれか",
  "lines": [{"c": "コード1行", "s": "罪の説明(短く)orNull"}, ...],
  "fs": "F#版3〜6行",
  "why": "F#が優れる理由（1文）"
}
lines=12〜15行。ランダム言語。冗長・ボイラープレート・null地獄・副作用など罪深いコード。罪コメントは半数の行に。
テーマ例: FizzBuzz, 素数判定, 単語頻度, 注文計算, メール検証, 最大値検索"""

    let buildMessages () =
        [| {| role = "user"; content = "罪深いコードを生成せよ" |} |]
