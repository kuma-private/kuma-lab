namespace TamekomaNight.Api

open System
open System.IO

[<CLIMutable>]
type AppConfig =
    { GoogleClientId: string
      GoogleClientSecret: string
      JwtSigningKey: string
      FrontendUrl: string
      FirestoreProjectId: string
      AnthropicApiKey: string
      /// Comma-separated uids that should be treated as premium regardless of Firestore state.
      /// Set via CADENZA_DEV_PREMIUM_UIDS. Used only for local development / QA.
      DevPremiumUids: string list
      /// CORS allow-list, parsed from ALLOWED_ORIGINS (CSV) at startup.
      /// In DEV_MODE this defaults to common dev origins so the local Vite +
      /// Bridge stack continues to work without configuration. In production
      /// the env var MUST be set explicitly — there is no default that
      /// allows arbitrary origins, because we issue credentialed (cookie-
      /// bearing) responses and a wildcard would expose the user session
      /// to CSRF.
      AllowedOrigins: string list }

module Config =

    let private tryParseEnvLine (line: string) =
        let trimmed = line.Trim()
        match trimmed with
        | s when s.Length = 0 || s.StartsWith("#") || not (s.Contains("=")) -> None
        | s ->
            let idx = s.IndexOf('=')
            Some(s.Substring(0, idx).Trim(), s.Substring(idx + 1).Trim().Trim('"'))

    let private loadEnvFile () =
        [ Directory.GetCurrentDirectory()
          Path.Combine(Directory.GetCurrentDirectory(), "..", "..", "..") ]
        |> List.map (fun dir -> Path.Combine(dir, ".env"))
        |> List.filter File.Exists
        |> List.tryHead
        |> Option.iter (fun path ->
            File.ReadAllLines(path)
            |> Array.choose tryParseEnvLine
            |> Array.iter (fun (key, value) ->
                if String.IsNullOrEmpty(Environment.GetEnvironmentVariable(key)) then
                    Environment.SetEnvironmentVariable(key, value)))

    do loadEnvFile ()

    let devMode =
        match Environment.GetEnvironmentVariable("DEV_MODE") with
        | "true" | "1" -> true
        | _ -> false

    let private parseDevPremiumUids () : string list =
        match Environment.GetEnvironmentVariable("CADENZA_DEV_PREMIUM_UIDS") with
        | null | "" -> []
        | raw ->
            raw.Split([| ',' |], StringSplitOptions.RemoveEmptyEntries)
            |> Array.map (fun s -> s.Trim())
            |> Array.filter (fun s -> s.Length > 0)
            |> Array.toList

    let private parseAllowedOrigins (devMode: bool) : string list =
        let fromEnv =
            match Environment.GetEnvironmentVariable("ALLOWED_ORIGINS") with
            | null | "" -> []
            | raw ->
                raw.Split([| ',' |], StringSplitOptions.RemoveEmptyEntries)
                |> Array.map (fun s -> s.Trim().TrimEnd('/'))
                |> Array.filter (fun s -> s.Length > 0)
                |> Array.toList
        match fromEnv with
        | [] when devMode ->
            // Sensible local defaults so the standard dev stack
            // (Vite on 52730, custom dev port 5173) just works.
            [ "http://localhost:52730"
              "http://localhost:5173"
              "http://127.0.0.1:52730"
              "http://127.0.0.1:5173" ]
        | xs -> xs

    /// Return true when the given uid appears in CADENZA_DEV_PREMIUM_UIDS.
    let isDevPremiumUid (config: AppConfig) (uid: string) : bool =
        if System.String.IsNullOrEmpty(uid) then false
        else config.DevPremiumUids |> List.exists (fun u -> u = uid)

    let load () : AppConfig =
        let env key =
            match Environment.GetEnvironmentVariable(key) with
            | null | "" -> failwithf "Missing required environment variable: %s" key
            | v -> v

        let envOr key defaultValue =
            match Environment.GetEnvironmentVariable(key) with
            | null | "" -> defaultValue
            | v -> v

        let devPremiumUids = parseDevPremiumUids ()
        let allowedOrigins = parseAllowedOrigins devMode

        if devMode then
            { GoogleClientId = envOr "GOOGLE_CLIENT_ID" "dev-client-id"
              GoogleClientSecret = envOr "GOOGLE_CLIENT_SECRET" "dev-client-secret"
              JwtSigningKey = envOr "JWT_SIGNING_KEY" "dev-signing-key-at-least-32-chars-long!"
              FrontendUrl = envOr "FRONTEND_URL" ""
              FirestoreProjectId = envOr "FIRESTORE_PROJECT_ID" ""
              AnthropicApiKey = envOr "ANTHROPIC_API_KEY" ""
              DevPremiumUids = devPremiumUids
              AllowedOrigins = allowedOrigins }
        else
            { GoogleClientId = env "GOOGLE_CLIENT_ID"
              GoogleClientSecret = env "GOOGLE_CLIENT_SECRET"
              JwtSigningKey = env "JWT_SIGNING_KEY"
              FrontendUrl = envOr "FRONTEND_URL" ""
              FirestoreProjectId = envOr "FIRESTORE_PROJECT_ID" ""
              AnthropicApiKey = envOr "ANTHROPIC_API_KEY" ""
              DevPremiumUids = devPremiumUids
              AllowedOrigins = allowedOrigins }
