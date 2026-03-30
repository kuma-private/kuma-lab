namespace DoubutsuQuiz.Api.Quiz

open System
open System.Net.Http
open System.Threading.Tasks
open Microsoft.AspNetCore.Http
open Microsoft.Extensions.DependencyInjection
open DoubutsuQuiz.Api

module QuizHandlers =

    [<CLIMutable>]
    type QuizRequest =
        { genre: string }

    [<CLIMutable>]
    type VoiceRequest =
        { text: string }

    let generateHandler (ctx: HttpContext) : Task =
        task {
            let config = ctx.RequestServices.GetRequiredService<AppConfig>()
            let httpClientFactory = ctx.RequestServices.GetRequiredService<IHttpClientFactory>()
            let httpClient = httpClientFactory.CreateClient("Anthropic")

            let! body = ctx.Request.ReadFromJsonAsync<QuizRequest>()

            let genre =
                match body.genre with
                | "doubutsu" | "yasai" | "norimono" -> body.genre
                | _ ->
                    ctx.Response.StatusCode <- 400
                    "invalid"

            if genre = "invalid" then
                do! ctx.Response.WriteAsJsonAsync({| error = "Invalid genre. Use 'doubutsu' or 'yasai'." |})
            else
                let! scrapeResult =
                    IrasutoyaScraper.fetchAndShuffle httpClient genre 10
                    |> Async.StartAsTask

                match scrapeResult with
                | Error err ->
                    ctx.Response.StatusCode <- 502
                    do! ctx.Response.WriteAsJsonAsync({| error = $"Scrape failed: {err}" |})
                | Ok scrapedItems ->
                    let names = scrapedItems |> List.map (fun i -> i.Name)

                    let! soundResult =
                        AnthropicClient.callSoundApi httpClient config.AnthropicApiKey names
                        |> Async.StartAsTask

                    match soundResult with
                    | Error err ->
                        ctx.Response.StatusCode <- 502
                        do! ctx.Response.WriteAsJsonAsync({| error = $"Sound API failed: {err}" |})
                    | Ok rawJson ->
                        match Parser.parseSounds rawJson with
                        | Error parseErr ->
                            ctx.Response.StatusCode <- 502
                            do! ctx.Response.WriteAsJsonAsync({| error = $"Parse failed: {parseErr}" |})
                        | Ok soundItems ->
                            let quizItems =
                                scrapedItems
                                |> List.mapi (fun i scraped ->
                                    let sound =
                                        soundItems
                                        |> List.tryItem i
                                        |> Option.defaultValue { name = scraped.Name; sound = "!"; description = "" }

                                    { Name = sound.name
                                      Url = scraped.ImageUrl
                                      Sound = sound.sound
                                      Description = sound.description })

                            do! ctx.Response.WriteAsJsonAsync({| items = quizItems |})
        }

    let voiceHandler (ctx: HttpContext) : Task =
        task {
            let config = ctx.RequestServices.GetRequiredService<AppConfig>()
            let httpClientFactory = ctx.RequestServices.GetRequiredService<IHttpClientFactory>()
            let httpClient = httpClientFactory.CreateClient("Voicevox")

            let! body = ctx.Request.ReadFromJsonAsync<VoiceRequest>()

            if String.IsNullOrEmpty(body.text) then
                ctx.Response.StatusCode <- 400
                do! ctx.Response.WriteAsJsonAsync({| error = "text is required" |})
            elif String.IsNullOrEmpty(config.VoicevoxUrl) then
                ctx.Response.StatusCode <- 503
                do! ctx.Response.WriteAsJsonAsync({| error = "VOICEVOX not configured" |})
            else
                let! result =
                    VoicevoxClient.synthesize httpClient config.VoicevoxUrl body.text
                    |> Async.StartAsTask

                match result with
                | Ok audioBytes ->
                    ctx.Response.ContentType <- "audio/wav"
                    do! ctx.Response.Body.WriteAsync(audioBytes, 0, audioBytes.Length)
                | Error err ->
                    ctx.Response.StatusCode <- 502
                    do! ctx.Response.WriteAsJsonAsync({| error = err |})
        }
