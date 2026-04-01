namespace ChordBattle.Api

open System
open System.Threading.Tasks
open Microsoft.AspNetCore.Builder
open Microsoft.AspNetCore.Http
open Microsoft.AspNetCore.HttpOverrides
open Microsoft.AspNetCore.Server.Kestrel.Core
open Microsoft.Extensions.DependencyInjection
open ChordBattle.Api.Auth
open ChordBattle.Api.Thread
open ChordBattle.Api.Middleware

module Program =

    let private devMode = Config.devMode

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

    [<EntryPoint>]
    let main args =
        let config = Config.load ()
        let repo = Repository.create config.FirestoreProjectId

        let builder = WebApplication.CreateBuilder(args)

        builder.Services.AddHttpClient("Anthropic") |> ignore
        builder.Services.AddSingleton<AppConfig>(config) |> ignore

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

        builder.Services.AddAuthorization() |> ignore

        builder.Services.Configure<ForwardedHeadersOptions>(fun (options: ForwardedHeadersOptions) ->
            options.ForwardedHeaders <- ForwardedHeaders.XForwardedFor ||| ForwardedHeaders.XForwardedProto
            options.KnownNetworks.Clear()
            options.KnownProxies.Clear()
        ) |> ignore

        builder.Services.Configure<KestrelServerOptions>(fun (options: KestrelServerOptions) ->
            options.Limits.MaxRequestBodySize <- 30L * 1024L * 1024L
        ) |> ignore

        let app = builder.Build()

        app.UseForwardedHeaders() |> ignore
        app.UseCors() |> ignore
        app.UseAuthentication() |> ignore
        app.UseAuthorization() |> ignore

        app.UseDefaultFiles() |> ignore
        app.UseStaticFiles() |> ignore

        // Health
        app.MapGet("/health", Func<string>(fun () -> "ok")) |> ignore

        // Auth
        app.MapGet("/auth/google", Func<HttpContext, Task>(AuthHandlers.loginHandler)) |> ignore

        app.MapGet(
            "/auth/callback-complete",
            Func<HttpContext, Task>(AuthHandlers.callbackCompleteHandler config)
        )
        |> ignore

        app.MapPost("/auth/logout", Func<HttpContext, Task>(AuthHandlers.logoutHandler)) |> ignore

        app.MapGet("/auth/me", Func<HttpContext, Task>(requireLogin (AuthHandlers.meHandler devMode)))
        |> ignore

        // Thread API
        app.MapGet("/api/threads", Func<HttpContext, Task>(requireLogin (ThreadHandlers.listThreads repo)))
        |> ignore

        app.MapPost("/api/threads", Func<HttpContext, Task>(requireLogin (withRateLimit (ThreadHandlers.createThread repo))))
        |> ignore

        app.MapGet("/api/threads/{id}", Func<string, HttpContext, Task>(fun id ctx ->
            (requireLogin (ThreadHandlers.getThread repo id)) ctx))
        |> ignore

        app.MapDelete("/api/threads/{id}", Func<string, HttpContext, Task>(fun id ctx ->
            (requireLogin (ThreadHandlers.deleteThread repo id)) ctx))
        |> ignore

        app.MapPut("/api/threads/{id}", Func<string, HttpContext, Task>(fun id ctx ->
            (requireLogin (withRateLimit (ThreadHandlers.saveScore repo id))) ctx))
        |> ignore

        app.MapPut("/api/threads/{id}/settings", Func<string, HttpContext, Task>(fun id ctx ->
            (requireLogin (ThreadHandlers.updateSettings repo id)) ctx))
        |> ignore

        app.MapPost("/api/threads/{id}/review", Func<string, HttpContext, Task>(fun id ctx ->
            (requireLogin (withRateLimit (ThreadHandlers.reviewScore repo config id))) ctx))
        |> ignore

        app.MapPost("/api/threads/{id}/transform", Func<string, HttpContext, Task>(fun id ctx ->
            (requireLogin (withRateLimit (ThreadHandlers.transformChords config id))) ctx))
        |> ignore

        app.MapPost("/api/threads/{id}/import", Func<string, HttpContext, Task>(fun id ctx ->
            (requireLogin (withRateLimit (ThreadHandlers.importChordChart config))) ctx))
        |> ignore

        app.MapGet("/api/threads/{id}/history", Func<string, HttpContext, Task>(fun id ctx ->
            (requireLogin (ThreadHandlers.getHistory repo id)) ctx))
        |> ignore

        app.MapGet("/api/threads/{id}/export", Func<string, HttpContext, Task>(fun id ctx ->
            (ThreadHandlers.exportThread repo id) ctx))
        |> ignore

        app.MapPut("/api/threads/{id}/share", Func<string, HttpContext, Task>(fun id ctx ->
            (requireLogin (ThreadHandlers.shareThread repo id)) ctx))
        |> ignore

        app.MapPost("/api/threads/{id}/comments", Func<string, HttpContext, Task>(fun id ctx ->
            (requireLogin (ThreadHandlers.addComment repo id)) ctx))
        |> ignore

        app.MapGet("/api/threads/{id}/comments", Func<string, HttpContext, Task>(fun id ctx ->
            (requireLogin (ThreadHandlers.listComments repo id)) ctx))
        |> ignore

        app.MapDelete("/api/threads/{id}/comments/{commentId}", Func<string, string, HttpContext, Task>(fun id commentId ctx ->
            (requireLogin (ThreadHandlers.deleteComment repo id commentId)) ctx))
        |> ignore

        app.MapPost("/api/threads/{id}/annotations", Func<string, HttpContext, Task>(fun id ctx ->
            (requireLogin (ThreadHandlers.addAnnotation repo id)) ctx))
        |> ignore

        app.MapGet("/api/threads/{id}/annotations", Func<string, HttpContext, Task>(fun id ctx ->
            (requireLogin (ThreadHandlers.listAnnotations repo id)) ctx))
        |> ignore

        app.MapDelete("/api/threads/{id}/annotations/{aid}", Func<string, string, HttpContext, Task>(fun id aid ctx ->
            (requireLogin (ThreadHandlers.deleteAnnotation repo id aid)) ctx))
        |> ignore

        app.MapPost("/api/threads/{id}/analyze-selection", Func<string, HttpContext, Task>(fun id ctx ->
            (requireLogin (withRateLimit (ThreadHandlers.analyzeSelection repo config id))) ctx))
        |> ignore

        // SPA fallback
        app.MapFallbackToFile("index.html") |> ignore

        app.Run()
        0
