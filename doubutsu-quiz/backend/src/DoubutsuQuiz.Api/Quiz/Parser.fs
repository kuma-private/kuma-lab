namespace DoubutsuQuiz.Api.Quiz

open System.Text.Json
open System.Text.Json.Serialization

[<CLIMutable>]
type QuizItem =
    { [<JsonPropertyName("name")>]
      Name: string
      [<JsonPropertyName("url")>]
      Url: string
      [<JsonPropertyName("sound")>]
      Sound: string
      [<JsonPropertyName("description")>]
      Description: string }

module Parser =

    [<CLIMutable>]
    type SoundItem =
        { [<JsonPropertyName("name")>]
          name: string
          [<JsonPropertyName("sound")>]
          sound: string
          [<JsonPropertyName("description")>]
          description: string }

    [<CLIMutable>]
    type SoundResponse =
        { [<JsonPropertyName("items")>]
          items: SoundItem array }

    let parseSounds (jsonText: string) : Result<SoundItem list, string> =
        try
            let trimmed = jsonText.Trim()
            let options = JsonSerializerOptions(PropertyNameCaseInsensitive = true)
            let raw = JsonSerializer.Deserialize<SoundResponse>(trimmed, options)

            if isNull (box raw) then
                Error "Deserialized to null"
            elif raw.items = null || raw.items.Length = 0 then
                Error "Missing required field: items"
            else
                Ok(raw.items |> Array.toList)
        with ex ->
            Error $"JSON parse error: {ex.Message}"
