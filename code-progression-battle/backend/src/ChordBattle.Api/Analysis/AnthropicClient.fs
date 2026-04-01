namespace ChordBattle.Api.Analysis

open System.Net.Http
open System.Text
open System.Text.Json
open System.Text.Json.Serialization

module AnthropicClient =

    [<CLIMutable>]
    type ContentBlock =
        { [<JsonPropertyName("type")>]
          Type: string
          [<JsonPropertyName("text")>]
          Text: string }

    [<CLIMutable>]
    type AnthropicResponse =
        { [<JsonPropertyName("id")>]
          Id: string
          [<JsonPropertyName("content")>]
          Content: ContentBlock array }

    let private extractText (parsed: AnthropicResponse) : Result<string, string> =
        match parsed.Content |> Array.tryFind (fun c -> c.Type = "text") with
        | Some block -> Ok block.Text
        | None -> Error "No text content in Anthropic response"

    let private sendRequest (httpClient: HttpClient) (apiKey: string) (json: string) : Async<Result<string, string>> =
        async {
            let makeRequest () =
                let req = new HttpRequestMessage(HttpMethod.Post, "https://api.anthropic.com/v1/messages")
                req.Content <- new StringContent(json, Encoding.UTF8, "application/json")
                req.Headers.Add("x-api-key", apiKey)
                req.Headers.Add("anthropic-version", "2023-06-01")
                req

            let parseResponse (response: HttpResponseMessage) = async {
                let! body = response.Content.ReadAsStringAsync() |> Async.AwaitTask
                if response.IsSuccessStatusCode then
                    return Ok(JsonSerializer.Deserialize<AnthropicResponse>(body) |> extractText)
                else
                    return Error(int response.StatusCode, body)
            }

            try
                let! firstResult = httpClient.SendAsync(makeRequest()) |> Async.AwaitTask
                let! parsed = parseResponse firstResult
                match parsed with
                | Ok result -> return result
                | Error(status, body) when status = 529 || status = 503 ->
                    do! Async.Sleep 2000
                    let! retryResult = httpClient.SendAsync(makeRequest()) |> Async.AwaitTask
                    let! retryParsed = parseResponse retryResult
                    match retryParsed with
                    | Ok result -> return result
                    | Error(status, body) -> return Error $"Anthropic API error ({status}): {body}"
                | Error(status, body) ->
                    return Error $"Anthropic API error ({status}): {body}"
            with ex ->
                return Error $"Exception calling Anthropic API: {ex.Message}"
        }

    let private jsonOptions = JsonSerializerOptions(PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower)

    let private callApi (httpClient: HttpClient) (apiKey: string) (model: string) (systemPrompt: string) (userMessage: string) (maxTokens: int) : Async<Result<string, string>> =
        let body =
            {| model = model
               max_tokens = maxTokens
               system = systemPrompt
               messages = [| {| role = "user"; content = userMessage |} |] |}
        let json = JsonSerializer.Serialize(body, jsonOptions)
        sendRequest httpClient apiKey json

    let private callWithImages (httpClient: HttpClient) (apiKey: string) (model: string) (systemPrompt: string) (images: (string * string) list) (userText: string) (maxTokens: int) : Async<Result<string, string>> =
        let imageBlocks =
            images
            |> List.map (fun (mediaType, data) ->
                {| ``type`` = "image"
                   source = {| ``type`` = "base64"
                               media_type = mediaType
                               data = data |} |} :> obj)
        let textBlock = {| ``type`` = "text"; text = userText |} :> obj
        let contentArray = imageBlocks @ [ textBlock ] |> List.toArray
        let body =
            {| model = model
               max_tokens = maxTokens
               system = systemPrompt
               messages = [| {| role = "user"; content = contentArray |} |] |}
        let json = JsonSerializer.Serialize(body, jsonOptions)
        sendRequest httpClient apiKey json

    [<CLIMutable>]
    type ReviewScores =
        { [<JsonPropertyName("tension")>]
          Tension: int
          [<JsonPropertyName("creativity")>]
          Creativity: int
          [<JsonPropertyName("coherence")>]
          Coherence: int
          [<JsonPropertyName("surprise")>]
          Surprise: int }

    [<CLIMutable>]
    type ReviewResponse =
        { [<JsonPropertyName("comment")>]
          Comment: string
          [<JsonPropertyName("scores")>]
          Scores: ReviewScores }

    type ReviewResult =
        { Comment: string
          ScoresJson: string }

    [<CLIMutable>]
    type TransformResponse =
        { [<JsonPropertyName("comment")>]
          Comment: string
          [<JsonPropertyName("chords")>]
          Chords: string }

    let transformChords
        (httpClient: HttpClient)
        (apiKey: string)
        (key: string)
        (timeSignature: string)
        (fullScore: string)
        (selectedChords: string)
        (instruction: string)
        : Async<Result<{| comment: string; chords: string |}, string>> =

        let systemPrompt =
            "あなたは音楽理論に精通したコード進行のアレンジャーです。\n"
            + "ユーザーが選択したコード進行を、指示に従って変更してください。\n\n"
            + "JSONで回答してください:\n"
            + "{\n"
            + "  \"comment\": \"変更内容の説明（日本語、1-2文）\",\n"
            + "  \"chords\": \"変更後のコード進行（rechord形式）\"\n"
            + "}\n\n"
            + "ルール:\n"
            + "- 元のコード数（小節数）を維持すること\n"
            + "- 元の改行位置を維持すること（複数行なら複数行のまま）\n"
            + "- rechord形式で出力: | Am7 | Dm7 | G7 | Cmaj7 |\n"
            + "- chordsフィールド内の改行は \\n で表現すること\n"
            + "- JSONのみ出力、余分なテキストは不要"

        let userMessage =
            $"キー: {key}\n拍子: {timeSignature}\n\n"
            + $"スコア全体:\n{fullScore}\n\n"
            + $"変更対象:\n{selectedChords}\n\n"
            + $"指示:\n{instruction}"

        async {
            let! result = callApi httpClient apiKey "claude-opus-4-20250514" systemPrompt userMessage 300
            match result with
            | Error e -> return Error e
            | Ok text ->
                try
                    let cleanText =
                        text.Trim().Replace("```json", "").Replace("```", "").Trim()
                    let parsed = JsonSerializer.Deserialize<TransformResponse>(cleanText)
                    return Ok {| comment = parsed.Comment; chords = parsed.Chords |}
                with ex ->
                    return Error $"Failed to parse transform response: {ex.Message}"
        }

    let reviewTurn
        (httpClient: HttpClient)
        (apiKey: string)
        (key: string)
        (timeSignature: string)
        (score: string)
        (scoreLines: string list)
        : Async<Result<ReviewResult, string>> =

        let systemPrompt =
            "あなたは音楽理論に精通したコード進行の評論家です。\n"
            + "以下のコード進行を分析し、JSONで回答してください。\n\n"
            + "{\n"
            + "  \"comment\": \"日本語で短い一言コメント(1-2文)\",\n"
            + "  \"scores\": {\n"
            + "    \"tension\": 1-5,\n"
            + "    \"creativity\": 1-5,\n"
            + "    \"coherence\": 1-5,\n"
            + "    \"surprise\": 1-5\n"
            + "  }\n"
            + "}\n\n"
            + "各スコアの基準:\n"
            + "- tension: テンションノートや不協和音の使い方。5=大胆に活用、1=ほぼなし\n"
            + "- creativity: 独創性、意外なコード選択。5=非常にユニーク、1=ありきたり\n"
            + "- coherence: 前後のコードとの繋がり、音楽的整合性。5=完璧な流れ、1=不自然\n"
            + "- surprise: サプライズ感、転調や意外な展開。5=驚きの展開、1=予想通り\n\n"
            + "JSONのみ出力してください。"

        let scoreText =
            scoreLines
            |> List.mapi (fun i line -> $"  {i + 1}: {line}")
            |> String.concat "\n"

        let userMessage =
            $"キー: {key}\n拍子: {timeSignature}\n"
            + $"コード進行: {score}\n\n"
            + $"スコア全体:\n{scoreText}"

        async {
            let! result = callApi httpClient apiKey "claude-sonnet-4-20250514" systemPrompt userMessage 300
            match result with
            | Error e -> return Error e
            | Ok text ->
                try
                    let parsed = JsonSerializer.Deserialize<ReviewResponse>(text.Trim())
                    let scoresJson = JsonSerializer.Serialize(parsed.Scores)
                    return Ok { Comment = parsed.Comment; ScoresJson = scoresJson }
                with _ ->
                    return Ok { Comment = text; ScoresJson = "" }
        }

    let analyzeSelection
        (httpClient: HttpClient)
        (apiKey: string)
        (selectedChords: string)
        (fullScore: string)
        (key: string)
        (timeSignature: string)
        : Async<Result<string, string>> =

        let systemPrompt =
            "あなたは音楽理論に精通したコード進行の分析家です。選択された部分を具体的に分析してください。"

        let userMessage =
            "以下のコード進行から、選択された部分を音楽理論的に分析してください。\n\n"
            + $"曲全体:\n{fullScore}\n\n"
            + $"選択部分:\n{selectedChords}\n\n"
            + $"Key: {key}\n拍子: {timeSignature}\n\n"
            + "選択部分について以下を分析:\n"
            + "- 和声機能（トニック/サブドミナント/ドミナント）\n"
            + "- 特徴的な進行パターン（ii-V-I、王道進行等）\n"
            + "- この部分の良い点や特徴\n"
            + "- 改善の提案（あれば）\n\n"
            + "日本語で2-3文で簡潔に。"

        callApi httpClient apiKey "claude-sonnet-4-20250514" systemPrompt userMessage 300

    let importChordChart
        (httpClient: HttpClient)
        (apiKey: string)
        (images: (string * string) list)
        (songName: string)
        (artist: string)
        (sourceUrl: string)
        (bpm: int)
        (timeSignature: string)
        (key: string)
        : Async<Result<string, string>> =

        let systemPrompt =
            "あなたは音楽理論とコード進行分析に精通したプロの音楽家・編曲家です。\n"
            + "コード譜サイト（U-Fret等）の画像からコードを読み取り、正しい小節割りで出力してください。\n\n"
            + "【最重要】コード譜サイトには小節線がありません。1行に並んだコードを全て1小節1コードで出力するのは間違いです。\n"
            + "あなたの和声分析の知識（ii-V、ドミナントモーション、定番進行パターン等）とBPMから、\n"
            + "ハーモニックリズムを推定して適切にグルーピングしてください。\n\n"
            + "例えば、1行に `C# D# Cm Fm A#m D# G#` と7コード並んでいた場合:\n"
            + "❌ 間違い: | C# | D# | Cm | Fm | A#m | D# | G# |\n"
            + "✅ 正解: | C# D# | Cm Fm | A#m D# | G# |（和声機能ペアでグルーピング）"

        let songInfo = if System.String.IsNullOrEmpty(songName) then "不明" else songName
        let artistInfo = if System.String.IsNullOrEmpty(artist) then "不明" else artist
        let urlInfo = if System.String.IsNullOrEmpty(sourceUrl) then "" else sourceUrl
        let bpmInfo = if bpm <= 0 then "不明" else string bpm
        let tsInfo = if System.String.IsNullOrEmpty(timeSignature) then "4/4" else timeSignature
        let keyInfo = if System.String.IsNullOrEmpty(key) then "不明" else key

        let imageCount = List.length images

        let userMessage =
            "以下の画像はコード譜サイト（U-Fret等）のスクリーンショットです。\n"
            + (if imageCount > 1 then $"画像は{imageCount}枚あり、1曲の連続したコード譜です。順番通りに繋げてください。\n" else "")
            + "\nあなたの音楽理論の知識を使って、コードを読み取り、正しい小節割りで出力してください。\n\n"
            + $"## 楽曲情報\n"
            + $"- 曲名: {songInfo}\n"
            + $"- アーティスト: {artistInfo}\n"
            + (if urlInfo <> "" then $"- URL: {urlInfo}\n" else "")
            + $"- BPM: {bpmInfo}\n"
            + $"- 拍子: {tsInfo}\n"
            + $"- Key: {keyInfo}\n\n"
            + "## 出力フォーマット\n"
            + "```\n"
            + "// セクション名\n"
            + "| コード1 コード2 | コード3 | コード4 コード5 |\n"
            + "```\n"
            + "- `|` で小節を区切る。1小節内に複数コードはスペース区切り（均等拍分割）\n"
            + "- `-` で前コードの拍を伸ばす: `| C - Am G |` = C2拍, Am1拍, G1拍\n"
            + "- `// セクション名` でセクションを示す（イントロ/Aメロ/Bメロ/サビ/間奏/アウトロ）\n"
            + "- 空行でセクション間を区切る\n\n"
            + "## 小節グルーピング\n"
            + "あなたの音楽理論の知識で小節割りを推論してください。\n"
            + "BPM・和声機能（ii-V、SD→D等）・歌詞密度・曲名の知識を総合的に判断すること。\n"
            + "1コード=1小節のベタ並べは絶対に避けること。\n\n"
            + "## セクション区切り\n"
            + "- Aメロ/Bメロ/サビ等のラベルを無理に推測しないこと\n"
            + "- 音楽的に明確な区切り（歌詞なし部分、転調、コード進行パターンの明らかな変化）がある場合のみ空行で区切る\n"
            + "- 歌詞なし冒頭でも `// イントロ` とは書かない。空行で区切るだけでよい\n"
            + "- セクション名は曲名から構造が明確に分かる場合のみ記載してよい\n"
            + "- 曲名が判明していればその楽曲構造の知識でセクション名を付けてよい\n\n"
            + "## コード表記\n"
            + "- シャープ: # （F#m, C#m）　フラット: b （Bbm7-5, Ebm）※♭ではなくアルファベットb\n"
            + "- スラッシュコード: G/B, Em7/D　テンション: Cadd9, B7-9, Am7-5\n\n"
            + "## 正解例（BPM 72のバラード）\n"
            + "画像にコード5個が横並び（歌詞なし）→ 次の行から歌詞あり、の場合:\n\n"
            + "```\n"
            + "| Cmaj7 | Bm7 | Am7 | A/B B7-9 |\n"
            + "\n"
            + "| Em | Bm7 |\n"
            + "| Am7 D | G B |\n"
            + "| Am7 D | Bm7 Em |\n"
            + "| Am7 B | Em |\n"
            + "\n"
            + "| Cmaj7 | Bm7 Em |\n"
            + "| Am7 B | Em Em7/D |\n"
            + "| Cmaj7 - - D/C | Bm7 E7 |\n"
            + "| Am7 A/B | B |\n"
            + "\n"
            + "| Amaj7 B/A | G#m7 C#m |\n"
            + "| Ebm7-5 G# | C#m - Bm7/E E |\n"
            + "| Bbm7-5 AmM7 | G#m7 C#m |\n"
            + "| F#m | F#m7/B | E |\n"
            + "```\n\n"
            + "この例のポイント:\n"
            + "- セクション名（//）は書かず、音楽的な区切りを空行で表現\n"
            + "- BPM72なので基本2コード/小節。Am7→Dはii→V、G→Bも機能ペアで同一小節\n"
            + "- A/B→B7-9はドミナント準備の連結で同一小節\n"
            + "- Cmaj7→D/Cは3拍+1拍の不均等分割: `| Cmaj7 - - D/C |`\n"
            + "- Ebm7-5→G#はii°→V（マイナーii-V）で同一小節\n\n"
            + "コードのみを出力してください。歌詞、説明、セクション名、囲みは不要です。"

        async {
            let! result = callWithImages httpClient apiKey "claude-opus-4-20250514" systemPrompt images userMessage 4000
            match result with
            | Error e -> return Error e
            | Ok text ->
                let cleanText = text.Trim().Replace("```", "").Trim()
                return Ok cleanText
        }

