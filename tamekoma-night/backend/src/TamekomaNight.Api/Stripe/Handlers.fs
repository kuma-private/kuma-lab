namespace TamekomaNight.Api.Stripe

open System
open System.IO
open System.Threading.Tasks
open Microsoft.AspNetCore.Http
open TamekomaNight.Api

module Handlers =

    // Phase 9 scaffolding. Real Stripe SDK integration lands in Phase 10.
    // These handlers exist so the frontend upgrade button has a working
    // target and so the webhook URL can be registered in the Stripe dashboard
    // without 404ing.

    /// POST /api/stripe/checkout
    /// Creates a checkout session for the premium upgrade flow.
    /// Returns a stub URL (/upgrade-stub) until the SDK is wired up.
    let checkoutHandler (config: AppConfig) (ctx: HttpContext) : Task =
        task {
            let userInfo = Shared.getUserInfo Config.devMode ctx
            let uid = userInfo.UserId
            if String.IsNullOrEmpty uid || uid = "anonymous" then
                do! Shared.respondJson ctx 401 {| error = "Unauthorized" |}
            else
                let frontend =
                    if String.IsNullOrWhiteSpace config.FrontendUrl then
                        "https://cadenza.fm"
                    else
                        config.FrontendUrl.TrimEnd('/')
                let sessionId = Guid.NewGuid().ToString("N")
                do! Shared.respondJson ctx 200
                        {| url = frontend + "/upgrade-stub?session=" + sessionId
                           sessionId = sessionId
                           stub = true |}
        }

    /// POST /api/stripe/webhook
    /// Receives Stripe events. Phase 9 just logs the payload length and 200s
    /// so the endpoint can be configured in the Stripe dashboard as early as
    /// possible. Signature verification will be added with the real SDK.
    let webhookHandler (_config: AppConfig) (ctx: HttpContext) : Task =
        task {
            try
                use reader = new StreamReader(ctx.Request.Body)
                let! body = reader.ReadToEndAsync()
                Console.WriteLine(sprintf "[stripe] webhook received (%d bytes)" body.Length)
            with ex ->
                Console.WriteLine(sprintf "[stripe] webhook read failed: %s" ex.Message)
            ctx.Response.StatusCode <- 200
            do! ctx.Response.WriteAsJsonAsync({| received = true; stub = true |})
        }
