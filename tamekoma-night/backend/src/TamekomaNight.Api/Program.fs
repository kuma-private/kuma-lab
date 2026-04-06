namespace TamekomaNight.Api

open System
open System.Threading.Tasks
open Microsoft.AspNetCore.Builder
open Microsoft.AspNetCore.Http
open Microsoft.AspNetCore.HttpOverrides
open Microsoft.AspNetCore.Server.Kestrel.Core
open Microsoft.Extensions.DependencyInjection
open TamekomaNight.Api.Auth
open TamekomaNight.Api.Thread
open TamekomaNight.Api.Middleware

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

    // --- Route registration helpers ---

    let private mapRoute (app: WebApplication) (method: string) (pattern: string) (handler: HttpContext -> Task) =
        match method with
        | "GET" -> app.MapGet(pattern, Func<HttpContext, Task>(handler))
        | "POST" -> app.MapPost(pattern, Func<HttpContext, Task>(handler))
        | "PUT" -> app.MapPut(pattern, Func<HttpContext, Task>(handler))
        | "DELETE" -> app.MapDelete(pattern, Func<HttpContext, Task>(handler))
        | _ -> failwith $"Unsupported HTTP method: {method}"
        |> ignore

    let private mapRouteWithId (app: WebApplication) (method: string) (pattern: string) (handler: string -> HttpContext -> Task) =
        let wrapper = Func<string, HttpContext, Task>(fun id ctx -> handler id ctx)
        match method with
        | "GET" -> app.MapGet(pattern, wrapper)
        | "POST" -> app.MapPost(pattern, wrapper)
        | "PUT" -> app.MapPut(pattern, wrapper)
        | "DELETE" -> app.MapDelete(pattern, wrapper)
        | _ -> failwith $"Unsupported HTTP method: {method}"
        |> ignore

    let private mapRouteWith2Ids (app: WebApplication) (method: string) (pattern: string) (handler: string -> string -> HttpContext -> Task) =
        let wrapper = Func<string, string, HttpContext, Task>(fun id1 id2 ctx -> handler id1 id2 ctx)
        match method with
        | "DELETE" -> app.MapDelete(pattern, wrapper)
        | _ -> failwith $"Unsupported HTTP method: {method}"
        |> ignore

    /// Wrap handler with login requirement
    let private auth handler = requireLogin handler

    /// Wrap handler with login + rate limit
    let private authRL handler = requireLogin (withRateLimit handler)

    /// Wrap a handler taking (id, ctx) into (ctx) by extracting the id route param
    let private withId (handler: string -> HttpContext -> Task) (id: string) (ctx: HttpContext) =
        auth (handler id) ctx

    let private withIdRL (handler: string -> HttpContext -> Task) (id: string) (ctx: HttpContext) =
        authRL (handler id) ctx

    let private with2Ids (handler: string -> string -> HttpContext -> Task) (id1: string) (id2: string) (ctx: HttpContext) =
        auth (handler id1 id2) ctx

    [<EntryPoint>]
    let main args =
        let config = Config.load ()
        let repo = Repository.create config.FirestoreProjectId
        let songRepo = TamekomaNight.Api.Song.Repository.create config.FirestoreProjectId

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

        // Auth routes
        mapRoute app "GET" "/auth/google" AuthHandlers.loginHandler
        mapRoute app "GET" "/auth/callback-complete" (AuthHandlers.callbackCompleteHandler config)
        mapRoute app "POST" "/auth/logout" AuthHandlers.logoutHandler
        mapRoute app "GET" "/auth/me" (auth (AuthHandlers.meHandler devMode))

        // Thread API - collection routes
        mapRoute app "GET" "/api/threads" (auth (ThreadHandlers.listThreads repo))
        mapRoute app "POST" "/api/threads" (authRL (ThreadHandlers.createThread repo))

        // Thread API - single thread routes
        mapRouteWithId app "GET" "/api/threads/{id}" (withId (ThreadHandlers.getThread repo))
        mapRouteWithId app "DELETE" "/api/threads/{id}" (withId (ThreadHandlers.deleteThread repo))
        mapRouteWithId app "PUT" "/api/threads/{id}" (withIdRL (ThreadHandlers.saveScore repo))
        mapRouteWithId app "PUT" "/api/threads/{id}/settings" (withId (ThreadHandlers.updateSettings repo))
        mapRouteWithId app "PUT" "/api/threads/{id}/share" (withId (ThreadHandlers.shareThread repo))

        // Thread API - AI routes
        mapRouteWithId app "POST" "/api/threads/{id}/review" (withIdRL (ThreadHandlers.reviewScore repo config))
        mapRouteWithId app "POST" "/api/threads/{id}/transform" (withIdRL (ThreadHandlers.transformChords config))
        mapRouteWithId app "POST" "/api/threads/{id}/import" (fun id ctx -> authRL (ThreadHandlers.importChordChart config) ctx)
        mapRouteWithId app "POST" "/api/threads/{id}/analyze-selection" (withIdRL (ThreadHandlers.analyzeSelection repo config))

        // Thread API - history & export
        mapRouteWithId app "GET" "/api/threads/{id}/history" (withId (ThreadHandlers.getHistory repo))
        mapRouteWithId app "GET" "/api/threads/{id}/export" (withId (ThreadHandlers.exportThread repo))

        // Thread API - comments
        mapRouteWithId app "POST" "/api/threads/{id}/comments" (withId (ThreadHandlers.addComment repo))
        mapRouteWithId app "GET" "/api/threads/{id}/comments" (withId (ThreadHandlers.listComments repo))
        mapRouteWith2Ids app "DELETE" "/api/threads/{id}/comments/{commentId}" (with2Ids (ThreadHandlers.deleteComment repo))

        // Thread API - annotations
        mapRouteWithId app "POST" "/api/threads/{id}/annotations" (withId (ThreadHandlers.addAnnotation repo))
        mapRouteWithId app "GET" "/api/threads/{id}/annotations" (withId (ThreadHandlers.listAnnotations repo))
        mapRouteWith2Ids app "DELETE" "/api/threads/{id}/annotations/{aid}" (with2Ids (ThreadHandlers.deleteAnnotation repo))

        // Song API
        mapRoute app "GET" "/api/songs" (auth (TamekomaNight.Api.Song.SongHandlers.listSongs songRepo))
        mapRoute app "POST" "/api/songs" (authRL (TamekomaNight.Api.Song.SongHandlers.createSong songRepo))
        mapRouteWithId app "GET" "/api/songs/{id}" (withId (TamekomaNight.Api.Song.SongHandlers.getSong songRepo))
        mapRouteWithId app "PUT" "/api/songs/{id}" (withId (TamekomaNight.Api.Song.SongHandlers.updateSong songRepo))
        mapRouteWithId app "DELETE" "/api/songs/{id}" (withId (TamekomaNight.Api.Song.SongHandlers.deleteSong songRepo))

        // SPA fallback
        app.MapFallbackToFile("index.html") |> ignore

        app.Run()
        0
