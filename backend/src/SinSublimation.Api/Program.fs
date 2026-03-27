namespace SinSublimation.Api

open System
open System.Text
open Microsoft.AspNetCore.Builder
open Microsoft.AspNetCore.Hosting
open Microsoft.Extensions.DependencyInjection
open Microsoft.Extensions.Hosting
open Microsoft.IdentityModel.Tokens
open Giraffe
open SinSublimation.Api.Auth

module Program =

    [<EntryPoint>]
    let main args =
        let config = Config.load ()

        let builder = WebApplication.CreateBuilder(args)

        // Register AppConfig as a singleton
        builder.Services.AddSingleton<AppConfig>(config) |> ignore

        // Configure CORS
        builder.Services.AddCors(fun options ->
            options.AddDefaultPolicy(fun policy ->
                policy
                    .WithOrigins(config.FrontendUrl)
                    .AllowAnyHeader()
                    .AllowAnyMethod()
                    .AllowCredentials()
                |> ignore))
        |> ignore

        // Configure Google OAuth + Cookie auth
        GoogleAuth.configureServices config builder.Services |> ignore

        // Configure HttpClient for Anthropic
        builder.Services.AddHttpClient("Anthropic") |> ignore

        // Add Giraffe
        builder.Services.AddGiraffe() |> ignore

        let app = builder.Build()

        app.UseCors() |> ignore
        app.UseAuthentication() |> ignore
        app.UseAuthorization() |> ignore
        app.UseGiraffe(Routes.webApp config)

        app.Run()
        0
