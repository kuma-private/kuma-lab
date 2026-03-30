namespace CodeShinkou.Api

open System
open System.Threading.Tasks
open Microsoft.AspNetCore.Builder
open Microsoft.AspNetCore.Http
open Microsoft.Extensions.DependencyInjection
open CodeShinkou.Api.Analysis

module Program =

    [<EntryPoint>]
    let main args =
        let config = Config.load ()

        let builder = WebApplication.CreateBuilder(args)

        builder.Services.AddSingleton<AppConfig>(config) |> ignore

        builder.Services.AddCors(fun options ->
            options.AddDefaultPolicy(fun policy ->
                policy
                    .SetIsOriginAllowed(fun _ -> true)
                    .AllowAnyHeader()
                    .AllowAnyMethod()
                |> ignore))
        |> ignore

        builder.Services.AddHttpClient("ChordAnalyzer") |> ignore

        let app = builder.Build()

        app.UseCors() |> ignore

        // Static files for SPA
        app.UseDefaultFiles() |> ignore
        app.UseStaticFiles() |> ignore

        // Routes
        app.MapGet("/health", Func<string>(fun () -> "ok")) |> ignore

        app.MapPost("/api/analyze", Func<HttpContext, Task>(AnalysisHandlers.analyzeHandler))
        |> ignore

        // SPA fallback
        app.MapFallbackToFile("index.html") |> ignore

        app.Run()
        0
