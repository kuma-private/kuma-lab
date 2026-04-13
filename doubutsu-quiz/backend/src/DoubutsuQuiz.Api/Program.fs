namespace DoubutsuQuiz.Api

open System
open System.IO
open System.Threading.Tasks
open Microsoft.AspNetCore.Builder
open Microsoft.AspNetCore.Http
open Microsoft.AspNetCore.HttpOverrides
open Microsoft.Extensions.DependencyInjection
open DoubutsuQuiz.Api.Auth
open DoubutsuQuiz.Api.Quiz
open DoubutsuQuiz.Api.Ehon
open DoubutsuQuiz.Api.Nazenaze
open DoubutsuQuiz.Api.Middleware

module Program =

    let private devMode =
        match Environment.GetEnvironmentVariable("DEV_MODE") with
        | "true" | "1" -> true
        | _ -> false

    let private requireLogin (innerHandler: HttpContext -> Task) (ctx: HttpContext) : Task =
        task {
            if devMode || (ctx.User <> null && ctx.User.Identity <> null && ctx.User.Identity.IsAuthenticated) then
                do! innerHandler ctx
            else
                ctx.Response.StatusCode <- 401
                do! ctx.Response.WriteAsJsonAsync({| error = "Unauthorized" |})
        }

    let private withRateLimit (innerHandler: HttpContext -> Task) (ctx: HttpContext) : Task =
        task {
            let userId = RateLimit.getUserId ctx

            match RateLimit.tryConsume userId with
            | Ok() ->
                do! innerHandler ctx
            | Error retryAfter ->
                ctx.Response.StatusCode <- 429
                do! ctx.Response.WriteAsJsonAsync({| error = "Rate limit exceeded"; retryAfterSeconds = retryAfter |})
        }

    let private resolveIrasutoyaIndexPath () : string =
        let envPath = Environment.GetEnvironmentVariable("IRASUTOYA_INDEX_PATH")
        if not (String.IsNullOrWhiteSpace envPath) then envPath
        else
            let candidates =
                [ Path.Combine(Directory.GetCurrentDirectory(), "data", "irasutoya_index.json")
                  Path.Combine(Directory.GetCurrentDirectory(), "..", "..", "data", "irasutoya_index.json")
                  Path.Combine(AppContext.BaseDirectory, "data", "irasutoya_index.json")
                  Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "data", "irasutoya_index.json") ]
            match candidates |> List.tryFind File.Exists with
            | Some p -> Path.GetFullPath p
            | None ->
                failwithf
                    "irasutoya_index.json not found. Searched: %s"
                    (String.concat "; " (candidates |> List.map Path.GetFullPath))

    [<EntryPoint>]
    let main args =
        let config = Config.load ()

        let indexPath = resolveIrasutoyaIndexPath ()
        printfn "[irasutoya] loading index from: %s" indexPath
        let irasutoyaIndex = IrasutoyaIndex.load indexPath
        printfn
            "[irasutoya] loaded %d entries, %d categories in %d ms"
            irasutoyaIndex.TotalEntries
            irasutoyaIndex.ByCategory.Count
            irasutoyaIndex.LoadMs

        let builder = WebApplication.CreateBuilder(args)

        builder.Services.AddSingleton<AppConfig>(config) |> ignore
        builder.Services.AddSingleton<IrasutoyaIndex.Index>(irasutoyaIndex) |> ignore

        builder.Services.AddCors(fun options ->
            options.AddDefaultPolicy(fun policy ->
                policy
                    .SetIsOriginAllowed(fun _ -> true)
                    .AllowAnyHeader()
                    .AllowAnyMethod()
                    .AllowCredentials()
                |> ignore))
        |> ignore

        GoogleAuth.configureServices config builder.Services |> ignore

        builder.Services.AddHttpClient("Anthropic") |> ignore
        builder.Services.AddHttpClient("Voicevox") |> ignore

        builder.Services.AddAuthorization() |> ignore

        builder.Services.Configure<ForwardedHeadersOptions>(fun (options: ForwardedHeadersOptions) ->
            options.ForwardedHeaders <- ForwardedHeaders.XForwardedFor ||| ForwardedHeaders.XForwardedProto
            options.KnownNetworks.Clear()
            options.KnownProxies.Clear()
        ) |> ignore

        let app = builder.Build()

        app.UseForwardedHeaders() |> ignore
        app.UseCors() |> ignore
        app.UseAuthentication() |> ignore
        app.UseAuthorization() |> ignore

        app.UseDefaultFiles() |> ignore
        app.UseStaticFiles() |> ignore

        // Routes
        app.MapGet("/health", Func<string>(fun () -> "ok")) |> ignore

        app.MapGet("/auth/google", Func<HttpContext, Task>(AuthHandlers.loginHandler)) |> ignore

        app.MapGet(
            "/auth/callback-complete",
            Func<HttpContext, Task>(AuthHandlers.callbackCompleteHandler config)
        )
        |> ignore

        app.MapPost("/auth/logout", Func<HttpContext, Task>(AuthHandlers.logoutHandler)) |> ignore

        let meHandler =
            if devMode then
                fun (ctx: HttpContext) ->
                    task {
                        do! ctx.Response.WriteAsJsonAsync({| name = "dev"; email = "dev@local"; sub = "dev" |})
                    } :> Task
            else
                AuthHandlers.meHandler

        app.MapGet("/auth/me", Func<HttpContext, Task>(requireLogin meHandler))
        |> ignore

        app.MapPost("/api/quiz/images", Func<HttpContext, Task>(requireLogin (withRateLimit QuizHandlers.generateHandler)))
        |> ignore

        app.MapPost("/api/ehon/generate", Func<HttpContext, Task>(requireLogin (withRateLimit EhonHandlers.generateHandler)))
        |> ignore

        app.MapPost("/api/ehon/generate-stream", Func<HttpContext, Task>(requireLogin (withRateLimit EhonHandlers.generateStreamHandler)))
        |> ignore

        app.MapPost("/api/ehon/voice", Func<HttpContext, Task>(requireLogin (withRateLimit EhonHandlers.voiceHandler)))
        |> ignore

        app.MapPost("/api/nazenaze/generate", Func<HttpContext, Task>(requireLogin (withRateLimit NazenazeHandlers.generateHandler)))
        |> ignore

        app.MapPost("/api/nazenaze/generate-stream", Func<HttpContext, Task>(requireLogin (withRateLimit NazenazeHandlers.generateStreamHandler)))
        |> ignore

        app.MapPost("/api/voice", Func<HttpContext, Task>(requireLogin QuizHandlers.voiceHandler))
        |> ignore

        app.MapGet(
            "/api/irasutoya/stats",
            Func<HttpContext, Task>(requireLogin (withRateLimit IrasutoyaHandlers.statsHandler)))
        |> ignore

        app.MapGet(
            "/api/irasutoya/categories",
            Func<HttpContext, Task>(requireLogin (withRateLimit IrasutoyaHandlers.categoriesHandler)))
        |> ignore

        app.MapGet(
            "/api/irasutoya/search",
            Func<HttpContext, Task>(requireLogin (withRateLimit IrasutoyaHandlers.searchHandler)))
        |> ignore

        app.MapGet(
            "/api/irasutoya/by-category",
            Func<HttpContext, Task>(requireLogin (withRateLimit IrasutoyaHandlers.byCategoryHandler)))
        |> ignore

        app.MapGet(
            "/api/irasutoya/random",
            Func<HttpContext, Task>(requireLogin (withRateLimit IrasutoyaHandlers.randomHandler)))
        |> ignore

        app.MapGet(
            "/api/irasutoya/entry/{id}",
            Func<HttpContext, string, Task>(fun ctx id ->
                requireLogin (withRateLimit (IrasutoyaHandlers.entryHandler id)) ctx))
        |> ignore

        app.MapFallbackToFile("index.html") |> ignore

        app.Run()
        0
