namespace DoubutsuQuiz.Api.Ehon

open System
open System.Collections.Generic
open System.Diagnostics
open System.Net.Http
open System.Text
open System.Text.Json
open System.Threading.Tasks
open Microsoft.AspNetCore.Http
open Microsoft.Extensions.DependencyInjection
open DoubutsuQuiz.Api
open DoubutsuQuiz.Api.Quiz

module EhonHandlers =

    [<CLIMutable>]
    type EhonRequest =
        { mode: string
          pageCount: Nullable<int>
          protagonist: string
          setting: string
          theme: string
          protagonistImageDataUrl: string }

    [<CLIMutable>]
    type VoiceRequest = { text: string }

    let private parseMode (raw: string) : Result<SamplePicker.Mode, string> =
        if isNull raw then Error "mode is required"
        else
            match raw.Trim().ToLowerInvariant() with
            | "chaos" -> Ok SamplePicker.Chaos
            | "cosmos" -> Ok SamplePicker.Cosmos
            | other -> Error (sprintf "mode must be 'chaos' or 'cosmos' (got '%s')" other)

    let private clampPageCount (value: Nullable<int>) : int =
        let raw = if value.HasValue then value.Value else 8
        if raw < 1 then 1
        elif raw > 10 then 10
        else raw

    let private optString (s: string) : string option =
        if String.IsNullOrWhiteSpace s then None else Some s

    let private elementToDto
        (entriesById: Dictionary<string, IrasutoyaIndex.Entry>)
        (element: StoryGenerator.ElementPlacement) =
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
        (page: StoryGenerator.StoryPage) =
        {| pageNumber = page.PageNumber
           text = page.Text
           elements = page.Elements |> Array.map (elementToDto entriesById) |}

    let generateHandler (ctx: HttpContext) : Task =
        task {
            let config = ctx.RequestServices.GetRequiredService<AppConfig>()
            let httpClientFactory = ctx.RequestServices.GetRequiredService<IHttpClientFactory>()
            let httpClient = httpClientFactory.CreateClient("Anthropic")
            let index = ctx.RequestServices.GetRequiredService<IrasutoyaIndex.Index>()

            let! body = ctx.Request.ReadFromJsonAsync<EhonRequest>()

            match parseMode body.mode with
            | Error err ->
                ctx.Response.StatusCode <- 400
                do! ctx.Response.WriteAsJsonAsync({| error = err |})
            | Ok mode ->
                let totalSw = Stopwatch.StartNew()
                let pageCount = clampPageCount body.pageCount

                let samplingInput : SamplePicker.SamplingInput =
                    { Mode = mode
                      PageCount = pageCount
                      Protagonist = optString body.protagonist
                      Setting = optString body.setting
                      Theme = optString body.theme
                      ProtagonistImageDataUrl = optString body.protagonistImageDataUrl }

                let sampleSw = Stopwatch.StartNew()
                let samples = SamplePicker.pickSamples index samplingInput
                sampleSw.Stop()

                let claudeSw = Stopwatch.StartNew()
                let! storyResult =
                    StoryGenerator.generate
                        httpClient
                        config.AnthropicApiKey
                        mode
                        samples
                        pageCount
                        samplingInput.Protagonist
                        samplingInput.Setting
                        samplingInput.Theme
                    |> Async.StartAsTask
                claudeSw.Stop()

                match storyResult with
                | Error err ->
                    ctx.Response.StatusCode <- 502
                    do! ctx.Response.WriteAsJsonAsync({| error = sprintf "Story generation failed: %s" err |})
                | Ok story ->
                    let dtoSw = Stopwatch.StartNew()
                    let entriesById = Dictionary<string, IrasutoyaIndex.Entry>()
                    for e in samples do
                        entriesById.[e.Id] <- e

                    let payload =
                        {| title = story.Title
                           mode = story.Mode
                           aspectRatio = "3:4"
                           pages = story.Pages |> Array.map (pageToDto entriesById) |}
                    dtoSw.Stop()

                    let serializeSw = Stopwatch.StartNew()
                    do! ctx.Response.WriteAsJsonAsync(payload)
                    serializeSw.Stop()
                    totalSw.Stop()

                    printfn
                        "[ehon-timing] mode=%s pages=%d samples=%d sample=%dms claude=%dms dto=%dms serialize=%dms total=%dms"
                        (match mode with SamplePicker.Chaos -> "chaos" | SamplePicker.Cosmos -> "cosmos")
                        pageCount
                        samples.Length
                        sampleSw.ElapsedMilliseconds
                        claudeSw.ElapsedMilliseconds
                        dtoSw.ElapsedMilliseconds
                        serializeSw.ElapsedMilliseconds
                        totalSw.ElapsedMilliseconds
        }

    /// Phase A: Pseudo-streaming. Runs the existing (non-streaming) Claude call,
    /// then writes pages one-by-one as SSE events. Lays groundwork for a future
    /// real-streaming implementation without changing existing behavior.
    let generateStreamHandler (ctx: HttpContext) : Task =
        task {
            let config = ctx.RequestServices.GetRequiredService<AppConfig>()
            let httpClientFactory = ctx.RequestServices.GetRequiredService<IHttpClientFactory>()
            let httpClient = httpClientFactory.CreateClient("Anthropic")
            let index = ctx.RequestServices.GetRequiredService<IrasutoyaIndex.Index>()

            let! body = ctx.Request.ReadFromJsonAsync<EhonRequest>()

            // Prepare SSE response early so errors can also flow as SSE events.
            ctx.Response.ContentType <- "text/event-stream"
            ctx.Response.Headers.["Cache-Control"] <- Microsoft.Extensions.Primitives.StringValues("no-cache")
            ctx.Response.Headers.["X-Accel-Buffering"] <- Microsoft.Extensions.Primitives.StringValues("no")

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
                let totalSw = Stopwatch.StartNew()
                let pageCount = clampPageCount body.pageCount

                let samplingInput : SamplePicker.SamplingInput =
                    { Mode = mode
                      PageCount = pageCount
                      Protagonist = optString body.protagonist
                      Setting = optString body.setting
                      Theme = optString body.theme
                      ProtagonistImageDataUrl = optString body.protagonistImageDataUrl }

                let sampleSw = Stopwatch.StartNew()
                let samples = SamplePicker.pickSamples index samplingInput
                sampleSw.Stop()

                let claudeSw = Stopwatch.StartNew()
                let! storyResult =
                    StoryGenerator.generate
                        httpClient
                        config.AnthropicApiKey
                        mode
                        samples
                        pageCount
                        samplingInput.Protagonist
                        samplingInput.Setting
                        samplingInput.Theme
                    |> Async.StartAsTask
                claudeSw.Stop()

                match storyResult with
                | Error err ->
                    do! writeEvent "error" {| error = sprintf "Story generation failed: %s" err |}
                | Ok story ->
                    let entriesById = Dictionary<string, IrasutoyaIndex.Entry>()
                    for e in samples do
                        entriesById.[e.Id] <- e

                    let modeStr =
                        match mode with
                        | SamplePicker.Chaos -> "chaos"
                        | SamplePicker.Cosmos -> "cosmos"

                    // 1. title event
                    do! writeEvent "title"
                            {| title = story.Title
                               mode = modeStr
                               aspectRatio = "3:4"
                               totalPages = story.Pages.Length |}

                    // 2. page events (one at a time, with flush)
                    for page in story.Pages do
                        let pageDto = pageToDto entriesById page
                        do! writeEvent "page" pageDto

                    // 3. done event
                    do! writeEvent "done" {||}

                    totalSw.Stop()
                    printfn
                        "[ehon-timing-sse] mode=%s pages=%d samples=%d sample=%dms claude=%dms total=%dms"
                        modeStr
                        pageCount
                        samples.Length
                        sampleSw.ElapsedMilliseconds
                        claudeSw.ElapsedMilliseconds
                        totalSw.ElapsedMilliseconds
        }

    let voiceHandler (ctx: HttpContext) : Task =
        task {
            let config = ctx.RequestServices.GetRequiredService<AppConfig>()
            let factory = ctx.RequestServices.GetRequiredService<IHttpClientFactory>()
            let httpClient = factory.CreateClient("Voicevox")

            let! body = ctx.Request.ReadFromJsonAsync<VoiceRequest>()
            if isNull body.text || String.IsNullOrWhiteSpace body.text then
                ctx.Response.StatusCode <- 400
                do! ctx.Response.WriteAsJsonAsync({| error = "text is required" |})
            else
                let! result =
                    VoicevoxClient.synthesize httpClient config.VoicevoxUrl body.text
                    |> Async.StartAsTask
                match result with
                | Error e ->
                    ctx.Response.StatusCode <- 502
                    do! ctx.Response.WriteAsJsonAsync({| error = e |})
                | Ok bytes ->
                    ctx.Response.ContentType <- "audio/wav"
                    do! ctx.Response.Body.WriteAsync(bytes, 0, bytes.Length)
        }
