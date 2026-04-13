namespace DoubutsuQuiz.Api.Quiz

open System
open System.Threading.Tasks
open Microsoft.AspNetCore.Http
open Microsoft.Extensions.DependencyInjection

module IrasutoyaHandlers =

    let private toDto (e: IrasutoyaIndex.Entry) =
        {| id = e.Id
           pageUrl = e.PageUrl
           title = e.Title
           description = e.Description
           imageUrls = e.ImageUrls
           categories = e.Categories
           publishedAt = e.PublishedAt |}

    let private tryGetInt (ctx: HttpContext) (key: string) (defaultValue: int) : int =
        match ctx.Request.Query.TryGetValue(key) with
        | true, v ->
            match Int32.TryParse(v.ToString()) with
            | true, n -> n
            | _ -> defaultValue
        | _ -> defaultValue

    let private tryGetString (ctx: HttpContext) (key: string) : string option =
        match ctx.Request.Query.TryGetValue(key) with
        | true, v ->
            let s = v.ToString()
            if String.IsNullOrWhiteSpace(s) then None else Some s
        | _ -> None

    let private clampLimit (n: int) (maxN: int) =
        if n < 1 then 1
        elif n > maxN then maxN
        else n

    let statsHandler (ctx: HttpContext) : Task =
        task {
            let index = ctx.RequestServices.GetRequiredService<IrasutoyaIndex.Index>()
            let payload =
                {| version = index.Version
                   generatedAt = index.GeneratedAt
                   totalEntries = index.TotalEntries
                   categoryCount = index.ByCategory.Count
                   loadMs = index.LoadMs |}
            do! ctx.Response.WriteAsJsonAsync(payload)
        }

    let categoriesHandler (ctx: HttpContext) : Task =
        task {
            let index = ctx.RequestServices.GetRequiredService<IrasutoyaIndex.Index>()
            let items =
                index.ByCategory
                |> Seq.map (fun kv -> {| name = kv.Key; count = kv.Value.Count |})
                |> Seq.sortByDescending (fun x -> x.count)
                |> Seq.toList
            do! ctx.Response.WriteAsJsonAsync({| items = items; total = items.Length |})
        }

    let searchHandler (ctx: HttpContext) : Task =
        task {
            let index = ctx.RequestServices.GetRequiredService<IrasutoyaIndex.Index>()
            match tryGetString ctx "q" with
            | None ->
                ctx.Response.StatusCode <- 400
                do! ctx.Response.WriteAsJsonAsync({| error = "q is required" |})
            | Some q ->
                let limit = clampLimit (tryGetInt ctx "limit" 10) 100
                let hits = IrasutoyaIndex.search index q limit
                let items =
                    hits
                    |> List.map (fun h ->
                        let e = h.Entry
                        {| id = e.Id
                           pageUrl = e.PageUrl
                           title = e.Title
                           description = e.Description
                           imageUrls = e.ImageUrls
                           categories = e.Categories
                           publishedAt = e.PublishedAt
                           score = h.Score |})
                do! ctx.Response.WriteAsJsonAsync({| query = q; items = items; total = items.Length |})
        }

    let byCategoryHandler (ctx: HttpContext) : Task =
        task {
            let index = ctx.RequestServices.GetRequiredService<IrasutoyaIndex.Index>()
            match tryGetString ctx "category" with
            | None ->
                ctx.Response.StatusCode <- 400
                do! ctx.Response.WriteAsJsonAsync({| error = "category is required" |})
            | Some cat ->
                let limit = clampLimit (tryGetInt ctx "limit" 20) 500
                let offset = max 0 (tryGetInt ctx "offset" 0)
                let all = IrasutoyaIndex.byCategory index cat
                let total = List.length all
                let items =
                    all
                    |> List.skip (min offset total)
                    |> List.truncate limit
                    |> List.map toDto
                do! ctx.Response.WriteAsJsonAsync(
                        {| category = cat; items = items; total = total; offset = offset |})
        }

    let randomHandler (ctx: HttpContext) : Task =
        task {
            let index = ctx.RequestServices.GetRequiredService<IrasutoyaIndex.Index>()
            let count = clampLimit (tryGetInt ctx "count" 10) 100
            let category = tryGetString ctx "category"
            let entries = IrasutoyaIndex.randomFromCategory index category count
            let items = entries |> List.map toDto
            do! ctx.Response.WriteAsJsonAsync(
                    {| items = items; count = List.length items |})
        }

    let entryHandler (id: string) (ctx: HttpContext) : Task =
        task {
            let index = ctx.RequestServices.GetRequiredService<IrasutoyaIndex.Index>()
            match IrasutoyaIndex.tryGetById index id with
            | Some e ->
                do! ctx.Response.WriteAsJsonAsync(toDto e)
            | None ->
                ctx.Response.StatusCode <- 404
                do! ctx.Response.WriteAsJsonAsync({| error = "Entry not found"; id = id |})
        }
