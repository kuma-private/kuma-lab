namespace DoubutsuQuiz.Api.Quiz

open System
open System.Collections.Generic
open System.Diagnostics
open System.IO
open System.Text.Json
open System.Text.Json.Serialization
open System.Text.RegularExpressions

module IrasutoyaIndex =

    [<CLIMutable>]
    type Entry =
        { [<JsonPropertyName("id")>]
          Id: string
          [<JsonPropertyName("pageUrl")>]
          PageUrl: string
          [<JsonPropertyName("title")>]
          Title: string
          [<JsonPropertyName("description")>]
          Description: string
          [<JsonPropertyName("imageUrls")>]
          ImageUrls: string array
          [<JsonPropertyName("categories")>]
          Categories: string array
          [<JsonPropertyName("publishedAt")>]
          PublishedAt: string }

    let private katakanaToHiragana (s: string) : string =
        if isNull s then "" else
        let chars = s.ToCharArray()
        for i in 0 .. chars.Length - 1 do
            let c = int chars.[i]
            if c >= 0x30A1 && c <= 0x30F6 then
                chars.[i] <- char (c - 0x60)
        String(chars)

    let private tokenSplitRegex = Regex(@"[\s\p{P}\p{S}]+", RegexOptions.Compiled)

    let private tokenize (text: string) : string list =
        if String.IsNullOrWhiteSpace(text) then []
        else
            let normalized = (katakanaToHiragana text).ToLowerInvariant()
            tokenSplitRegex.Split(normalized)
            |> Array.filter (fun t -> t.Length > 0)
            |> Array.toList

    type Index =
        { Version: string
          GeneratedAt: string
          TotalEntries: int
          Entries: Entry array
          ById: Dictionary<string, Entry>
          ByCategory: Dictionary<string, ResizeArray<Entry>>
          SearchText: Dictionary<string, string>
          LoadMs: int64 }

    let private readString (el: JsonElement) (name: string) : string =
        match el.TryGetProperty(name) with
        | true, v when v.ValueKind = JsonValueKind.String -> v.GetString()
        | _ -> ""

    let private readStringArray (el: JsonElement) (name: string) : string array =
        match el.TryGetProperty(name) with
        | true, v when v.ValueKind = JsonValueKind.Array ->
            v.EnumerateArray()
            |> Seq.choose (fun x ->
                if x.ValueKind = JsonValueKind.String then Some(x.GetString()) else None)
            |> Seq.toArray
        | _ -> [||]

    let load (jsonPath: string) : Index =
        let sw = Stopwatch.StartNew()

        if not (File.Exists jsonPath) then
            failwithf "Irasutoya index not found: %s" jsonPath

        use stream = File.OpenRead jsonPath
        use doc = JsonDocument.Parse(stream)
        let root = doc.RootElement

        let version = readString root "version"
        let generatedAt = readString root "generated_at"

        let entries =
            match root.TryGetProperty("entries") with
            | true, arr when arr.ValueKind = JsonValueKind.Array ->
                arr.EnumerateArray()
                |> Seq.map (fun e ->
                    { Id = readString e "id"
                      PageUrl = readString e "page_url"
                      Title = readString e "title"
                      Description = readString e "description"
                      ImageUrls = readStringArray e "image_urls"
                      Categories = readStringArray e "categories"
                      PublishedAt = readString e "published_at" })
                |> Seq.toArray
            | _ -> failwith "Invalid irasutoya index JSON: missing entries array"

        let byId = Dictionary<string, Entry>(entries.Length)
        let byCategory = Dictionary<string, ResizeArray<Entry>>()
        let searchText = Dictionary<string, string>(entries.Length)

        for e in entries do
            byId.[e.Id] <- e

            for c in e.Categories do
                match byCategory.TryGetValue(c) with
                | true, list -> list.Add(e)
                | false, _ ->
                    let list = ResizeArray<Entry>()
                    list.Add(e)
                    byCategory.[c] <- list

            let combined =
                String.concat " " [
                    (if isNull e.Title then "" else e.Title)
                    (if isNull e.Description then "" else e.Description)
                    String.concat " " e.Categories
                ]

            searchText.[e.Id] <- (katakanaToHiragana combined).ToLowerInvariant()

        sw.Stop()

        { Version = version
          GeneratedAt = generatedAt
          TotalEntries = entries.Length
          Entries = entries
          ById = byId
          ByCategory = byCategory
          SearchText = searchText
          LoadMs = sw.ElapsedMilliseconds }

    type SearchHit =
        { Entry: Entry
          Score: double }

    let search (index: Index) (query: string) (limit: int) : SearchHit list =
        let tokens = tokenize query
        if List.isEmpty tokens then []
        else
            let totalDocs = double index.Entries.Length

            let docFreq =
                tokens
                |> List.map (fun t ->
                    let mutable count = 0
                    for kv in index.SearchText do
                        if kv.Value.Contains(t) then count <- count + 1
                    t, count)
                |> Map.ofList

            let idf token =
                let df = double (Map.find token docFreq)
                if df <= 0.0 then 0.0
                else log ((totalDocs - df + 0.5) / (df + 0.5) + 1.0)

            let hits =
                index.Entries
                |> Array.choose (fun e ->
                    let text = index.SearchText.[e.Id]
                    let mutable score = 0.0
                    let mutable matched = 0
                    for t in tokens do
                        if text.Contains(t) then
                            matched <- matched + 1
                            let mutable idx = 0
                            let mutable tf = 0
                            while idx >= 0 do
                                idx <- text.IndexOf(t, idx)
                                if idx >= 0 then
                                    tf <- tf + 1
                                    idx <- idx + t.Length
                            score <- score + (double tf) * (idf t)
                    if matched > 0 then
                        let titleBoost =
                            if not (isNull e.Title) then
                                let titleLower = (katakanaToHiragana e.Title).ToLowerInvariant()
                                tokens
                                |> List.sumBy (fun t -> if titleLower.Contains(t) then 1.0 else 0.0)
                            else 0.0
                        let coverage = (double matched) / (double tokens.Length)
                        Some { Entry = e; Score = score * (1.0 + coverage) + titleBoost }
                    else None)
                |> Array.sortByDescending (fun h -> h.Score)

            hits
            |> Array.truncate limit
            |> Array.toList

    let byCategory (index: Index) (category: string) : Entry list =
        match index.ByCategory.TryGetValue(category) with
        | true, list -> List.ofSeq list
        | false, _ -> []

    let private rng = Random.Shared

    let randomSample (source: Entry array) (count: int) : Entry list =
        let n = source.Length
        if n = 0 then []
        else
            let take = min count n
            let indices = Array.init n id
            for i in 0 .. take - 1 do
                let j = rng.Next(i, n)
                let tmp = indices.[i]
                indices.[i] <- indices.[j]
                indices.[j] <- tmp
            [ for i in 0 .. take - 1 -> source.[indices.[i]] ]

    let randomFromCategory (index: Index) (category: string option) (count: int) : Entry list =
        let source =
            match category with
            | Some c ->
                match index.ByCategory.TryGetValue(c) with
                | true, list -> list.ToArray()
                | false, _ -> [||]
            | None -> index.Entries
        randomSample source count

    let tryGetById (index: Index) (id: string) : Entry option =
        match index.ById.TryGetValue(id) with
        | true, e -> Some e
        | false, _ -> None
