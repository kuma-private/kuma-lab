namespace CodeShinkou.Api.Analysis

open System
open System.IO
open System.Net.Http
open System.Text.Json
open System.Threading.Tasks
open Microsoft.AspNetCore.Http
open Microsoft.Extensions.DependencyInjection

module AnalysisHandlers =

    [<CLIMutable>]
    type AnalyzeRequest =
        { url: string
          startTime: float
          endTime: float }

    let analyzeHandler (ctx: HttpContext) : Task =
        task {
            let config = ctx.RequestServices.GetRequiredService<CodeShinkou.Api.AppConfig>()
            let httpClientFactory = ctx.RequestServices.GetRequiredService<IHttpClientFactory>()
            let httpClient = httpClientFactory.CreateClient("ChordAnalyzer")
            httpClient.BaseAddress <- Uri(config.AnalyzerUrl)

            let! request = ctx.Request.ReadFromJsonAsync<AnalyzeRequest>()

            if String.IsNullOrWhiteSpace(request.url) then
                ctx.Response.StatusCode <- 400
                do! ctx.Response.WriteAsJsonAsync({| error = "url is required" |})
            elif request.endTime <= request.startTime then
                ctx.Response.StatusCode <- 400
                do! ctx.Response.WriteAsJsonAsync({| error = "endTime must be greater than startTime" |})
            elif request.endTime - request.startTime > 120.0 then
                ctx.Response.StatusCode <- 400
                do! ctx.Response.WriteAsJsonAsync({| error = "Maximum segment length is 120 seconds" |})
            else
                let! audioResult = YtDlpClient.extractAudio request.url request.startTime request.endTime

                match audioResult with
                | Error err ->
                    ctx.Response.StatusCode <- 502
                    do! ctx.Response.WriteAsJsonAsync({| error = err |})
                | Ok audioPath ->
                    try
                        let! analysisResult = ChordClient.analyzeAudio httpClient audioPath

                        match analysisResult with
                        | Error err ->
                            ctx.Response.StatusCode <- 502
                            do! ctx.Response.WriteAsJsonAsync({| error = err |})
                        | Ok jsonStr ->
                            ctx.Response.ContentType <- "application/json"
                            do! ctx.Response.WriteAsync(jsonStr)
                    finally
                        if File.Exists(audioPath) then
                            File.Delete(audioPath)
        }
