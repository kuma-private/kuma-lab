namespace DoubutsuQuiz.Api.Quiz

open System
open System.Net.Http
open System.Threading.Tasks

module UrlValidator =

    let private validateUrl (httpClient: HttpClient) (url: string) : Async<bool> =
        async {
            try
                use cts = new Threading.CancellationTokenSource(TimeSpan.FromSeconds(3.0))
                let request = new HttpRequestMessage(HttpMethod.Head, url)
                let! response = httpClient.SendAsync(request, cts.Token) |> Async.AwaitTask
                return response.IsSuccessStatusCode
            with _ ->
                return false
        }

    let validateItems (httpClient: HttpClient) (items: QuizItem list) : Async<QuizItem list * QuizItem list> =
        async {
            let! results =
                items
                |> List.map (fun item ->
                    async {
                        let! isValid = validateUrl httpClient item.Url
                        return (item, isValid)
                    })
                |> Async.Parallel

            let valid = results |> Array.filter snd |> Array.map fst |> Array.toList
            let invalid = results |> Array.filter (snd >> not) |> Array.map fst |> Array.toList
            return (valid, invalid)
        }
