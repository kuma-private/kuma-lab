namespace DoubutsuQuiz.Api.Nazenaze

open System
open System.Collections.Generic
open System.Diagnostics
open System.Net.Http
open System.Text
open System.Text.Json
open System.Threading.Tasks
open Microsoft.AspNetCore.Http
open Microsoft.Extensions.DependencyInjection
open Microsoft.Extensions.Primitives
open DoubutsuQuiz.Api
open DoubutsuQuiz.Api.Quiz
open DoubutsuQuiz.Api.Ehon

module NazenazeHandlers =

    [<CLIMutable>]
    type NazenazeRequest =
        { mode: string
          question: string
          pageCount: Nullable<int> }

    let private parseMode (raw: string) : Result<Generator.NazenazeMode, string> =
        if isNull raw then Error "mode is required"
        else
            match raw.Trim().ToLowerInvariant() with
            | "true" -> Ok Generator.TrueMode
            | "false" -> Ok Generator.FalseMode
            | other -> Error (sprintf "mode must be 'true' or 'false' (got '%s')" other)

    let private clampPageCount (value: Nullable<int>) : int =
        let raw = if value.HasValue then value.Value else 5
        if raw < 3 then 3
        elif raw > 8 then 8
        else raw

    let private elementToDto
        (entriesById: Dictionary<string, IrasutoyaIndex.Entry>)
        (element: Generator.ElementPlacement) =
        let entry = entriesById.[element.ImageId]
        let imageUrl =
            if isNull entry.ImageUrls || entry.ImageUrls.Length = 0 then ""
            else entry.ImageUrls.[0]

        {| imageId = element.ImageId
           image =
            {| title = entry.Title
               imageUrl = imageUrl
               pageUrl = entry.PageUrl |}
           x = element.X
           y = element.Y
           width = element.Width
           height = element.Height
           rotation = element.Rotation
           flipHorizontal = element.FlipHorizontal
           zIndex = element.ZIndex |}

    let private pageToDto
        (entriesById: Dictionary<string, IrasutoyaIndex.Entry>)
        (page: Generator.StoryPage) =
        {| pageNumber = page.PageNumber
           text = page.Text
           elements = page.Elements |> Array.map (elementToDto entriesById) |}

    let generateHandler (ctx: HttpContext) : Task =
        task {
            let config = ctx.RequestServices.GetRequiredService<AppConfig>()
            let httpClientFactory = ctx.RequestServices.GetRequiredService<IHttpClientFactory>()
            let httpClient = httpClientFactory.CreateClient("Anthropic")
            let index = ctx.RequestServices.GetRequiredService<IrasutoyaIndex.Index>()

            let! body = ctx.Request.ReadFromJsonAsync<NazenazeRequest>()

            match parseMode body.mode with
            | Error err ->
                ctx.Response.StatusCode <- 400
                do! ctx.Response.WriteAsJsonAsync({| error = err |})
            | Ok mode ->
                if isNull body.question || String.IsNullOrWhiteSpace body.question then
                    ctx.Response.StatusCode <- 400
                    do! ctx.Response.WriteAsJsonAsync({| error = "question is required" |})
                else
                    let totalSw = Stopwatch.StartNew()
                    let pageCount = clampPageCount body.pageCount

                    let keywordSw = Stopwatch.StartNew()
                    let! keywordResult =
                        KeywordExtractor.extract httpClient config.AnthropicApiKey body.question
                        |> Async.StartAsTask
                    keywordSw.Stop()

                    let keywords =
                        match keywordResult with
                        | Ok ks -> ks
                        | Error err ->
                            printfn "[nazenaze-keyword-fail] %s" err
                            [||]
                    printfn "[nazenaze-keywords] %dms [%s]" keywordSw.ElapsedMilliseconds (String.concat ", " keywords)

                    let sampleSw = Stopwatch.StartNew()
                    let samples = SamplePicker.pickCosmosWithKeywords index keywords
                    sampleSw.Stop()

                    let claudeSw = Stopwatch.StartNew()
                    let! storyResult =
                        Generator.generate
                            httpClient
                            config.AnthropicApiKey
                            mode
                            samples
                            body.question
                            pageCount
                        |> Async.StartAsTask
                    claudeSw.Stop()

                    match storyResult with
                    | Error err ->
                        ctx.Response.StatusCode <- 502
                        do! ctx.Response.WriteAsJsonAsync({| error = sprintf "Story generation failed: %s" err |})
                    | Ok story ->
                        let modeStr =
                            match mode with
                            | Generator.TrueMode -> "true"
                            | Generator.FalseMode -> "false"

                        // Vertex AI Imagen 背景生成 (失敗してもストーリーは返す)
                        // Claude が生成した imagePrompt を使う (なければ title にフォールバック)
                        let scenePrompt =
                            if String.IsNullOrWhiteSpace story.ImagePrompt then story.Title
                            else story.ImagePrompt
                        let imagenSw = Stopwatch.StartNew()
                        let! bgResult =
                            ImageGen.generateBackground httpClient modeStr scenePrompt
                            |> Async.StartAsTask
                        imagenSw.Stop()

                        let backgroundImageDataUrl =
                            match bgResult with
                            | Ok url -> url
                            | Error err ->
                                printfn "[nazenaze-imagen-fail] %s" err
                                ""

                        let dtoSw = Stopwatch.StartNew()
                        let entriesById = Dictionary<string, IrasutoyaIndex.Entry>()
                        for e in samples do
                            entriesById.[e.Id] <- e

                        let payload =
                            {| title = story.Title
                               mode = story.Mode
                               aspectRatio = "3:4"
                               backgroundImageDataUrl = backgroundImageDataUrl
                               pages = story.Pages |> Array.map (pageToDto entriesById) |}
                        dtoSw.Stop()

                        let serializeSw = Stopwatch.StartNew()
                        do! ctx.Response.WriteAsJsonAsync(payload)
                        serializeSw.Stop()
                        totalSw.Stop()

                        printfn
                            "[nazenaze-timing] mode=%s pages=%d samples=%d sample=%dms claude=%dms imagen=%dms dto=%dms serialize=%dms total=%dms"
                            modeStr
                            pageCount
                            samples.Length
                            sampleSw.ElapsedMilliseconds
                            claudeSw.ElapsedMilliseconds
                            imagenSw.ElapsedMilliseconds
                            dtoSw.ElapsedMilliseconds
                            serializeSw.ElapsedMilliseconds
                            totalSw.ElapsedMilliseconds
        }

    /// Phase B+ real streaming. Uses Claude stream=true, launches Imagen in
    /// parallel as soon as the title/imagePrompt can be parsed from the
    /// partial JSON, then flushes title/page/background/done SSE events.
    let generateStreamHandler (ctx: HttpContext) : Task =
        task {
            let config = ctx.RequestServices.GetRequiredService<AppConfig>()
            let httpClientFactory = ctx.RequestServices.GetRequiredService<IHttpClientFactory>()
            let httpClient = httpClientFactory.CreateClient("Anthropic")
            let index = ctx.RequestServices.GetRequiredService<IrasutoyaIndex.Index>()

            let! body = ctx.Request.ReadFromJsonAsync<NazenazeRequest>()

            ctx.Response.ContentType <- "text/event-stream"
            ctx.Response.Headers.["Cache-Control"] <- StringValues("no-cache")
            ctx.Response.Headers.["X-Accel-Buffering"] <- StringValues("no")

            let writeEvent (eventName: string) (payload: obj) : Task =
                task {
                    let json = JsonSerializer.Serialize(payload)
                    let sb = StringBuilder()
                    sb.Append("event: ").Append(eventName).Append('\n') |> ignore
                    sb.Append("data: ").Append(json).Append("\n\n") |> ignore
                    let bytes = Encoding.UTF8.GetBytes(sb.ToString())
                    do! ctx.Response.Body.WriteAsync(bytes, 0, bytes.Length)
                    do! ctx.Response.Body.FlushAsync()
                }

            match parseMode body.mode with
            | Error err ->
                do! writeEvent "error" {| error = err |}
            | Ok mode ->
                if isNull body.question || String.IsNullOrWhiteSpace body.question then
                    do! writeEvent "error" {| error = "question is required" |}
                else
                    let totalSw = Stopwatch.StartNew()
                    let pageCount = clampPageCount body.pageCount

                    let keywordSw = Stopwatch.StartNew()
                    let! keywordResult =
                        KeywordExtractor.extract httpClient config.AnthropicApiKey body.question
                        |> Async.StartAsTask
                    keywordSw.Stop()

                    let keywords =
                        match keywordResult with
                        | Ok ks -> ks
                        | Error err ->
                            printfn "[nazenaze-keyword-fail] %s" err
                            [||]
                    printfn "[nazenaze-keywords] %dms [%s]" keywordSw.ElapsedMilliseconds (String.concat ", " keywords)

                    let sampleSw = Stopwatch.StartNew()
                    let samples = SamplePicker.pickCosmosWithKeywords index keywords
                    sampleSw.Stop()

                    let claudeSw = Stopwatch.StartNew()
                    let! streamResult =
                        Streaming.generate
                            httpClient
                            config.AnthropicApiKey
                            mode
                            samples
                            body.question
                            pageCount
                    claudeSw.Stop()

                    match streamResult.Story with
                    | Error err ->
                        do! writeEvent "error" {| error = sprintf "Story generation failed: %s" err |}
                    | Ok story ->
                        let modeStr =
                            match mode with
                            | Generator.TrueMode -> "true"
                            | Generator.FalseMode -> "false"

                        let entriesById = Dictionary<string, IrasutoyaIndex.Entry>()
                        for e in samples do
                            entriesById.[e.Id] <- e

                        // 1. title event — viewer can launch now.
                        do! writeEvent "title"
                                {| title = story.Title
                                   mode = modeStr
                                   aspectRatio = "3:4"
                                   totalPages = story.Pages.Length |}

                        // 2. page events (one at a time, with flush)
                        for page in story.Pages do
                            let pageDto = pageToDto entriesById page
                            do! writeEvent "page" pageDto

                        // 3. Wait for Imagen (already running in parallel) and emit background.
                        let imagenSw = Stopwatch.StartNew()
                        let! backgroundUrl =
                            task {
                                match streamResult.ImagenTask with
                                | Some t ->
                                    try
                                        let! result = t
                                        match result with
                                        | Ok url -> return url
                                        | Error err ->
                                            printfn "[nazenaze-imagen-fail] %s" err
                                            return ""
                                    with ex ->
                                        printfn "[nazenaze-imagen-exn] %s" ex.Message
                                        return ""
                                | None ->
                                    // Fallback: Imagen was never kicked off (no title parsed
                                    // during streaming). Run it now synchronously so the
                                    // background still renders.
                                    let scenePrompt =
                                        if String.IsNullOrWhiteSpace story.ImagePrompt then story.Title
                                        else story.ImagePrompt
                                    let! result =
                                        ImageGen.generateBackground httpClient modeStr scenePrompt
                                        |> Async.StartAsTask
                                    match result with
                                    | Ok url -> return url
                                    | Error err ->
                                        printfn "[nazenaze-imagen-fail-fallback] %s" err
                                        return ""
                            }
                        imagenSw.Stop()

                        do! writeEvent "background" {| backgroundImageDataUrl = backgroundUrl |}

                        // 4. done event
                        do! writeEvent "done" {||}

                        totalSw.Stop()
                        let titleAt =
                            match streamResult.TitleFoundAtMs with
                            | Some ms -> ms
                            | None -> -1L
                        printfn
                            "[nazenaze-stream-timing] mode=%s pages=%d sample=%dms claude=%dms titleAt=%dms imagenWait=%dms total=%dms"
                            modeStr
                            pageCount
                            sampleSw.ElapsedMilliseconds
                            claudeSw.ElapsedMilliseconds
                            titleAt
                            imagenSw.ElapsedMilliseconds
                            totalSw.ElapsedMilliseconds
        }
