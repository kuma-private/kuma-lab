namespace DoubutsuQuiz.Api.Nazenaze

open System
open System.Net.Http
open System.Text
open System.Text.Json
open System.Text.Json.Serialization

/// Phase 1 of nazenaze generation: extract 3-6 Japanese keywords from the
/// user question so the irasutoya catalog fed to the main Claude call can
/// actually contain topically relevant illustrations.
///
/// Uses Claude Haiku (fast, ~1s) with a small tool_use schema. Failures are
/// returned as Error — the caller is expected to fall back to the legacy
/// random catalog so the overall request never fails just because keyword
/// extraction broke.
module KeywordExtractor =

    [<CLIMutable>]
    type ContentBlock =
        { [<JsonPropertyName("type")>]
          Type: string
          [<JsonPropertyName("input")>]
          Input: JsonElement }

    [<CLIMutable>]
    type AnthropicResponse =
        { [<JsonPropertyName("content")>]
          Content: ContentBlock array }

    let private systemPrompt =
        """あなたは子供からの質問文を受け取り、いらすとや（日本の無料イラスト素材サイト）で関連画像を検索するための短い日本語キーワードを抽出します。

【ルール】
- 3〜6 個のキーワードを出力
- 各キーワードは 1〜4 文字の短い名詞（ひらがな・カタカナ・漢字どれでも可）
- 質問の主題（生き物・物・現象）と、紙芝居のシーンに登場しそうな関連語を含める
- 例「なめこはなぜぬるぬるするの？」→ ["なめこ", "きのこ", "ぬるぬる", "もり", "あめ"]
- 例「そらはなぜあおいの？」→ ["そら", "あおい", "くも", "たいよう", "ひかり"]
- 例「でんしゃはなぜはしるの？」→ ["でんしゃ", "せんろ", "えき", "かいしゃいん"]
- 抽象概念（「なぜ」「りゆう」「しくみ」）は入れない
- 必ず extract_keywords ツールを使う"""

    let private toolSchema : obj =
        let schemaJson =
            """{
                "type": "object",
                "properties": {
                    "keywords": {
                        "type": "array",
                        "minItems": 3,
                        "maxItems": 6,
                        "items": {
                            "type": "string",
                            "description": "質問の主題と関連する短い日本語の名詞"
                        }
                    }
                },
                "required": ["keywords"]
            }"""
        let schemaElement = JsonDocument.Parse(schemaJson).RootElement
        {| name = "extract_keywords"
           description = "Extract 3-6 short Japanese keywords from the user question for image catalog search"
           input_schema = schemaElement |}
        :> obj

    let extract
        (httpClient: HttpClient)
        (apiKey: string)
        (question: string)
        : Async<Result<string array, string>> =
        async {
            try
                let requestBody =
                    {| model = "claude-haiku-4-5-20251001"
                       max_tokens = 400
                       system = systemPrompt
                       tool_choice = {| ``type`` = "any" |}
                       tools = [| toolSchema |]
                       messages =
                        [| {| role = "user"
                              content = sprintf "質問: %s" question |} |] |}

                let jsonOptions = JsonSerializerOptions(PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower)
                let json = JsonSerializer.Serialize(requestBody, jsonOptions)

                use request = new HttpRequestMessage(HttpMethod.Post, "https://api.anthropic.com/v1/messages")
                request.Content <- new StringContent(json, Encoding.UTF8, "application/json")
                request.Headers.Add("x-api-key", apiKey)
                request.Headers.Add("anthropic-version", "2023-06-01")

                let! response = httpClient.SendAsync(request) |> Async.AwaitTask
                let! body = response.Content.ReadAsStringAsync() |> Async.AwaitTask

                if not response.IsSuccessStatusCode then
                    return Error (sprintf "keyword extract HTTP %d: %s" (int response.StatusCode) body)
                else
                    let parsed = JsonSerializer.Deserialize<AnthropicResponse>(body)
                    match parsed.Content |> Array.tryFind (fun c -> c.Type = "tool_use") with
                    | None -> return Error "no tool_use block in keyword response"
                    | Some block ->
                        if block.Input.ValueKind = JsonValueKind.Undefined
                           || block.Input.ValueKind = JsonValueKind.Null then
                            return Error "tool_use input missing"
                        else
                            match block.Input.TryGetProperty("keywords") with
                            | true, arr when arr.ValueKind = JsonValueKind.Array ->
                                let kws =
                                    arr.EnumerateArray()
                                    |> Seq.choose (fun el ->
                                        if el.ValueKind = JsonValueKind.String then
                                            let s = el.GetString()
                                            if String.IsNullOrWhiteSpace s then None
                                            else Some (s.Trim())
                                        else None)
                                    |> Seq.distinct
                                    |> Seq.toArray
                                if kws.Length = 0 then
                                    return Error "extracted keywords array was empty"
                                else
                                    return Ok kws
                            | _ -> return Error "keywords field not an array"
            with ex ->
                return Error (sprintf "keyword extract exception: %s" ex.Message)
        }
