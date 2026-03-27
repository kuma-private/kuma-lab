namespace SinSublimation.Api.Purification

open System.Text.Json
open System.Text.Json.Serialization

[<CLIMutable>]
type CodeLine =
    { [<JsonPropertyName("c")>]
      Code: string
      [<JsonPropertyName("s")>]
      Sin: string option }

[<CLIMutable>]
type GenerateResponse =
    { [<JsonPropertyName("theme")>]
      Theme: string
      [<JsonPropertyName("lang")>]
      Lang: string
      [<JsonPropertyName("lines")>]
      Lines: CodeLine list
      [<JsonPropertyName("fs")>]
      Fs: string
      [<JsonPropertyName("why")>]
      Why: string
      [<JsonPropertyName("sinCategory")>]
      SinCategory: string }

module Parser =

    [<CLIMutable>]
    type RawCodeLine =
        { [<JsonPropertyName("c")>]
          c: string
          [<JsonPropertyName("s")>]
          s: JsonElement }

    [<CLIMutable>]
    type RawResponse =
        { [<JsonPropertyName("theme")>]
          theme: string
          [<JsonPropertyName("lang")>]
          lang: string
          [<JsonPropertyName("lines")>]
          lines: RawCodeLine array
          [<JsonPropertyName("fs")>]
          fs: string
          [<JsonPropertyName("why")>]
          why: string
          [<JsonPropertyName("sinCategory")>]
          sinCategory: string }

    let private parseCodeLine (raw: RawCodeLine) : CodeLine =
        let sin =
            if raw.s.ValueKind = JsonValueKind.Null || raw.s.ValueKind = JsonValueKind.Undefined then
                None
            else
                let text = raw.s.GetString()
                if System.String.IsNullOrEmpty(text) then None else Some text

        { Code = raw.c |> Option.ofObj |> Option.defaultValue ""
          Sin = sin }

    let parse (jsonText: string) : Result<GenerateResponse, string> =
        try
            let trimmed = jsonText.Trim()
            let options = JsonSerializerOptions(PropertyNameCaseInsensitive = true)
            let raw = JsonSerializer.Deserialize<RawResponse>(trimmed, options)

            if isNull (box raw) then
                Error "Deserialized to null"
            elif System.String.IsNullOrEmpty(raw.theme) then
                Error "Missing required field: theme"
            elif System.String.IsNullOrEmpty(raw.lang) then
                Error "Missing required field: lang"
            elif raw.lines = null || raw.lines.Length = 0 then
                Error "Missing required field: lines"
            elif System.String.IsNullOrEmpty(raw.fs) then
                Error "Missing required field: fs"
            elif System.String.IsNullOrEmpty(raw.why) then
                Error "Missing required field: why"
            else
                Ok
                    { Theme = raw.theme
                      Lang = raw.lang
                      Lines = raw.lines |> Array.map parseCodeLine |> Array.toList
                      Fs = raw.fs
                      Why = raw.why
                      SinCategory = raw.sinCategory |> Option.ofObj |> Option.defaultValue "" }
        with ex ->
            Error $"JSON parse error: {ex.Message}"
