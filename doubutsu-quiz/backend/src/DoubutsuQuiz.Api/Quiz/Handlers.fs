namespace DoubutsuQuiz.Api.Quiz

open System.Net.Http
open System.Threading.Tasks
open Microsoft.AspNetCore.Http
open Microsoft.Extensions.DependencyInjection
open DoubutsuQuiz.Api

module QuizHandlers =

    [<CLIMutable>]
    type QuizRequest =
        { genre: string }

    let generateHandler (ctx: HttpContext) : Task =
        task {
            let config = ctx.RequestServices.GetRequiredService<AppConfig>()
            let httpClientFactory = ctx.RequestServices.GetRequiredService<IHttpClientFactory>()
            let httpClient = httpClientFactory.CreateClient("Anthropic")

            let! body = ctx.Request.ReadFromJsonAsync<QuizRequest>()

            let genre =
                match body.genre with
                | "doubutsu" | "yasai" -> body.genre
                | _ ->
                    ctx.Response.StatusCode <- 400
                    "invalid"

            if genre = "invalid" then
                do! ctx.Response.WriteAsJsonAsync({| error = "Invalid genre. Use 'doubutsu' or 'yasai'." |})
            else
                // Step 1: Scrape irasutoya for images
                let! scrapeResult =
                    IrasutoyaScraper.fetchAndShuffle httpClient genre 10
                    |> Async.StartAsTask

                match scrapeResult with
                | Error err ->
                    ctx.Response.StatusCode <- 502
                    do! ctx.Response.WriteAsJsonAsync({| error = $"Scrape failed: {err}" |})
                | Ok scrapedItems ->
                    // Step 2: Ask Claude for sound text
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
                            // Merge scraped images with sound data
                            let quizItems =
                                scrapedItems
                                |> List.mapi (fun i scraped ->
                                    let sound =
                                        soundItems
                                        |> List.tryItem i
                                        |> Option.defaultValue { name = scraped.Name; sound = "!" }

                                    { Name = sound.name
                                      Url = scraped.ImageUrl
                                      Sound = sound.sound })

                            do! ctx.Response.WriteAsJsonAsync({| items = quizItems |})
        }
