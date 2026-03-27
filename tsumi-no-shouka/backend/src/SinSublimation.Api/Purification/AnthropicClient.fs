namespace SinSublimation.Api.Purification

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
          Text: string }

    [<CLIMutable>]
    type AnthropicResponse =
        { [<JsonPropertyName("id")>]
          Id: string
          [<JsonPropertyName("content")>]
          Content: ContentBlock array }

    let callApi (httpClient: HttpClient) (apiKey: string) : Async<Result<string, string>> =
        async {
            try
                let messages = Prompt.buildMessages ()

                let requestBody =
                    {| model = "claude-sonnet-4-6"
                       max_tokens = 800
                       system = Prompt.systemPrompt
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

                let! responseBody =
                    response.Content.ReadAsStringAsync() |> Async.AwaitTask

                if response.IsSuccessStatusCode then
                    let parsed = JsonSerializer.Deserialize<AnthropicResponse>(responseBody)

                    match parsed.Content |> Array.tryFind (fun c -> c.Type = "text") with
                    | Some block -> return Ok block.Text
                    | None -> return Error "No text content in Anthropic response"
                elif int response.StatusCode = 529 || int response.StatusCode = 503 then
                    // Overloaded/unavailable - retry once after delay
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
                        match parsed.Content |> Array.tryFind (fun c -> c.Type = "text") with
                        | Some block -> return Ok block.Text
                        | None -> return Error "No text content in Anthropic response"
                    else
                        return Error $"Anthropic API error ({int retryResponse.StatusCode}): {retryBody}"
                else
                    return Error $"Anthropic API error ({int response.StatusCode}): {responseBody}"
            with ex ->
                return Error $"Exception calling Anthropic API: {ex.Message}"
        }
