namespace DoubutsuQuiz.Api.Quiz

open System
open System.Net.Http
open System.Text

module VoicevoxClient =

    let private zundamonSpeakerId = 3

    let synthesize (httpClient: HttpClient) (baseUrl: string) (text: string) : Async<Result<byte array, string>> =
        async {
            try
                if String.IsNullOrEmpty(baseUrl) then
                    return Error "VOICEVOX_URL not configured"
                else
                    // Step 1: Create audio query
                    let queryUrl = $"{baseUrl}/audio_query?text={Uri.EscapeDataString(text)}&speaker={zundamonSpeakerId}"
                    let! queryResponse = httpClient.PostAsync(queryUrl, null) |> Async.AwaitTask
                    let! queryBody = queryResponse.Content.ReadAsStringAsync() |> Async.AwaitTask

                    if not queryResponse.IsSuccessStatusCode then
                        return Error $"audio_query failed ({int queryResponse.StatusCode}): {queryBody.[..min 200 (queryBody.Length - 1)]}"
                    else
                        // Step 2: Synthesize audio
                        let synthUrl = $"{baseUrl}/synthesis?speaker={zundamonSpeakerId}"
                        let synthContent = new StringContent(queryBody, Encoding.UTF8, "application/json")
                        let! synthResponse = httpClient.PostAsync(synthUrl, synthContent) |> Async.AwaitTask

                        if not synthResponse.IsSuccessStatusCode then
                            let! errBody = synthResponse.Content.ReadAsStringAsync() |> Async.AwaitTask
                            return Error $"synthesis failed ({int synthResponse.StatusCode}): {errBody.[..min 200 (errBody.Length - 1)]}"
                        else
                            let! audioBytes = synthResponse.Content.ReadAsByteArrayAsync() |> Async.AwaitTask
                            return Ok audioBytes
            with ex ->
                return Error $"VOICEVOX error: {ex.Message}"
        }
