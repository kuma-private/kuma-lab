namespace DoubutsuQuiz.Api.Nazenaze

open System
open System.Collections.Generic
open System.Net.Http
open System.Text
open System.Text.Json
open System.Text.Json.Serialization
open DoubutsuQuiz.Api.Quiz
open DoubutsuQuiz.Api.Ehon

module Generator =

    type NazenazeMode =
        | TrueMode
        | FalseMode

    type ElementPlacement =
        { ImageId: string
          X: double
          Y: double
          Width: double
          Height: double
          Rotation: double
          FlipHorizontal: bool
          ZIndex: int }

    type StoryPage =
        { PageNumber: int
          Text: string
          Elements: ElementPlacement array }

    type Story =
        { Title: string
          Mode: string
          Pages: StoryPage array
          SampledImages: IrasutoyaIndex.Entry array }

    [<CLIMutable>]
    type ContentBlock =
        { [<JsonPropertyName("type")>]
          Type: string
          [<JsonPropertyName("text")>]
          Text: string
          [<JsonPropertyName("input")>]
          Input: JsonElement }

    [<CLIMutable>]
    type AnthropicResponse =
        { [<JsonPropertyName("id")>]
          Id: string
          [<JsonPropertyName("content")>]
          Content: ContentBlock array }

    [<CLIMutable>]
    type RawElement =
        { [<JsonPropertyName("imageId")>]
          imageId: string
          [<JsonPropertyName("x")>]
          x: double
          [<JsonPropertyName("y")>]
          y: double
          [<JsonPropertyName("width")>]
          width: double
          [<JsonPropertyName("height")>]
          height: double
          [<JsonPropertyName("rotation")>]
          rotation: double
          [<JsonPropertyName("flipHorizontal")>]
          flipHorizontal: bool
          [<JsonPropertyName("zIndex")>]
          zIndex: int }

    [<CLIMutable>]
    type RawPage =
        { [<JsonPropertyName("pageNumber")>]
          pageNumber: int
          [<JsonPropertyName("text")>]
          text: string
          [<JsonPropertyName("elements")>]
          elements: RawElement array }

    [<CLIMutable>]
    type RawStory =
        { [<JsonPropertyName("title")>]
          title: string
          [<JsonPropertyName("pages")>]
          pages: RawPage array }

    let private systemPrompt =
        """あなたは 5〜7 歳の子供にわかりやすく世界の仕組みを説明する博士です。
出力は紙芝居形式 (1ページ 1場面) で、指定された pageCount ページで完結させてください。

【絶対ルール】
- 言葉は極限までシンプル、ひらがな 95% 以上、わかちがき必須
- 1 ページ 1〜2 文、10〜20 文字程度
- 難しい概念は身近なたとえに置き換える (例: 「電波」→「めに みえない こえ」)
- 各ページは前のページを受けて次のページに繋ぐ。流れを作る
- 最終ページは「だから こうなるんだよ」的な納得の締めでよい (絵本と違って解説なので)

【本当モードの場合】
- 科学的に正しい説明をやさしくする
- 嘘や誇張は禁止
- 専門用語は全て身近な言葉に置き換える

【嘘モードの場合】
- **もっともらしいウソ** を真顔で展開する
- 無茶苦茶ではなく「ありそう」と子供が思うレベルのウソ
- 例: テレビは「ちいさな ひとが なかで えを かいてる」、雨は「そらの うえの どうぶつたちが おふろに はいってる」みたいな
- 締めで「ほんとうかな？」と疑問を残すのも OK
- 道徳的な締め (「大人になったらほんとうを学ぼう」等) は禁止
- 子供が笑って楽しめる可愛いウソ

【画像の使い方 — 重要】
- 背景は AI が別途生成して下に敷きます。あなたが選ぶ画像はその上に乗る「キャラ・物・小さな装飾」だけです
- **背景的な画像は絶対に使わない**: 空・道・部屋・町並み・森・雪景色・海面・星空 など、画面いっぱいに広がる scene 系は禁止
- **使ってよい画像**: 動物・子供・人物・道具・食べ物・小さな装飾 (花・星・吹き出し等)
- 全部使う必要はない。1 ページに 1〜3 枚、選んだ画像が背景画像と被らない構図で配置
- 世界観が合わない画像は無視する
- **要素のサイズ**: width / height は **最大 0.45** に抑える (背景を隠さないため)
- **配置**: y は 0.15〜0.55 の範囲で、画面の中央〜上部に配置 (下部は説明テキストが入る)

【出力形式】
generate_nazenaze_story ツールを必ず使い、title と pages を出力してください。"""

    let private buildCatalogText (samples: IrasutoyaIndex.Entry array) : string =
        let sb = StringBuilder()
        sb.AppendLine("## 画像カタログ（20 枚）") |> ignore
        for e in samples do
            let categories =
                if isNull e.Categories || e.Categories.Length = 0 then
                    ""
                else
                    String.concat ", " e.Categories

            let description =
                if String.IsNullOrWhiteSpace e.Description then ""
                else e.Description

            sb.AppendLine(sprintf "- id: %s" e.Id) |> ignore
            sb.AppendLine(sprintf "  title: %s" (if isNull e.Title then "" else e.Title)) |> ignore
            if description.Length > 0 then
                sb.AppendLine(sprintf "  description: %s" description) |> ignore
            if categories.Length > 0 then
                sb.AppendLine(sprintf "  categories: %s" categories) |> ignore
        sb.ToString()

    let private buildUserMessage
        (mode: NazenazeMode)
        (question: string)
        (pageCount: int)
        (catalogText: string) =

        let modeBlock =
            match mode with
            | TrueMode ->
                "**【モード: 本当】**\n\
                 科学的に正しい説明を 5 歳児にもわかる言葉にやさしく置き換えてください。\n\
                 嘘や誇張は禁止。専門用語は全て身近なたとえに置き換える。"
            | FalseMode ->
                "**【モード: 嘘】**\n\
                 もっともらしいウソ解説を真顔で展開してください。\n\
                 無茶苦茶ではなく「子供がありそうと思う」レベルのかわいいウソ。\n\
                 道徳的な締めは禁止。「ほんとうかな？」で締めるのは OK。"

        let content =
            sprintf
                "**【厳守】この紙芝居はちょうど %d ページにしてください。それ以上でもそれ以下でもいけません。**\n\n\
                 **【質問】**\n\
                 %s\n\n\
                 %s\n\n\
                 **【書き方】**\n\
                 - 1 ページ 1〜2 文、10〜20 文字程度\n\
                 - ひらがな 95%% 以上、わかちがき必須\n\
                 - 各ページは前のページから自然に繋がる流れを作る\n\
                 - 最終ページは「だから こうなるんだよ」的な納得の締め\n\n\
                 **【画像の使い方】**\n\
                 - カタログから **ふさわしい画像だけ** を選んで使う (3〜8 枚目安)\n\
                 - 全部使う必要はない。世界観に合わない画像は捨てる\n\
                 - 各ページの要素数は 1〜5 個 (詰め込みすぎない)\n\n\
                 %s\n\n\
                 最後にもう一度確認します: pages 配列の長さは正確に %d でなければなりません。"
                pageCount
                question
                modeBlock
                catalogText
                pageCount

        [| {| role = "user"; content = content |} |]

    let private buildToolSchema (samples: IrasutoyaIndex.Entry array) : obj =
        let enumValues = samples |> Array.map (fun e -> e.Id)

        let schemaJson =
            sprintf
                """{
                    "type": "object",
                    "properties": {
                        "title": {
                            "type": "string",
                            "description": "紙芝居のタイトル（ひらがな主体、短く）"
                        },
                        "pages": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "pageNumber": {"type": "integer", "minimum": 1},
                                    "text": {
                                        "type": "string",
                                        "description": "そのページの本文（1〜2文、ひらがな多め、10〜20文字目安）"
                                    },
                                    "elements": {
                                        "type": "array",
                                        "minItems": 1,
                                        "maxItems": 5,
                                        "items": {
                                            "type": "object",
                                            "properties": {
                                                "imageId": {
                                                    "type": "string",
                                                    "enum": %s,
                                                    "description": "画像カタログに含まれる id"
                                                },
                                                "x": {"type": "number", "minimum": 0.0, "maximum": 1.0},
                                                "y": {"type": "number", "minimum": 0.0, "maximum": 1.0},
                                                "width": {"type": "number", "minimum": 0.08, "maximum": 1.0},
                                                "height": {"type": "number", "minimum": 0.10, "maximum": 1.0},
                                                "rotation": {"type": "number", "minimum": -180.0, "maximum": 180.0},
                                                "flipHorizontal": {"type": "boolean"},
                                                "zIndex": {"type": "integer", "minimum": 0, "maximum": 9}
                                            },
                                            "required": [
                                                "imageId", "x", "y", "width", "height",
                                                "rotation", "flipHorizontal", "zIndex"
                                            ]
                                        }
                                    }
                                },
                                "required": ["pageNumber", "text", "elements"]
                            }
                        }
                    },
                    "required": ["title", "pages"]
                }"""
                (JsonSerializer.Serialize enumValues)

        let schemaElement = JsonDocument.Parse(schemaJson).RootElement

        {| name = "generate_nazenaze_story"
           description = "Generate a why-explanation kamishibai story using the supplied image catalog"
           input_schema = schemaElement |}
        :> obj

    let private extractToolUseInput (parsed: AnthropicResponse) : Result<string, string> =
        match parsed.Content |> Array.tryFind (fun c -> c.Type = "tool_use") with
        | Some block ->
            if block.Input.ValueKind <> JsonValueKind.Undefined && block.Input.ValueKind <> JsonValueKind.Null then
                Ok(block.Input.GetRawText())
            else
                Error "tool_use block has no input"
        | None ->
            match parsed.Content |> Array.tryFind (fun c -> c.Type = "text") with
            | Some block -> Ok block.Text
            | None -> Error "No tool_use or text content in Anthropic response"

    let private validateElement
        (pageNumber: int)
        (sampleIds: HashSet<string>)
        (raw: RawElement)
        : Result<ElementPlacement, string> =
        if isNull raw.imageId then
            Error (sprintf "Page %d: element imageId is null" pageNumber)
        elif not (sampleIds.Contains raw.imageId) then
            Error (sprintf "Page %d: invalid imageId '%s' not in sampled set" pageNumber raw.imageId)
        elif raw.width < 0.08 || raw.height < 0.10 then
            Error
                (sprintf
                    "Page %d: element '%s' too small (width=%f height=%f)"
                    pageNumber
                    raw.imageId
                    raw.width
                    raw.height)
        elif raw.x < 0.0 || raw.y < 0.0 || raw.x + raw.width > 1.0001 || raw.y + raw.height > 1.0001 then
            Error
                (sprintf
                    "Page %d: element '%s' out of bounds (x=%f y=%f w=%f h=%f)"
                    pageNumber
                    raw.imageId
                    raw.x
                    raw.y
                    raw.width
                    raw.height)
        else
            Ok
                { ImageId = raw.imageId
                  X = raw.x
                  Y = raw.y
                  Width = raw.width
                  Height = raw.height
                  Rotation = raw.rotation
                  FlipHorizontal = raw.flipHorizontal
                  ZIndex = raw.zIndex }

    let private validatePage
        (sampleIds: HashSet<string>)
        (raw: RawPage)
        : Result<StoryPage, string> =
        if isNull raw.elements || raw.elements.Length = 0 then
            Error (sprintf "Page %d: elements missing" raw.pageNumber)
        else
            let results =
                raw.elements
                |> Array.map (validateElement raw.pageNumber sampleIds)

            let errors =
                results
                |> Array.choose (function
                    | Error e -> Some e
                    | Ok _ -> None)

            if errors.Length > 0 then
                Error (String.concat "; " errors)
            else
                let elements =
                    results
                    |> Array.map (function
                        | Ok e -> e
                        | Error _ -> failwith "unreachable")

                Ok
                    { PageNumber = raw.pageNumber
                      Text = (if isNull raw.text then "" else raw.text)
                      Elements = elements }

    let private parseStory
        (rawJson: string)
        (mode: string)
        (samples: IrasutoyaIndex.Entry array)
        : Result<Story, string> =
        try
            let options = JsonSerializerOptions(PropertyNameCaseInsensitive = true)
            let raw = JsonSerializer.Deserialize<RawStory>(rawJson, options)

            if isNull (box raw) then
                Error "Deserialized to null"
            elif isNull raw.title then
                Error "Missing required field: title"
            elif isNull raw.pages || raw.pages.Length = 0 then
                Error "Missing required field: pages"
            else
                let sampleIds =
                    HashSet<string>(samples |> Array.map (fun e -> e.Id))

                let pageResults =
                    raw.pages
                    |> Array.map (validatePage sampleIds)

                let errors =
                    pageResults
                    |> Array.choose (function
                        | Error e -> Some e
                        | Ok _ -> None)

                if errors.Length > 0 then
                    Error (String.concat "; " errors)
                else
                    let pages =
                        pageResults
                        |> Array.map (function
                            | Ok p -> p
                            | Error _ -> failwith "unreachable")

                    Ok
                        { Title = raw.title
                          Mode = mode
                          Pages = pages
                          SampledImages = samples }
        with ex ->
            Error $"JSON parse error: {ex.Message}"

    let generate
        (httpClient: HttpClient)
        (apiKey: string)
        (mode: NazenazeMode)
        (samples: IrasutoyaIndex.Entry array)
        (question: string)
        (pageCount: int)
        : Async<Result<Story, string>> =
        async {
            try
                let prepSw = System.Diagnostics.Stopwatch.StartNew()
                let catalogText = buildCatalogText samples
                let toolSchema = buildToolSchema samples

                let modeString =
                    match mode with
                    | TrueMode -> "true"
                    | FalseMode -> "false"

                let messages = buildUserMessage mode question pageCount catalogText

                let requestBody =
                    {| model = "claude-sonnet-4-6"
                       max_tokens = 8000
                       system = systemPrompt
                       tool_choice = {| ``type`` = "any" |}
                       tools = [| toolSchema |]
                       messages = messages |}

                let jsonOptions = JsonSerializerOptions(PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower)
                let json = JsonSerializer.Serialize(requestBody, jsonOptions)
                let content = new StringContent(json, Encoding.UTF8, "application/json")

                let request =
                    new HttpRequestMessage(HttpMethod.Post, "https://api.anthropic.com/v1/messages")

                request.Content <- content
                request.Headers.Add("x-api-key", apiKey)
                request.Headers.Add("anthropic-version", "2023-06-01")
                prepSw.Stop()

                let httpSw = System.Diagnostics.Stopwatch.StartNew()
                let! response = httpClient.SendAsync(request) |> Async.AwaitTask
                let! responseBody = response.Content.ReadAsStringAsync() |> Async.AwaitTask
                httpSw.Stop()

                let parseSw = System.Diagnostics.Stopwatch.StartNew()
                let result =
                    if response.IsSuccessStatusCode then
                        let parsed = JsonSerializer.Deserialize<AnthropicResponse>(responseBody)
                        match extractToolUseInput parsed with
                        | Ok rawJson -> parseStory rawJson modeString samples
                        | Error e -> Error e
                    else
                        Error $"Anthropic API call failed ({int response.StatusCode}): {responseBody}"
                parseSw.Stop()

                printfn
                    "[nazenaze-timing] prep=%dms http=%dms parse=%dms reqBytes=%d respBytes=%d"
                    prepSw.ElapsedMilliseconds
                    httpSw.ElapsedMilliseconds
                    parseSw.ElapsedMilliseconds
                    json.Length
                    responseBody.Length

                return result
            with ex ->
                return Error $"Anthropic API call failed: {ex.Message}"
        }
