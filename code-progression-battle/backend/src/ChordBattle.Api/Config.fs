namespace ChordBattle.Api

open System

[<CLIMutable>]
type AppConfig =
    { GoogleClientId: string
      GoogleClientSecret: string
      JwtSigningKey: string
      FrontendUrl: string
      FirestoreProjectId: string }

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

        let devMode =
            match Environment.GetEnvironmentVariable("DEV_MODE") with
            | "true" | "1" -> true
            | _ -> false

        if devMode then
            { GoogleClientId = envOr "GOOGLE_CLIENT_ID" "dev-client-id"
              GoogleClientSecret = envOr "GOOGLE_CLIENT_SECRET" "dev-client-secret"
              JwtSigningKey = envOr "JWT_SIGNING_KEY" "dev-signing-key-at-least-32-chars-long!"
              FrontendUrl = envOr "FRONTEND_URL" ""
              FirestoreProjectId = envOr "FIRESTORE_PROJECT_ID" "" }
        else
            { GoogleClientId = env "GOOGLE_CLIENT_ID"
              GoogleClientSecret = env "GOOGLE_CLIENT_SECRET"
              JwtSigningKey = env "JWT_SIGNING_KEY"
              FrontendUrl = envOr "FRONTEND_URL" ""
              FirestoreProjectId = envOr "FIRESTORE_PROJECT_ID" "" }
