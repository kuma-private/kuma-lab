namespace ChordBattle.Api.Thread

open System
open System.Net.Http
open System.Security.Claims
open System.Text
open System.Threading.Tasks
open Microsoft.AspNetCore.Http
open Microsoft.Extensions.DependencyInjection
open ChordBattle.Api
open ChordBattle.Api.Thread.Models
open ChordBattle.Api.Thread.Repository
open ChordBattle.Api.Analysis

module ThreadHandlers =

    let private devMode = Config.devMode

    let private getUserInfo (ctx: HttpContext) =
        if devMode && (ctx.User = null || ctx.User.Identity = null || not ctx.User.Identity.IsAuthenticated) then
            ("dev-user", "Dev User")
        else
            let userId =
                ctx.User.FindFirst(ClaimTypes.NameIdentifier)
                |> Option.ofObj
                |> Option.map (fun c -> c.Value)
                |> Option.defaultValue "anonymous"

            let userName =
                ctx.User.FindFirst(ClaimTypes.Name)
                |> Option.ofObj
                |> Option.map (fun c -> c.Value)
                |> Option.defaultValue "Anonymous"

            (userId, userName)

    let private getHttpClient (ctx: HttpContext) =
        let factory = ctx.RequestServices.GetRequiredService<IHttpClientFactory>()
        factory.CreateClient("Anthropic")

    let listThreads (repo: IThreadRepository) (ctx: HttpContext) : Task =
        task {
            let! threads = repo.GetAll()

            let result =
                threads
                |> List.map (fun t ->
                    {| id = t.Id
                       title = t.Title
                       key = t.Key
                       timeSignature = t.TimeSignature
                       bpm = t.Bpm
                       createdByName = t.CreatedByName
                       createdAt = t.CreatedAt
                       lastEditedBy = t.LastEditedBy
                       lastEditedAt = t.LastEditedAt
                       memberCount = t.Members.Length |})

            do! ctx.Response.WriteAsJsonAsync(result)
        }

    let createThread (repo: IThreadRepository) (ctx: HttpContext) : Task =
        task {
            let! req = ctx.Request.ReadFromJsonAsync<CreateThreadRequest>()
            let (userId, userName) = getUserInfo ctx

            let thread =
                { Id = Guid.NewGuid().ToString("N")
                  Title = req.title
                  Key = "C Major"
                  TimeSignature = "4/4"
                  Bpm = 120
                  CreatedBy = userId
                  CreatedByName = userName
                  CreatedAt = DateTime.UtcNow
                  Score = ""
                  LastEditedBy = userId
                  LastEditedAt = DateTime.UtcNow
                  Members = [ userId ]
                  History = [] }

            let! created = repo.Create(thread)

            ctx.Response.StatusCode <- 201
            do! ctx.Response.WriteAsJsonAsync({| id = created.Id |})
        }

    let getThread (repo: IThreadRepository) (threadId: string) (ctx: HttpContext) : Task =
        task {
            let! thread = repo.GetById(threadId)

            match thread with
            | Some t -> do! ctx.Response.WriteAsJsonAsync(t)
            | None ->
                ctx.Response.StatusCode <- 404
                do! ctx.Response.WriteAsJsonAsync({| error = "Thread not found" |})
        }

    let saveScore (repo: IThreadRepository) (threadId: string) (ctx: HttpContext) : Task =
        task {
            let! thread = repo.GetById(threadId)

            match thread with
            | None ->
                ctx.Response.StatusCode <- 404
                do! ctx.Response.WriteAsJsonAsync({| error = "Thread not found" |})
            | Some _ ->
                let (userId, userName) = getUserInfo ctx
                let! req = ctx.Request.ReadFromJsonAsync<SaveScoreRequest>()

                let history =
                    { UserId = userId
                      UserName = userName
                      Score = req.score
                      Comment = req.comment
                      AiComment = ""
                      AiScores = ""
                      CreatedAt = DateTime.UtcNow }

                let! result = repo.SaveScore threadId req.score history

                match result with
                | Some updated -> do! ctx.Response.WriteAsJsonAsync(updated)
                | None ->
                    ctx.Response.StatusCode <- 500
                    do! ctx.Response.WriteAsJsonAsync({| error = "Failed to save score" |})
        }

    let updateSettings (repo: IThreadRepository) (threadId: string) (ctx: HttpContext) : Task =
        task {
            let! thread = repo.GetById(threadId)

            match thread with
            | None ->
                ctx.Response.StatusCode <- 404
                do! ctx.Response.WriteAsJsonAsync({| error = "Thread not found" |})
            | Some _ ->
                let! req = ctx.Request.ReadFromJsonAsync<UpdateSettingsRequest>()
                let! result = repo.UpdateSettings threadId req.key req.timeSignature req.bpm

                match result with
                | Some updated -> do! ctx.Response.WriteAsJsonAsync(updated)
                | None ->
                    ctx.Response.StatusCode <- 500
                    do! ctx.Response.WriteAsJsonAsync({| error = "Failed to update settings" |})
        }

    let reviewScore (repo: IThreadRepository) (config: AppConfig) (threadId: string) (ctx: HttpContext) : Task =
        task {
            let! thread = repo.GetById(threadId)

            match thread with
            | None ->
                ctx.Response.StatusCode <- 404
                do! ctx.Response.WriteAsJsonAsync({| error = "Thread not found" |})
            | Some t ->
                if String.IsNullOrEmpty(config.AnthropicApiKey) then
                    ctx.Response.StatusCode <- 400
                    do! ctx.Response.WriteAsJsonAsync({| error = "AI review is not configured" |})
                elif t.History.Length = 0 then
                    ctx.Response.StatusCode <- 400
                    do! ctx.Response.WriteAsJsonAsync({| error = "No history to review" |})
                else
                    let httpClient = getHttpClient ctx
                    let scoreLines = t.Score.Split('\n') |> Array.toList
                    let! result =
                        AnthropicClient.reviewTurn httpClient config.AnthropicApiKey t.Key t.TimeSignature "save" 1 t.Score scoreLines
                        |> Async.StartAsTask

                    match result with
                    | Ok r ->
                        // Update the latest history entry with AI comment
                        let updatedHistory =
                            t.History
                            |> List.mapi (fun i h ->
                                if i = t.History.Length - 1 then
                                    { h with AiComment = r.Comment; AiScores = r.ScoresJson }
                                else h)
                        let updatedThread = { t with History = updatedHistory }
                        let! _ = repo.Update(updatedThread)
                        do! ctx.Response.WriteAsJsonAsync({| comment = r.Comment; scores = r.ScoresJson |})
                    | Error e ->
                        ctx.Response.StatusCode <- 500
                        do! ctx.Response.WriteAsJsonAsync({| error = $"AI review failed: {e}" |})
        }

    let getHistory (repo: IThreadRepository) (threadId: string) (ctx: HttpContext) : Task =
        task {
            let! thread = repo.GetById(threadId)

            match thread with
            | Some t -> do! ctx.Response.WriteAsJsonAsync(t.History)
            | None ->
                ctx.Response.StatusCode <- 404
                do! ctx.Response.WriteAsJsonAsync({| error = "Thread not found" |})
        }

    let exportThread (repo: IThreadRepository) (threadId: string) (ctx: HttpContext) : Task =
        task {
            let! thread = repo.GetById(threadId)

            match thread with
            | Some t ->
                let sb = StringBuilder()
                sb.AppendLine($"# {t.Title}") |> ignore
                sb.AppendLine() |> ignore
                sb.AppendLine($"- Key: {t.Key}") |> ignore
                sb.AppendLine($"- Time Signature: {t.TimeSignature}") |> ignore
                sb.AppendLine($"- BPM: {t.Bpm}") |> ignore
                sb.AppendLine() |> ignore
                sb.AppendLine("## Score") |> ignore
                sb.AppendLine() |> ignore
                sb.AppendLine("```") |> ignore
                sb.AppendLine(t.Score) |> ignore
                sb.AppendLine("```") |> ignore

                ctx.Response.ContentType <- "text/markdown; charset=utf-8"
                do! ctx.Response.WriteAsync(sb.ToString())
            | None ->
                ctx.Response.StatusCode <- 404
                do! ctx.Response.WriteAsJsonAsync({| error = "Thread not found" |})
        }
