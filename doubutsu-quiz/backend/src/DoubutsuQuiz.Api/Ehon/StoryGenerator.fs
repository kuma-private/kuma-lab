namespace DoubutsuQuiz.Api.Ehon

open System
open System.Collections.Generic
open System.Net.Http
open System.Text
open System.Text.Json
open System.Text.Json.Serialization
open DoubutsuQuiz.Api.Quiz

module StoryGenerator =

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
        """あなたは日本の名作絵本作家です。
目標は『はらぺこあおむし』『ねないこだれだ』『ママがおばけになっちゃった！』のような、シンプルで奥深く、5 歳の子が読んだあと「もう一回」とせがむような絵本を 1 冊書くことです。

【絵本の鉄則】

1. 言葉は極限までシンプル: 5 歳が一人で声に出せる、ひらがな 95% 以上、わかちがき必須
2. 1 ページ 1 文 (10〜14 文字) を目安、長くて 2 文
3. 反復・リズム・対比のいずれかを必ず使うこと:
   - 反復: 同じ言い回しを 3-4 回繰り返す（はらぺこあおむし型: 「げつようび、〜を ひとつ たべました」を変奏）
   - リズム: 短い言葉のテンポで進む（ねないこだれだ型: 「だれだ だれだ」と問いかけ）
   - 対比: 静かな日常 → 大きな出来事（ママがおばけ型: 平穏 → 喪失 → 受容）
4. 説明しない、見せる: 「かなしい」と書かない。状況とイラストで察してもらう
5. 結末は答えを与えない: 道徳的な教訓や説明文でしめくくらない
6. 最終ページの 1 つ前に「世界が反転する瞬間」を入れる
7. 最終ページは静かに、余白を大きく、読者に「？」または「！」を残す

【禁忌】

- 「みんな なかよく」「だいすき だよ」「がんばろうね」等の説明的・道徳的な言い回し
- 起承転結を律儀に書こうとしない（1 ページに 1 場面、それで十分）
- カタカナの擬音語は OK だが、英語・複雑な漢字・大人語彙は禁止
- 「おしまい」「めでたし」のような締めの言葉

【画像の使い方】

- 画像は物語を「説明」ではなく「拡張」する（テキストで言わないことを画像で見せる）
- 反復構造の場合、同じ画像を別ページで再利用してリズムを作っても良い
- 最終ページは画像 1-2 枚 + 短い 1 文で静けさを作る
- 1 ページの要素数は 1〜5 個 (詰め込みすぎない)

【出力形式】

generate_ehon_from_samples ツールを必ず使い、bookCore (物語の核) と pages (各ページ) の両方を出力してください。bookCore は読者には見せませんが、これを最初に決めることで物語の整合性が保たれます。"""

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

    let private buildUserMessageChaos (pageCount: int) (catalogText: string) =
        let content =
            sprintf
                "**【厳守】このえほんはちょうど %d ページにしてください。それ以上でもそれ以下でもいけません。**\n\n\
                 これから渡す 20 枚の絵を眺めて、**バラバラな素材から不思議な 1 本の話**を %d ページで紡いでください。\n\n\
                 ・**18-20 枚を目標**に使ってください。ただし無理に詰め込まず、物語の整合性を最優先に。\n\
                 ・**同じ画像を 2 回以上出すのも歓迎**です（はらぺこあおむし型の反復構造として使えます）。\n\
                 ・全部の絵を使い切ることより、シンプルで奥深い 1 つの物語になることが大切です。\n\n\
                 主人公・舞台・テーマは絵から自由に想像してください。\n\
                 名作絵本のように、説明せず、見せて、最終ページで読者にそっと「？」を残してください。\n\n\
                 %s\n\n\
                 最後にもう一度確認します: pages 配列の長さは正確に %d でなければなりません。"
                pageCount
                pageCount
                catalogText
                pageCount

        [| {| role = "user"; content = content |} |]

    let private buildUserMessageCosmos
        (pageCount: int)
        (protagonist: string option)
        (setting: string option)
        (theme: string option)
        (catalogText: string) =

        let optionLine label value =
            match value with
            | Some v when not (String.IsNullOrWhiteSpace v) -> sprintf "- %s: %s\n" label v
            | _ -> sprintf "- %s: （指定なし）\n" label

        let stimulus =
            [ optionLine "主人公" protagonist
              optionLine "舞台" setting
              optionLine "テーマ" theme ]
            |> String.concat ""

        let content =
            sprintf
                "**【厳守】このえほんはちょうど %d ページにしてください。それ以上でもそれ以下でもいけません。**\n\n\
                 **【反復の意味上昇】**\n\
                 反復構造を使う場合、**同じ言い回しを繰り返せるのは最大 3 回まで**。4 ページ目以降では必ず「変化」「発見」「違和感」を入れてください。ただ繰り返すだけの話は禁止です。はらぺこあおむしが月曜→火曜→水曜と食べ物が増えていくように、反復は少しずつ変化させて意味を上昇させます。\n\n\
                 **【主人公の呼称】**\n\
                 ユーザーが指定した主人公名 (protagonist) に修飾語が含まれる場合 (例: \"ちいさなうさぎ\" の \"ちいさな\")、その修飾語を**絶対に省略しないでください**。毎ページで主人公を呼ぶときは指定された表記を可能な限りそのまま使ってください。\n\n\
                 これから渡す 20 枚の絵から **好きなだけ選んで** %d ページの絵本を作ってください。\n\
                 5〜15 枚を目安に、物語に必要なものだけ使ってください（同じ絵を 2 回以上出すのも OK）。\n\n\
                 以下は「物語の核」ではなく、**作家への一言の刺激**として渡します。\n\
                 これに縛られず、自分の中で名作絵本の種を見つけてください。\n\
                 %s\n\
                 **主人公の名前から、はらぺこあおむしのような『日常の小さな繰り返し』を見つけて、最終ページで予想外に転換させてください。**\n\
                 説明せず、見せて、読者にそっと「？」または「！」を残してください。\n\n\
                 %s\n\n\
                 最後にもう一度確認します: pages 配列の長さは正確に %d でなければなりません。"
                pageCount
                pageCount
                stimulus
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
                            "description": "絵本のタイトル（ひらがな主体、短く）"
                        },
                        "bookCore": {
                            "type": "object",
                            "description": "物語の核となる構造（フロントエンドには表示しないが、これを最初に決めることで整合性を保つ）",
                            "properties": {
                                "primalTheme": {
                                    "type": "string",
                                    "description": "物語の根源テーマを 1 単語で。例: たべる / ねむる / かわる / なくす / みつける / かくれる / さがす"
                                },
                                "structure": {
                                    "type": "string",
                                    "enum": ["repetition", "transformation", "reversal", "discovery"],
                                    "description": "物語の構造パターン"
                                },
                                "centralImage": {
                                    "type": "string",
                                    "description": "主人公が繰り返す行動や状態を 1 文で"
                                },
                                "twistMoment": {
                                    "type": "string",
                                    "description": "最終ページ手前で世界が反転する瞬間を 1 文で"
                                },
                                "lingeringQuestion": {
                                    "type": "string",
                                    "description": "読者の心に残す問い（声に出さない、暗示で）"
                                }
                            },
                            "required": ["primalTheme", "structure", "centralImage", "twistMoment", "lingeringQuestion"]
                        },
                        "pages": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "pageNumber": {"type": "integer", "minimum": 1},
                                    "text": {
                                        "type": "string",
                                        "description": "そのページの本文（1〜2文、子供向け平仮名多め、10〜14文字目安）"
                                    },
                                    "elements": {
                                        "type": "array",
                                        "minItems": 1,
                                        "maxItems": 7,
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
                    "required": ["title", "bookCore", "pages"]
                }"""
                (JsonSerializer.Serialize enumValues)

        let schemaElement = JsonDocument.Parse(schemaJson).RootElement

        {| name = "generate_ehon_from_samples"
           description = "Generate a picture book story using the supplied image catalog"
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

    let private validateChaosCoverage
        (samples: IrasutoyaIndex.Entry array)
        (story: Story)
        : Result<Story, string> =
        let expected = samples |> Array.map (fun e -> e.Id) |> Set.ofArray

        let actual =
            story.Pages
            |> Array.collect (fun p -> p.Elements |> Array.map (fun el -> el.ImageId))
            |> Set.ofArray

        let missing = Set.difference expected actual |> Set.toList

        if List.isEmpty missing then
            Ok story
        elif missing.Length < 3 then
            // 1〜2 枚の取りこぼしは物語の整合性を優先し、何もしない。
            printfn "[chaos-coverage-warn] %d unused imageIds (kept as-is to preserve story integrity)" missing.Length
            Ok story
        else
            // 3 枚以上取りこぼしている場合のみ、最後のページに小さなカメオとして自動追加。
            let lastIdx = story.Pages.Length - 1
            let lastPage = story.Pages.[lastIdx]
            let extras =
                missing
                |> List.mapi (fun i id ->
                    let col = i % 5
                    let row = i / 5
                    { ImageId = id
                      X = 0.05 + (double col) * 0.18
                      Y = 0.04 + (double row) * 0.16
                      Width = 0.14
                      Height = 0.16
                      Rotation = -8.0 + (double (i * 7 % 25))
                      FlipHorizontal = false
                      ZIndex = 8 })
                |> List.toArray

            let mergedElements = Array.append lastPage.Elements extras
            let updatedLast = { lastPage with Elements = mergedElements }
            let updatedPages = Array.copy story.Pages
            updatedPages.[lastIdx] <- updatedLast

            printfn "[chaos-coverage] auto-injected %d missing imageIds on last page" missing.Length
            Ok { story with Pages = updatedPages }

    let private simplicityCheck (pages: StoryPage array) : unit =
        let badPhrases = [|
            "だいすき"; "なかよく"; "がんばろう"; "みんな"; "なかよし";
            "おしまい"; "めでたし"; "ともだちって"; "やさしい";
            "ありがとう"; "ごめんなさい"; "うれしい"; "かなしい"
        |]
        for page in pages do
            let text = page.Text
            for phrase in badPhrases do
                if text.Contains(phrase) then
                    eprintfn "[simplicity-warn] page %d contains explanatory phrase: %s" page.PageNumber phrase
            if text.Length > 40 then
                eprintfn "[simplicity-warn] page %d text too long: %d chars" page.PageNumber text.Length

    let generate
        (httpClient: HttpClient)
        (apiKey: string)
        (mode: SamplePicker.Mode)
        (samples: IrasutoyaIndex.Entry array)
        (pageCount: int)
        (protagonist: string option)
        (setting: string option)
        (theme: string option)
        : Async<Result<Story, string>> =
        async {
            try
                let prepSw = System.Diagnostics.Stopwatch.StartNew()
                let catalogText = buildCatalogText samples
                let toolSchema = buildToolSchema samples

                let modeString =
                    match mode with
                    | SamplePicker.Chaos -> "chaos"
                    | SamplePicker.Cosmos -> "cosmos"

                let messages =
                    match mode with
                    | SamplePicker.Chaos ->
                        buildUserMessageChaos pageCount catalogText
                    | SamplePicker.Cosmos ->
                        buildUserMessageCosmos pageCount protagonist setting theme catalogText

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
                        | Ok rawJson ->
                            match parseStory rawJson modeString samples with
                            | Error e -> Error e
                            | Ok story ->
                                let coverageResult =
                                    match mode with
                                    | SamplePicker.Chaos -> validateChaosCoverage samples story
                                    | SamplePicker.Cosmos -> Ok story
                                match coverageResult with
                                | Ok finalStory ->
                                    simplicityCheck finalStory.Pages
                                    Ok finalStory
                                | Error e -> Error e
                        | Error e -> Error e
                    else
                        Error $"Anthropic API call failed ({int response.StatusCode}): {responseBody}"
                parseSw.Stop()

                printfn
                    "[story-timing] prep=%dms http=%dms parse=%dms reqBytes=%d respBytes=%d"
                    prepSw.ElapsedMilliseconds
                    httpSw.ElapsedMilliseconds
                    parseSw.ElapsedMilliseconds
                    json.Length
                    responseBody.Length

                return result
            with ex ->
                return Error $"Anthropic API call failed: {ex.Message}"
        }
