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

    let private callApi (httpClient: HttpClient) (apiKey: string) (model: string) (systemPrompt: string) (userMessage: string) (maxTokens: int) : Async<Result<string, string>> =
        async {
            try
                let requestBody =
                    {| model = model
                       max_tokens = maxTokens
                       system = systemPrompt
                       messages = [| {| role = "user"; content = userMessage |} |] |}

                let jsonOptions = JsonSerializerOptions(PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower)
                let json = JsonSerializer.Serialize(requestBody, jsonOptions)
                let content = new StringContent(json, Encoding.UTF8, "application/json")

                let request =
                    new HttpRequestMessage(HttpMethod.Post, "https://api.anthropic.com/v1/messages")

                request.Content <- content
                request.Headers.Add("x-api-key", apiKey)
                request.Headers.Add("anthropic-version", "2023-06-01")

                let! response = httpClient.SendAsync(request) |> Async.AwaitTask
                let! responseBody = response.Content.ReadAsStringAsync() |> Async.AwaitTask

                if response.IsSuccessStatusCode then
                    let parsed = JsonSerializer.Deserialize<AnthropicResponse>(responseBody)
                    return extractText parsed
                elif int response.StatusCode = 529 || int response.StatusCode = 503 then
                    do! Async.Sleep 2000
                    let retryRequest =
                        new HttpRequestMessage(HttpMethod.Post, "https://api.anthropic.com/v1/messages")
                    retryRequest.Content <- new StringContent(json, Encoding.UTF8, "application/json")
                    retryRequest.Headers.Add("x-api-key", apiKey)
                    retryRequest.Headers.Add("anthropic-version", "2023-06-01")
                    let! retryResponse = httpClient.SendAsync(retryRequest) |> Async.AwaitTask
                    let! retryBody = retryResponse.Content.ReadAsStringAsync() |> Async.AwaitTask
                    if retryResponse.IsSuccessStatusCode then
                        let parsed = JsonSerializer.Deserialize<AnthropicResponse>(retryBody)
                        return extractText parsed
                    else
                        return Error $"Anthropic API error ({int retryResponse.StatusCode}): {retryBody}"
                else
                    return Error $"Anthropic API error ({int response.StatusCode}): {responseBody}"
            with ex ->
                return Error $"Exception calling Anthropic API: {ex.Message}"
        }

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
            + "- rechord形式で出力: | Am7 | Dm7 | G7 | Cmaj7 |\n"
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

