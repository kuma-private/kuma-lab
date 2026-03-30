namespace ChordBattle.Api.Thread

open System
open System.Security.Claims
open System.Text
open System.Threading.Tasks
open Microsoft.AspNetCore.Http
open ChordBattle.Api.Thread.Models
open ChordBattle.Api.Thread.Repository

module ThreadHandlers =

    let private getUserInfo (ctx: HttpContext) =
        let devMode =
            match Environment.GetEnvironmentVariable("DEV_MODE") with
            | "true" | "1" -> true
            | _ -> false

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
                       postCount = t.Posts.Length |})

            do! ctx.Response.WriteAsJsonAsync(result)
        }

    let createThread (repo: IThreadRepository) (ctx: HttpContext) : Task =
        task {
            let! req = ctx.Request.ReadFromJsonAsync<CreateThreadRequest>()
            let (userId, userName) = getUserInfo ctx

            let thread =
                { Id = Guid.NewGuid().ToString("N")
                  Title = req.title
                  Key = req.key
                  TimeSignature = req.timeSignature
                  Bpm = req.bpm
                  CreatedBy = userId
                  CreatedByName = userName
                  CreatedAt = DateTime.UtcNow
                  Posts = [] }

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

    let addPost (repo: IThreadRepository) (threadId: string) (ctx: HttpContext) : Task =
        task {
            let! req = ctx.Request.ReadFromJsonAsync<CreatePostRequest>()
            let (userId, userName) = getUserInfo ctx

            let post =
                { UserId = userId
                  UserName = userName
                  Chords = req.chords
                  Comment = req.comment
                  CreatedAt = DateTime.UtcNow }

            let! result = repo.AddPost threadId post

            match result with
            | Some _ ->
                ctx.Response.StatusCode <- 201
                do! ctx.Response.WriteAsJsonAsync({| ok = true |})
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
                sb.AppendLine($"- Created by: {t.CreatedByName}") |> ignore
                sb.AppendLine() |> ignore
                sb.AppendLine("## Chord Progressions") |> ignore
                sb.AppendLine() |> ignore

                t.Posts
                |> List.iteri (fun i post ->
                    sb.AppendLine($"### #{i + 1} by {post.UserName}") |> ignore
                    sb.AppendLine() |> ignore
                    sb.AppendLine($"```") |> ignore
                    sb.AppendLine(post.Chords) |> ignore
                    sb.AppendLine($"```") |> ignore

                    if not (String.IsNullOrWhiteSpace(post.Comment)) then
                        sb.AppendLine() |> ignore
                        sb.AppendLine(post.Comment) |> ignore

                    sb.AppendLine() |> ignore)

                ctx.Response.ContentType <- "text/markdown; charset=utf-8"
                do! ctx.Response.WriteAsync(sb.ToString())
            | None ->
                ctx.Response.StatusCode <- 404
                do! ctx.Response.WriteAsJsonAsync({| error = "Thread not found" |})
        }
