namespace DoubutsuQuiz.Api.Nazenaze

open System
open System.Net.Http
open System.Text
open System.Text.Json
open System.Threading.Tasks
open Google.Apis.Auth.OAuth2

module ImageGen =

    let private projectId = "kuma-lab"
    let private location = "us-central1"
    let private model = "imagen-4.0-fast-generate-001"

    let private getAccessToken () : Task<string> =
        task {
            let! credential = GoogleCredential.GetApplicationDefaultAsync()
            let scoped = credential.CreateScoped("https://www.googleapis.com/auth/cloud-platform")
            return! scoped.UnderlyingCredential.GetAccessTokenForRequestAsync()
        }

    let private buildPrompt (mode: string) (scenePrompt: string) : string =
        let style =
            if mode = "false" then
                "whimsical pastel watercolor children's picture book illustration, dreamy and slightly silly, soft brush strokes, gentle colors"
            else
                "calm pastel watercolor children's picture book illustration, soft brush strokes, gentle warm colors"
        // scenePrompt は Claude が考えた英語シーン描写 (1 文)。それを style modifier で wrap する
        sprintf
            "%s. %s. Wide panoramic view, no characters, no people, no text, no letters, atmospheric and gentle."
            scenePrompt style

    /// Generate a single background PNG via Vertex AI Imagen.
    /// Returns Ok dataUrl ("data:image/png;base64,...") or Error message.
    /// Never throws — caller can pass through to client even if image gen fails.
    let generateBackground
        (httpClient: HttpClient)
        (mode: string)
        (scenePrompt: string)
        : Async<Result<string, string>> =
        async {
            try
                let! token = getAccessToken () |> Async.AwaitTask
                let prompt = buildPrompt mode scenePrompt

                let url =
                    sprintf
                        "https://%s-aiplatform.googleapis.com/v1/projects/%s/locations/%s/publishers/google/models/%s:predict"
                        location projectId location model

                let payload =
                    {| instances = [| {| prompt = prompt |} |]
                       parameters =
                        {| sampleCount = 1
                           aspectRatio = "3:4"
                           safetySetting = "block_only_high"
                           personGeneration = "allow_all" |} |}

                let json = JsonSerializer.Serialize(payload)
                use req = new HttpRequestMessage(HttpMethod.Post, url)
                req.Headers.Authorization <- System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token)
                req.Content <- new StringContent(json, Encoding.UTF8, "application/json")

                let! resp = httpClient.SendAsync(req) |> Async.AwaitTask
                let! body = resp.Content.ReadAsStringAsync() |> Async.AwaitTask

                if not resp.IsSuccessStatusCode then
                    return Error (sprintf "Imagen HTTP %d: %s" (int resp.StatusCode) body)
                else
                    printfn "[imagen-debug] body len=%d head=%s" body.Length (if body.Length > 300 then body.Substring(0, 300) else body)
                    use doc = JsonDocument.Parse(body)
                    let mutable predictionsOpt = Unchecked.defaultof<JsonElement>
                    let hasPredictions = doc.RootElement.TryGetProperty("predictions", &predictionsOpt)
                    if not hasPredictions then
                        let topKeys = doc.RootElement.EnumerateObject() |> Seq.map (fun p -> p.Name) |> String.concat ","
                        return Error (sprintf "No 'predictions' key. Top keys: %s" topKeys)
                    elif predictionsOpt.GetArrayLength() = 0 then
                        return Error "Empty predictions array"
                    else
                        let pred = predictionsOpt.[0]
                        let predKeys = pred.EnumerateObject() |> Seq.map (fun p -> p.Name) |> String.concat ","
                        printfn "[imagen-debug] pred[0] keys: %s" predKeys
                        match pred.TryGetProperty("bytesBase64Encoded") with
                        | true, b64Elem ->
                            let b64 = b64Elem.GetString()
                            return Ok (sprintf "data:image/png;base64,%s" b64)
                        | _ ->
                            return Error (sprintf "No bytesBase64Encoded. pred keys: %s" predKeys)
            with ex ->
                return Error (sprintf "ImageGen exception: %s" ex.Message)
        }
