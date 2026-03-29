namespace DoubutsuQuiz.Api

open System

[<CLIMutable>]
type AppConfig =
    { AnthropicApiKey: string
      GoogleClientId: string
      GoogleClientSecret: string
      JwtSigningKey: string
      FrontendUrl: string
      VoicevoxUrl: string }

module Config =

    let load () : AppConfig =
        let env key =
            match Environment.GetEnvironmentVariable(key) with
            | null | "" -> failwithf "Missing required environment variable: %s" key
            | v -> v

        let envOr key defaultValue =
            match Environment.GetEnvironmentVariable(key) with
            | null | "" -> defaultValue
            | v -> v

        { AnthropicApiKey = env "ANTHROPIC_API_KEY"
          GoogleClientId = env "GOOGLE_CLIENT_ID"
          GoogleClientSecret = env "GOOGLE_CLIENT_SECRET"
          JwtSigningKey = env "JWT_SIGNING_KEY"
          FrontendUrl = envOr "FRONTEND_URL" ""
          VoicevoxUrl = envOr "VOICEVOX_URL" "" }
