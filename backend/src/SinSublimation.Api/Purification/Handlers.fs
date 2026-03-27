namespace SinSublimation.Api.Purification

open System.Net.Http
open Microsoft.AspNetCore.Http
open Giraffe
open SinSublimation.Api

module PurificationHandlers =

    let generateHandler: HttpHandler =
        fun next ctx ->
            task {
                let config = ctx.GetService<AppConfig>()
                let httpClientFactory = ctx.GetService<IHttpClientFactory>()
                let httpClient = httpClientFactory.CreateClient("Anthropic")

                let! apiResult =
                    AnthropicClient.callApi httpClient config.AnthropicApiKey
                    |> Async.StartAsTask

                match apiResult with
                | Error err ->
                    ctx.SetStatusCode 502
                    return! json {| error = err |} next ctx
                | Ok rawJson ->
                    match Parser.parse rawJson with
                    | Error parseErr ->
                        ctx.SetStatusCode 502
                        return! json {| error = parseErr; raw = rawJson |} next ctx
                    | Ok response ->
                        return! json response next ctx
            }
