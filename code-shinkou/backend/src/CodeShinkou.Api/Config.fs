namespace CodeShinkou.Api

open System

[<CLIMutable>]
type AppConfig =
    { AnalyzerUrl: string }

module Config =

    let load () : AppConfig =
        let envOr key defaultValue =
            match Environment.GetEnvironmentVariable(key) with
            | null | "" -> defaultValue
            | v -> v

        { AnalyzerUrl = envOr "ANALYZER_URL" "http://localhost:52720" }
