namespace ChordBattle.Api.Auth

open Microsoft.AspNetCore.Authentication
open Microsoft.AspNetCore.Authentication.Cookies
open Microsoft.AspNetCore.Authentication.Google
open Microsoft.Extensions.DependencyInjection
open ChordBattle.Api

module GoogleAuth =

    let configureServices (config: AppConfig) (services: IServiceCollection) =
        services
            .AddAuthentication(fun options ->
                options.DefaultScheme <- CookieAuthenticationDefaults.AuthenticationScheme
                options.DefaultChallengeScheme <- GoogleDefaults.AuthenticationScheme)
            .AddCookie(fun options ->
                options.Cookie.HttpOnly <- true
                options.Cookie.SameSite <- Microsoft.AspNetCore.Http.SameSiteMode.Lax
                options.LoginPath <- "/auth/google"
                options.Events.OnRedirectToLogin <- fun ctx ->
                    ctx.Response.StatusCode <- 401
                    System.Threading.Tasks.Task.CompletedTask)
            .AddGoogle(fun options ->
                options.ClientId <- config.GoogleClientId
                options.ClientSecret <- config.GoogleClientSecret
                options.CallbackPath <- "/auth/callback"
                options.SaveTokens <- true)
        |> ignore

        services
