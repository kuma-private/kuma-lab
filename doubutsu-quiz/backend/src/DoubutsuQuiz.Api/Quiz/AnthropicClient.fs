namespace DoubutsuQuiz.Api.Quiz

open System
open System.Net.Http
open System.Text
open System.Text.Json
open System.Text.Json.Serialization

module AnthropicClient =

    [<CLIMutable>]
    type ContentBlock =
        { [<JsonPropertyName("type")>]
          Type: string
          [<JsonPropertyName("text")>]
          Text: string
          [<JsonPropertyName("input")>]
          Input: JsonElement }

    [<CLIMutable>]
    type AnthropicResponse =
        { [<JsonPropertyName("id")>]
          Id: string
          [<JsonPropertyName("content")>]
          Content: ContentBlock array }

    let private toolSchema =
        {| name = "generate_sounds"
           description = "Generate sound text for quiz items"
           input_schema = Prompt.soundToolSchema |}

    let private extractToolUseInput (parsed: AnthropicResponse) : Result<string, string> =
        match parsed.Content |> Array.tryFind (fun c -> c.Type = "tool_use") with
        | Some block ->
            if block.Input.ValueKind <> JsonValueKind.Undefined && block.Input.ValueKind <> JsonValueKind.Null then
                Ok(block.Input.GetRawText())
            else
                Error "tool_use block has no input"
        | None ->
            match parsed.Content |> Array.tryFind (fun c -> c.Type = "text") with
            | Some block -> Ok block.Text
            | None -> Error "No tool_use or text content in Anthropic response"

    let callSoundApi (httpClient: HttpClient) (apiKey: string) (names: string list) : Async<Result<string, string>> =
        async {
            try
                let messages = Prompt.buildSoundMessages names

                let requestBody =
                    {| model = "claude-sonnet-4-6"
                       max_tokens = 4000
                       system = Prompt.systemPrompt
                       tool_choice = {| ``type`` = "any" |}
                       tools = [| toolSchema |]
                       messages = messages |}

                let jsonOptions = JsonSerializerOptions(PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower)
                let json = JsonSerializer.Serialize(requestBody, jsonOptions)
                let content = new StringContent(json, Encoding.UTF8, "application/json")

                let request =
                    new HttpRequestMessage(HttpMethod.Post, "https://api.anthropic.com/v1/messages")

                request.Content <- content
                request.Headers.Add("x-api-key", apiKey)
                request.Headers.Add("anthropic-version", "2023-06-01")

                let! response = httpClient.SendAsync(request) |> Async.AwaitTask
                let! responseBody = response.Content.ReadAsStringAsync() |> Async.AwaitTask

                if response.IsSuccessStatusCode then
                    let parsed = JsonSerializer.Deserialize<AnthropicResponse>(responseBody)
                    return extractToolUseInput parsed
                elif int response.StatusCode = 529 || int response.StatusCode = 503 then
                    do! Async.Sleep 2000
                    let retryRequest =
                        new HttpRequestMessage(HttpMethod.Post, "https://api.anthropic.com/v1/messages")
                    retryRequest.Content <- new StringContent(json, Encoding.UTF8, "application/json")
                    retryRequest.Headers.Add("x-api-key", apiKey)
                    retryRequest.Headers.Add("anthropic-version", "2023-06-01")
                    let! retryResponse = httpClient.SendAsync(retryRequest) |> Async.AwaitTask
                    let! retryBody = retryResponse.Content.ReadAsStringAsync() |> Async.AwaitTask
                    if retryResponse.IsSuccessStatusCode then
                        let parsed = JsonSerializer.Deserialize<AnthropicResponse>(retryBody)
                        return extractToolUseInput parsed
                    else
                        return Error $"Anthropic API error ({int retryResponse.StatusCode}): {retryBody}"
                else
                    return Error $"Anthropic API error ({int response.StatusCode}): {responseBody}"
            with ex ->
                return Error $"Exception calling Anthropic API: {ex.Message}"
        }
