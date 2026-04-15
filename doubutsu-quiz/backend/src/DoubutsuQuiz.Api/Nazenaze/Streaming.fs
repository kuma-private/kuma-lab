namespace DoubutsuQuiz.Api.Nazenaze

open System
open System.Collections.Generic
open System.Diagnostics
open System.IO
open System.Net.Http
open System.Text
open System.Text.Json
open System.Text.RegularExpressions
open System.Threading.Tasks
open DoubutsuQuiz.Api.Quiz
open DoubutsuQuiz.Api.Ehon

/// Phase B+ real streaming for nazenaze generation:
/// - Calls Anthropic /v1/messages with stream=true
/// - Accumulates input_json_delta chunks as Claude emits the tool_use input
/// - Starts Imagen background generation in parallel as soon as the "title" (or
///   "imagePrompt") field can be extracted via regex from the partial JSON
/// - After the Claude stream finishes, parses the full tool input JSON once
///   (reusing Generator.Story validation logic) and the caller then emits
///   title / page events from the parsed Story.
module Streaming =

    type StreamResult =
        { Story: Result<Generator.Story, string>
          /// Imagen task already in flight (may be None if title wasn't parsed).
          ImagenTask: Task<Result<string, string>> option
          ClaudeMs: int64
          TitleFoundAtMs: int64 option }

    /// Parse one Anthropic SSE event JSON line (data: ...) and, if it's a
    /// content_block_delta with an input_json_delta, append the partial_json
    /// fragment to the running buffer.
    let private tryAppendPartialJson (data: string) (buffer: StringBuilder) : bool =
        try
            use doc = JsonDocument.Parse(data)
            let root = doc.RootElement
            match root.TryGetProperty("type") with
            | true, typeElem ->
                let t = typeElem.GetString()
                if t = "content_block_delta" then
                    match root.TryGetProperty("delta") with
                    | true, deltaElem ->
                        match deltaElem.TryGetProperty("type") with
                        | true, dtype when dtype.GetString() = "input_json_delta" ->
                            match deltaElem.TryGetProperty("partial_json") with
                            | true, pj ->
                                let s = pj.GetString()
                                if not (isNull s) then
                                    buffer.Append(s) |> ignore
                                    true
                                else false
                            | _ -> false
                        | _ -> false
                    | _ -> false
                else false
            | _ -> false
        with _ ->
            false

    /// Try to extract the title string from the partial JSON buffer using a
    /// simple regex. The buffer may be incomplete; we only care if a full
    /// "title": "..." field has been emitted by Claude.
    let private titleRegex =
        Regex("\"title\"\\s*:\\s*\"((?:[^\"\\\\]|\\\\.)*)\"", RegexOptions.Compiled)

    let private imagePromptRegex =
        Regex("\"imagePrompt\"\\s*:\\s*\"((?:[^\"\\\\]|\\\\.)*)\"", RegexOptions.Compiled)

    let private tryFindField (rx: Regex) (buffer: StringBuilder) : string option =
        let s = buffer.ToString()
        let m = rx.Match(s)
        if m.Success then
            // Unescape common JSON escapes (\", \\, \n, \t). Enough for our
            // simple prompt strings — we don't need a full JSON parser here.
            let raw = m.Groups.[1].Value
            let unescaped =
                raw
                    .Replace("\\\"", "\"")
                    .Replace("\\\\", "\\")
                    .Replace("\\n", "\n")
                    .Replace("\\t", "\t")
            Some unescaped
        else
            None

    /// Run Claude with stream=true. Accumulate the tool_use input JSON. As
    /// soon as a "title" or "imagePrompt" is seen, start Imagen in parallel.
    /// After the stream ends, parse the full JSON and return the Story result.
    let generate
        (httpClient: HttpClient)
        (apiKey: string)
        (mode: Generator.NazenazeMode)
        (samples: IrasutoyaIndex.Entry array)
        (question: string)
        (pageCount: int)
        : Task<StreamResult> =
        task {
            let totalSw = Stopwatch.StartNew()

            let modeStr =
                match mode with
                | Generator.TrueMode -> "true"
                | Generator.FalseMode -> "false"

            // Build the same request body as Generator.generate, but with stream=true.
            // We reuse Generator's helper modules by constructing the payload inline —
            // keeping Generator.fs untouched preserves its public API.
            let catalogLines = StringBuilder()
            catalogLines.AppendLine("## 画像カタログ（20 枚）") |> ignore
            for e in samples do
                let categories =
                    if isNull e.Categories || e.Categories.Length = 0 then ""
                    else String.concat ", " e.Categories
                let description =
                    if String.IsNullOrWhiteSpace e.Description then "" else e.Description
                catalogLines.AppendLine(sprintf "- id: %s" e.Id) |> ignore
                catalogLines.AppendLine(sprintf "  title: %s" (if isNull e.Title then "" else e.Title)) |> ignore
                if description.Length > 0 then
                    catalogLines.AppendLine(sprintf "  description: %s" description) |> ignore
                if categories.Length > 0 then
                    catalogLines.AppendLine(sprintf "  categories: %s" categories) |> ignore
            let catalogText = catalogLines.ToString()

            let modeBlock =
                match mode with
                | Generator.TrueMode ->
                    "**【モード: 本当】**\n\
                     科学的に正しい説明を 5 歳児にもわかる言葉にやさしく置き換えてください。\n\
                     嘘や誇張は禁止。専門用語は全て身近なたとえに置き換える。"
                | Generator.FalseMode ->
                    "**【モード: 嘘】**\n\
                     もっともらしいウソ解説を真顔で展開してください。\n\
                     無茶苦茶ではなく「子供がありそうと思う」レベルのかわいいウソ。\n\
                     道徳的な締めは禁止。「ほんとうかな？」で締めるのは OK。"

            let userContent =
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

            let systemPrompt =
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
generate_nazenaze_story ツールを必ず使い、title / imagePrompt / pages を出力してください。

【imagePrompt について — 重要】
あなたは title と pages を考えると同時に、その紙芝居の **背景シーン**を English で 1 文だけ書きます。
これは AI 画像生成 (Imagen) に渡され、子供向け絵本の水彩風背景として描かれます。

ルール:
- **English で書く** (Imagen は英語が得意)
- **シーン (環境) のみ**: characters, people, text は絶対に含めない
- **質問の核心**を視覚化する: 例「テレビはなぜ映るの？」→ "A cozy living room with a glowing television set on a wooden shelf"
- 例「雨はなぜ降るの？」→ "A grey cloudy sky over a quiet field with grass"
- 例「虹はどうしてできるの？」→ "A pastel rainbow arching over rolling green hills after rain"
- **1 文、20-30 単語以内**
- **soft pastel watercolor children's picture book style** という style は ImageGen 側で自動付与されるので書かなくてよい"""

            let enumValues = samples |> Array.map (fun e -> e.Id)
            let schemaJson =
                sprintf
                    """{
                        "type": "object",
                        "properties": {
                            "imagePrompt": {
                                "type": "string",
                                "description": "AI image gen (Imagen) prompt for the background scene. English, 1 sentence, scene/environment only, no characters/people/text. Style modifiers are added automatically. **Emit this field first** so image generation can start while the story text is still being written."
                            },
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
                                        "text": {"type": "string"},
                                        "elements": {
                                            "type": "array",
                                            "minItems": 1,
                                            "maxItems": 5,
                                            "items": {
                                                "type": "object",
                                                "properties": {
                                                    "imageId": {"type": "string", "enum": %s},
                                                    "x": {"type": "number", "minimum": 0.0, "maximum": 1.0},
                                                    "y": {"type": "number", "minimum": 0.0, "maximum": 1.0},
                                                    "width": {"type": "number", "minimum": 0.08, "maximum": 1.0},
                                                    "height": {"type": "number", "minimum": 0.10, "maximum": 1.0},
                                                    "rotation": {"type": "number", "minimum": -180.0, "maximum": 180.0},
                                                    "flipHorizontal": {"type": "boolean"},
                                                    "zIndex": {"type": "integer", "minimum": 0, "maximum": 9}
                                                },
                                                "required": ["imageId","x","y","width","height","rotation","flipHorizontal","zIndex"]
                                            }
                                        }
                                    },
                                    "required": ["pageNumber","text","elements"]
                                }
                            }
                        },
                        "required": ["title","imagePrompt","pages"]
                    }"""
                    (JsonSerializer.Serialize enumValues)

            let schemaElement = JsonDocument.Parse(schemaJson).RootElement

            let toolSchema =
                {| name = "generate_nazenaze_story"
                   description = "Generate a why-explanation kamishibai story using the supplied image catalog"
                   input_schema = schemaElement |}
                :> obj

            let messages = [| {| role = "user"; content = userContent |} |]

            let requestBody =
                {| model = "claude-sonnet-4-6"
                   max_tokens = 8000
                   system = systemPrompt
                   tool_choice = {| ``type`` = "any" |}
                   tools = [| toolSchema |]
                   messages = messages
                   stream = true |}

            let jsonOptions = JsonSerializerOptions(PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower)
            let json = JsonSerializer.Serialize(requestBody, jsonOptions)

            use request = new HttpRequestMessage(HttpMethod.Post, "https://api.anthropic.com/v1/messages")
            request.Content <- new StringContent(json, Encoding.UTF8, "application/json")
            request.Headers.Add("x-api-key", apiKey)
            request.Headers.Add("anthropic-version", "2023-06-01")
            request.Headers.Accept.Add(
                System.Net.Http.Headers.MediaTypeWithQualityHeaderValue("text/event-stream"))

            try
                let! response =
                    httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead)

                if not response.IsSuccessStatusCode then
                    let! body = response.Content.ReadAsStringAsync()
                    totalSw.Stop()
                    return
                        { Story = Error (sprintf "Anthropic API call failed (%d): %s" (int response.StatusCode) body)
                          ImagenTask = None
                          ClaudeMs = totalSw.ElapsedMilliseconds
                          TitleFoundAtMs = None }
                else
                    let! stream = response.Content.ReadAsStreamAsync()
                    use reader = new StreamReader(stream)

                    let buffer = StringBuilder()
                    let mutable imagenTask : Task<Result<string, string>> option = None
                    let mutable titleFoundAt : int64 option = None
                    let mutable finished = false

                    while not finished do
                        let! line = reader.ReadLineAsync()
                        if isNull line then
                            finished <- true
                        elif line.StartsWith("data: ") then
                            let data = line.Substring(6)
                            if data = "[DONE]" then
                                finished <- true
                            else
                                let appended = tryAppendPartialJson data buffer
                                if appended && imagenTask.IsNone then
                                    // Only kick off Imagen once we have an English imagePrompt.
                                    // The Japanese title is never a good Imagen input — it
                                    // causes text hallucinations in the rendered image. If
                                    // imagePrompt never arrives during streaming, the handler
                                    // falls back to a synchronous call after parse.
                                    match tryFindField imagePromptRegex buffer with
                                    | Some s when not (String.IsNullOrWhiteSpace s) ->
                                        titleFoundAt <- Some totalSw.ElapsedMilliseconds
                                        printfn
                                            "[nazenaze-stream] imagen kickoff at %dms scene=%s"
                                            totalSw.ElapsedMilliseconds
                                            (if s.Length > 60 then s.Substring(0, 60) + "..." else s)
                                        let task =
                                            ImageGen.generateBackground httpClient modeStr s
                                            |> Async.StartAsTask
                                        imagenTask <- Some task
                                    | _ -> ()
                        // else: ignore "event: ..." lines and blank separators

                    totalSw.Stop()

                    let fullJson = buffer.ToString()
                    if String.IsNullOrWhiteSpace fullJson then
                        return
                            { Story = Error "Claude stream produced empty tool input"
                              ImagenTask = imagenTask
                              ClaudeMs = totalSw.ElapsedMilliseconds
                              TitleFoundAtMs = titleFoundAt }
                    else
                        // Reuse Generator's parseStory by routing the tool JSON through
                        // a small helper. Generator.parseStory is private, so we
                        // replicate the validation here using the shared record types.
                        try
                            let options = JsonSerializerOptions(PropertyNameCaseInsensitive = true)
                            let raw = JsonSerializer.Deserialize<Generator.RawStory>(fullJson, options)

                            if isNull (box raw) then
                                return
                                    { Story = Error "Deserialized to null"
                                      ImagenTask = imagenTask
                                      ClaudeMs = totalSw.ElapsedMilliseconds
                                      TitleFoundAtMs = titleFoundAt }
                            elif isNull raw.title then
                                return
                                    { Story = Error "Missing required field: title"
                                      ImagenTask = imagenTask
                                      ClaudeMs = totalSw.ElapsedMilliseconds
                                      TitleFoundAtMs = titleFoundAt }
                            elif isNull raw.pages || raw.pages.Length = 0 then
                                return
                                    { Story = Error "Missing required field: pages"
                                      ImagenTask = imagenTask
                                      ClaudeMs = totalSw.ElapsedMilliseconds
                                      TitleFoundAtMs = titleFoundAt }
                            else
                                let sampleIds = HashSet<string>(samples |> Array.map (fun e -> e.Id))

                                // Validate each raw page inline. Mirrors Generator.validatePage.
                                let validateElement (pageNumber: int) (raw: Generator.RawElement) =
                                    if isNull raw.imageId then
                                        Error (sprintf "Page %d: element imageId is null" pageNumber)
                                    elif not (sampleIds.Contains raw.imageId) then
                                        Error (sprintf "Page %d: invalid imageId '%s'" pageNumber raw.imageId)
                                    elif raw.width < 0.08 || raw.height < 0.10 then
                                        Error
                                            (sprintf
                                                "Page %d: element '%s' too small (w=%f h=%f)"
                                                pageNumber raw.imageId raw.width raw.height)
                                    elif raw.x < 0.0 || raw.y < 0.0
                                         || raw.x + raw.width > 1.0001 || raw.y + raw.height > 1.0001 then
                                        Error
                                            (sprintf
                                                "Page %d: element '%s' out of bounds"
                                                pageNumber raw.imageId)
                                    else
                                        Ok
                                            ({ ImageId = raw.imageId
                                               X = raw.x
                                               Y = raw.y
                                               Width = raw.width
                                               Height = raw.height
                                               Rotation = raw.rotation
                                               FlipHorizontal = raw.flipHorizontal
                                               ZIndex = raw.zIndex }
                                             : Generator.ElementPlacement)

                                let validatePage (rp: Generator.RawPage) =
                                    if isNull rp.elements || rp.elements.Length = 0 then
                                        Error (sprintf "Page %d: elements missing" rp.pageNumber)
                                    else
                                        let results =
                                            rp.elements |> Array.map (validateElement rp.pageNumber)
                                        let errors =
                                            results
                                            |> Array.choose (function Error e -> Some e | Ok _ -> None)
                                        if errors.Length > 0 then
                                            Error (String.concat "; " errors)
                                        else
                                            let elements =
                                                results
                                                |> Array.map (function
                                                    | Ok e -> e
                                                    | Error _ -> failwith "unreachable")
                                            Ok
                                                ({ PageNumber = rp.pageNumber
                                                   Text = (if isNull rp.text then "" else rp.text)
                                                   Elements = elements }
                                                 : Generator.StoryPage)

                                let pageResults = raw.pages |> Array.map validatePage
                                let errors =
                                    pageResults
                                    |> Array.choose (function Error e -> Some e | Ok _ -> None)
                                if errors.Length > 0 then
                                    return
                                        { Story = Error (String.concat "; " errors)
                                          ImagenTask = imagenTask
                                          ClaudeMs = totalSw.ElapsedMilliseconds
                                          TitleFoundAtMs = titleFoundAt }
                                else
                                    let pages =
                                        pageResults
                                        |> Array.map (function
                                            | Ok p -> p
                                            | Error _ -> failwith "unreachable")
                                    let story : Generator.Story =
                                        { Title = raw.title
                                          Mode = modeStr
                                          ImagePrompt =
                                            (if isNull raw.imagePrompt then "" else raw.imagePrompt)
                                          Pages = pages
                                          SampledImages = samples }
                                    return
                                        { Story = Ok story
                                          ImagenTask = imagenTask
                                          ClaudeMs = totalSw.ElapsedMilliseconds
                                          TitleFoundAtMs = titleFoundAt }
                        with ex ->
                            return
                                { Story = Error (sprintf "JSON parse error: %s" ex.Message)
                                  ImagenTask = imagenTask
                                  ClaudeMs = totalSw.ElapsedMilliseconds
                                  TitleFoundAtMs = titleFoundAt }
            with ex ->
                totalSw.Stop()
                return
                    { Story = Error (sprintf "Anthropic streaming call failed: %s" ex.Message)
                      ImagenTask = None
                      ClaudeMs = totalSw.ElapsedMilliseconds
                      TitleFoundAtMs = None }
        }
