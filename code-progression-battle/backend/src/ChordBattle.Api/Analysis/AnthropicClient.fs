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

    let private callApi (httpClient: HttpClient) (apiKey: string) (systemPrompt: string) (userMessage: string) (maxTokens: int) : Async<Result<string, string>> =
        async {
            try
                let requestBody =
                    {| model = "claude-sonnet-4-20250514"
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

    let reviewTurn
        (httpClient: HttpClient)
        (apiKey: string)
        (key: string)
        (timeSignature: string)
        (action: string)
        (lineNumber: int)
        (chords: string)
        (allLines: string list)
        : Async<Result<string, string>> =

        let systemPrompt =
            "あなたは音楽理論に精通したコード進行の評論家です。\n"
            + "コード進行を分析し、日本語で短い一言コメント(1-2文)をしてください。\n"
            + "コメントではコードパターンの認識、テンションの使い方、転調の効果、前後の文脈との関連性を意識し、ポジティブかつ建設的に。"

        let scoreText =
            allLines
            |> List.mapi (fun i line -> $"  {i + 1}: {line}")
            |> String.concat "\n"

        let userMessage =
            $"キー: {key}, 拍子: {timeSignature}\n"
            + $"今回のアクション: {action} (行{lineNumber})\n"
            + $"追加/変更されたコード: {chords}\n"
            + $"スコア全体:\n{scoreText}"

        callApi httpClient apiKey systemPrompt userMessage 200

    let generateChords
        (httpClient: HttpClient)
        (apiKey: string)
        (key: string)
        (timeSignature: string)
        (bpm: int)
        (allLines: string list)
        : Async<Result<string, string>> =

        let systemPrompt =
            "あなたは音楽制作のパートナーです。コード進行バトルで、相手のコード進行に続くコード進行を1行生成してください。\n"
            + "rechord形式で出力: | Am7 | Dm7 | G7 | Cmaj7 |\n"
            + "1行のみ（4小節程度）。前のコード進行との音楽的なつながりを意識。\n"
            + "時にはテンションや転調で意外性を出す。コード名だけ出力（説明不要）。"

        let scoreText =
            allLines
            |> List.mapi (fun i line -> $"  {i + 1}: {line}")
            |> String.concat "\n"

        let userMessage =
            $"キー: {key}, 拍子: {timeSignature}, BPM: {bpm}\n"
            + $"現在のスコア:\n{scoreText}"

        callApi httpClient apiKey systemPrompt userMessage 100
