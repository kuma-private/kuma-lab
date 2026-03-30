namespace CodeShinkou.Api.Analysis

open System.IO
open System.Net.Http
open System.Threading.Tasks

module ChordClient =

    let analyzeAudio (httpClient: HttpClient) (filePath: string) : Task<Result<string, string>> =
        task {
            try
                use content = new MultipartFormDataContent()
                let fileBytes = File.ReadAllBytes(filePath)
                let fileContent = new ByteArrayContent(fileBytes)
                fileContent.Headers.ContentType <- System.Net.Http.Headers.MediaTypeHeaderValue("audio/wav")
                content.Add(fileContent, "file", "audio.wav")

                let! response = httpClient.PostAsync("/analyze-audio", content)
                let! body = response.Content.ReadAsStringAsync()

                if response.IsSuccessStatusCode then
                    return Ok body
                else
                    return Error $"Analyzer returned {int response.StatusCode}: {body}"
            with ex ->
                return Error $"Failed to call analyzer: {ex.Message}"
        }
