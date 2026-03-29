namespace DoubutsuQuiz.Api.Quiz

open System
open System.Collections.Generic
open System.Net.Http
open System.Text.Json
open System.Text.RegularExpressions

module IrasutoyaScraper =

    type ScrapedItem =
        { Name: string
          ImageUrl: string }

    let private feedUrls =
        let d = Dictionary<string, string>()
        d.["doubutsu"] <- "https://www.irasutoya.com/feeds/posts/default/-/%E5%8B%95%E7%89%A9?alt=json&max-results=200"
        d.["yasai"] <- "https://www.irasutoya.com/feeds/posts/default/-/%E9%87%8E%E8%8F%9C?alt=json&max-results=200"
        d

    let private parseEntries (json: string) : ScrapedItem list =
        let doc = JsonDocument.Parse(json)
        let feed = doc.RootElement.GetProperty("feed")

        match feed.TryGetProperty("entry") with
        | false, _ -> []
        | true, entries ->
            entries.EnumerateArray()
            |> Seq.choose (fun entry ->
                let title =
                    match entry.TryGetProperty("title") with
                    | true, t ->
                        match t.TryGetProperty("$t") with
                        | true, v -> v.GetString()
                        | _ -> null
                    | _ -> null

                let thumbUrl =
                    match entry.TryGetProperty("media$thumbnail") with
                    | true, mt ->
                        match mt.TryGetProperty("url") with
                        | true, v -> v.GetString()
                        | _ -> null
                    | _ -> null

                if not (String.IsNullOrEmpty(title)) && not (String.IsNullOrEmpty(thumbUrl)) then
                    let largeUrl = Regex.Replace(thumbUrl, @"/s72-c/", "/s400/")
                    Some { Name = title; ImageUrl = largeUrl }
                else
                    None)
            |> Seq.toList

    let private rng = Random.Shared

    let fetchAndShuffle (httpClient: HttpClient) (genre: string) (count: int) : Async<Result<ScrapedItem list, string>> =
        async {
            try
                match feedUrls.TryGetValue(genre) with
                | false, _ -> return Error (sprintf "Unknown genre: %s" genre)
                | true, url ->
                    let! response = httpClient.GetStringAsync(url) |> Async.AwaitTask
                    let items = parseEntries response

                    if items.Length = 0 then
                        return Error "No items found in irasutoya feed"
                    else
                        let shuffled =
                            items
                            |> List.sortBy (fun _ -> rng.Next())
                            |> List.take (min count items.Length)

                        return Ok shuffled
            with ex ->
                return Error (sprintf "Failed to fetch irasutoya: %s" ex.Message)
        }
