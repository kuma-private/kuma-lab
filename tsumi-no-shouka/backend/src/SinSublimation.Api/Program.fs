namespace SinSublimation.Api

open System
open System.Threading.Tasks
open Microsoft.AspNetCore.Builder
open Microsoft.AspNetCore.Http
open Microsoft.AspNetCore.HttpOverrides
open Microsoft.Extensions.DependencyInjection
open SinSublimation.Api.Auth
open SinSublimation.Api.Purification
open SinSublimation.Api.Middleware

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

        let builder = WebApplication.CreateBuilder(args)

        // Register AppConfig as a singleton
        builder.Services.AddSingleton<AppConfig>(config) |> ignore

        // Configure CORS - allow same origin and configured frontend
        builder.Services.AddCors(fun options ->
            options.AddDefaultPolicy(fun policy ->
                policy
                    .SetIsOriginAllowed(fun _ -> true)
                    .AllowAnyHeader()
                    .AllowAnyMethod()
                    .AllowCredentials()
                |> ignore))
        |> ignore

        // Configure Google OAuth + Cookie auth
        GoogleAuth.configureServices config builder.Services |> ignore

        // Configure HttpClient for Anthropic
        builder.Services.AddHttpClient("Anthropic") |> ignore

        // Add Authorization
        builder.Services.AddAuthorization() |> ignore

        // Handle X-Forwarded-Proto from Cloud Run
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

        // Static files for SPA
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

        app.MapGet("/auth/me", Func<HttpContext, Task>(requireLogin AuthHandlers.meHandler))
        |> ignore

        app.MapPost("/api/generate", Func<HttpContext, Task>(requireLogin (withRateLimit PurificationHandlers.generateHandler)))
        |> ignore

        // SPA fallback
        app.MapFallbackToFile("index.html") |> ignore

        app.Run()
        0
