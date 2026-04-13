namespace DoubutsuQuiz.Api.Nazenaze

open System
open System.Collections.Generic
open System.Diagnostics
open System.Net.Http
open System.Threading.Tasks
open Microsoft.AspNetCore.Http
open Microsoft.Extensions.DependencyInjection
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

                    let samplingInput : SamplePicker.SamplingInput =
                        { Mode = SamplePicker.Cosmos
                          PageCount = pageCount
                          Protagonist = None
                          Setting = None
                          Theme = None
                          ProtagonistImageDataUrl = None }

                    let sampleSw = Stopwatch.StartNew()
                    let samples = SamplePicker.pickSamples index samplingInput
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
                            "[nazenaze-timing] mode=%s pages=%d samples=%d sample=%dms claude=%dms dto=%dms serialize=%dms total=%dms"
                            (match mode with Generator.TrueMode -> "true" | Generator.FalseMode -> "false")
                            pageCount
                            samples.Length
                            sampleSw.ElapsedMilliseconds
                            claudeSw.ElapsedMilliseconds
                            dtoSw.ElapsedMilliseconds
                            serializeSw.ElapsedMilliseconds
                            totalSw.ElapsedMilliseconds
        }
