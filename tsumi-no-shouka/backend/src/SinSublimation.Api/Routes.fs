namespace SinSublimation.Api

open Giraffe
open SinSublimation.Api.Auth
open SinSublimation.Api.Purification
open SinSublimation.Api.Middleware

module Routes =

    let private requireAuth: HttpHandler =
        requiresAuthentication (setStatusCode 401 >=> text "Unauthorized")

    let webApp (config: AppConfig) : HttpHandler =
        choose
            [ GET
              >=> choose
                      [ route "/health" >=> text "ok"
                        route "/auth/google" >=> AuthHandlers.loginHandler
                        route "/auth/callback-complete" >=> AuthHandlers.callbackCompleteHandler config
                        route "/auth/me" >=> requireAuth >=> AuthHandlers.meHandler ]
              POST
              >=> choose
                      [ route "/api/generate"
                        >=> requireAuth
                        >=> RateLimit.rateLimitMiddleware
                        >=> PurificationHandlers.generateHandler
                        route "/auth/logout" >=> AuthHandlers.logoutHandler ]
              setStatusCode 404 >=> text "Not found" ]
