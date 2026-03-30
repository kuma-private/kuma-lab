namespace ChordBattle.Api

open System
open System.Threading.Tasks
open Microsoft.AspNetCore.Builder
open Microsoft.AspNetCore.Http
open Microsoft.AspNetCore.HttpOverrides
open Microsoft.Extensions.DependencyInjection
open ChordBattle.Api.Auth
open ChordBattle.Api.Thread
open ChordBattle.Api.Middleware

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

    [<EntryPoint>]
    let main args =
        let config = Config.load ()
        let repo = Repository.create config.FirestoreProjectId

        let builder = WebApplication.CreateBuilder(args)

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

        app.MapPost("/api/threads/{id}/join", Func<string, HttpContext, Task>(fun id ctx ->
            (requireLogin (ThreadHandlers.joinThread repo id)) ctx))
        |> ignore

        app.MapPost("/api/threads/{id}/turn", Func<string, HttpContext, Task>(fun id ctx ->
            (requireLogin (withRateLimit (ThreadHandlers.executeTurn repo id))) ctx))
        |> ignore

        app.MapPost("/api/threads/{id}/propose-finish", Func<string, HttpContext, Task>(fun id ctx ->
            (requireLogin (ThreadHandlers.proposeFinish repo id)) ctx))
        |> ignore

        app.MapPost("/api/threads/{id}/accept-finish", Func<string, HttpContext, Task>(fun id ctx ->
            (requireLogin (ThreadHandlers.acceptFinish repo id)) ctx))
        |> ignore

        app.MapPost("/api/threads/{id}/reject-finish", Func<string, HttpContext, Task>(fun id ctx ->
            (requireLogin (ThreadHandlers.rejectFinish repo id)) ctx))
        |> ignore

        app.MapGet("/api/threads/{id}/export", Func<string, HttpContext, Task>(fun id ctx ->
            (ThreadHandlers.exportThread repo id) ctx))
        |> ignore

        // SPA fallback
        app.MapFallbackToFile("index.html") |> ignore

        app.Run()
        0
