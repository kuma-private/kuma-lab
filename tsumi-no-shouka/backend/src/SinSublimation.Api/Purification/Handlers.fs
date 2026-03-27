namespace SinSublimation.Api.Purification

open System.Net.Http
open System.Threading.Tasks
open Microsoft.AspNetCore.Http
open Microsoft.Extensions.DependencyInjection
open SinSublimation.Api

module PurificationHandlers =

    let generateHandler (ctx: HttpContext) : Task =
        task {
            let config = ctx.RequestServices.GetRequiredService<AppConfig>()
            let httpClientFactory = ctx.RequestServices.GetRequiredService<IHttpClientFactory>()
            let httpClient = httpClientFactory.CreateClient("Anthropic")

            let! apiResult =
                AnthropicClient.callApi httpClient config.AnthropicApiKey
                |> Async.StartAsTask

            match apiResult with
            | Error err ->
                ctx.Response.StatusCode <- 502
                do! ctx.Response.WriteAsJsonAsync({| error = err |})
            | Ok rawJson ->
                match Parser.parse rawJson with
                | Error parseErr ->
                    ctx.Response.StatusCode <- 502
                    do! ctx.Response.WriteAsJsonAsync({| error = parseErr; raw = rawJson |})
                | Ok response ->
                    do! ctx.Response.WriteAsJsonAsync(response)
        }
