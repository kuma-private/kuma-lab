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
            let (userId, _) = getUserInfo ctx
            let! threads = repo.GetByUser(userId)

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
                       memberCount = t.Members.Length
                       visibility = t.Visibility |})

            do! ctx.Response.WriteAsJsonAsync(result)
        }

    let createThread (repo: IThreadRepository) (ctx: HttpContext) : Task =
        task {
            let! req =
                try
                    ctx.Request.ReadFromJsonAsync<CreateThreadRequest>()
                with _ ->
                    ValueTask<CreateThreadRequest>(Unchecked.defaultof<CreateThreadRequest>)

            if obj.ReferenceEquals(req, null) || obj.ReferenceEquals(req.title, null) then
                ctx.Response.StatusCode <- 400
                do! ctx.Response.WriteAsJsonAsync({| error = "Invalid request body" |})
            else

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
                  History = []
                  Visibility = "private"
                  SharedWith = [] }

            let! created = repo.Create(thread)

            ctx.Response.StatusCode <- 201
            do! ctx.Response.WriteAsJsonAsync({| id = created.Id |})
        }

    let deleteThread (repo: IThreadRepository) (threadId: string) (ctx: HttpContext) : Task =
        task {
            let! thread = repo.GetById(threadId)
            let (userId, _) = getUserInfo ctx

            match thread with
            | Some t when t.CreatedBy = userId ->
                let! _ = repo.Delete(threadId)
                ctx.Response.StatusCode <- 204
            | Some _ ->
                ctx.Response.StatusCode <- 403
                do! ctx.Response.WriteAsJsonAsync({| error = "Only the owner can delete" |})
            | None ->
                ctx.Response.StatusCode <- 404
                do! ctx.Response.WriteAsJsonAsync({| error = "Thread not found" |})
        }

    let getThread (repo: IThreadRepository) (threadId: string) (ctx: HttpContext) : Task =
        task {
            let! thread = repo.GetById(threadId)
            let (userId, _) = getUserInfo ctx

            match thread with
            | Some t when Repository.canAccess userId t ->
                do! ctx.Response.WriteAsJsonAsync(t)
            | Some _ ->
                ctx.Response.StatusCode <- 403
                do! ctx.Response.WriteAsJsonAsync({| error = "Access denied" |})
            | None ->
                ctx.Response.StatusCode <- 404
                do! ctx.Response.WriteAsJsonAsync({| error = "Thread not found" |})
        }

    let saveScore (repo: IThreadRepository) (threadId: string) (ctx: HttpContext) : Task =
        task {
            let! thread = repo.GetById(threadId)
            let (userId, userName) = getUserInfo ctx

            match thread with
            | None ->
                ctx.Response.StatusCode <- 404
                do! ctx.Response.WriteAsJsonAsync({| error = "Thread not found" |})
            | Some t when not (Repository.canAccess userId t) ->
                ctx.Response.StatusCode <- 403
                do! ctx.Response.WriteAsJsonAsync({| error = "Access denied" |})
            | Some _ ->
                let! req =
                    try
                        ctx.Request.ReadFromJsonAsync<SaveScoreRequest>()
                    with _ ->
                        ValueTask<SaveScoreRequest>(Unchecked.defaultof<SaveScoreRequest>)

                if obj.ReferenceEquals(req, null) || obj.ReferenceEquals(req.score, null) then
                    ctx.Response.StatusCode <- 400
                    do! ctx.Response.WriteAsJsonAsync({| error = "Invalid request body" |})
                else

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
            let (userId, _) = getUserInfo ctx

            match thread with
            | None ->
                ctx.Response.StatusCode <- 404
                do! ctx.Response.WriteAsJsonAsync({| error = "Thread not found" |})
            | Some t when t.CreatedBy <> userId ->
                ctx.Response.StatusCode <- 403
                do! ctx.Response.WriteAsJsonAsync({| error = "Only the owner can update settings" |})
            | Some _ ->
                let! req =
                    try
                        ctx.Request.ReadFromJsonAsync<UpdateSettingsRequest>()
                    with _ ->
                        ValueTask<UpdateSettingsRequest>(Unchecked.defaultof<UpdateSettingsRequest>)

                if obj.ReferenceEquals(req, null) || obj.ReferenceEquals(req.key, null) then
                    ctx.Response.StatusCode <- 400
                    do! ctx.Response.WriteAsJsonAsync({| error = "Invalid request body" |})
                    return ()

                let title = if obj.ReferenceEquals(req.title, null) then "" else req.title
                let! result = repo.UpdateSettings threadId req.key req.timeSignature req.bpm title

                match result with
                | Some updated -> do! ctx.Response.WriteAsJsonAsync(updated)
                | None ->
                    ctx.Response.StatusCode <- 500
                    do! ctx.Response.WriteAsJsonAsync({| error = "Failed to update settings" |})
        }

    let reviewScore (repo: IThreadRepository) (config: AppConfig) (threadId: string) (ctx: HttpContext) : Task =
        task {
            let! thread = repo.GetById(threadId)
            let (userId, _) = getUserInfo ctx

            match thread with
            | None ->
                ctx.Response.StatusCode <- 404
                do! ctx.Response.WriteAsJsonAsync({| error = "Thread not found" |})
            | Some t when not (Repository.canAccess userId t) ->
                ctx.Response.StatusCode <- 403
                do! ctx.Response.WriteAsJsonAsync({| error = "Access denied" |})
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
                        AnthropicClient.reviewTurn httpClient config.AnthropicApiKey t.Key t.TimeSignature t.Score scoreLines
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

    let transformChords (config: AppConfig) (threadId: string) (ctx: HttpContext) : Task =
        task {
            if String.IsNullOrEmpty(config.AnthropicApiKey) then
                ctx.Response.StatusCode <- 400
                do! ctx.Response.WriteAsJsonAsync({| error = "AI transform is not configured" |})
            else

            let! req =
                try
                    ctx.Request.ReadFromJsonAsync<TransformRequest>()
                with _ ->
                    ValueTask<TransformRequest>(Unchecked.defaultof<TransformRequest>)

            if obj.ReferenceEquals(req, null) || obj.ReferenceEquals(req.selectedChords, null) || obj.ReferenceEquals(req.instruction, null) then
                ctx.Response.StatusCode <- 400
                do! ctx.Response.WriteAsJsonAsync({| error = "Invalid request body" |})
            else

            let httpClient = getHttpClient ctx
            let! result =
                AnthropicClient.transformChords httpClient config.AnthropicApiKey req.key req.timeSignature req.fullScore req.selectedChords req.instruction
                |> Async.StartAsTask

            match result with
            | Ok r ->
                do! ctx.Response.WriteAsJsonAsync({| comment = r.comment; chords = r.chords |})
            | Error e ->
                ctx.Response.StatusCode <- 500
                do! ctx.Response.WriteAsJsonAsync({| error = $"AI transform failed: {e}" |})
        }

    let importChordChart (config: AppConfig) (ctx: HttpContext) : Task =
        task {
            if String.IsNullOrEmpty(config.AnthropicApiKey) then
                ctx.Response.StatusCode <- 400
                do! ctx.Response.WriteAsJsonAsync({| error = "AI import is not configured" |})
            else

            let! req =
                try
                    ctx.Request.ReadFromJsonAsync<ImportChordChartRequest>()
                with _ ->
                    ValueTask<ImportChordChartRequest>(Unchecked.defaultof<ImportChordChartRequest>)

            if obj.ReferenceEquals(req, null) || obj.ReferenceEquals(req.images, null) || req.images.IsEmpty then
                ctx.Response.StatusCode <- 400
                do! ctx.Response.WriteAsJsonAsync({| error = "At least one image is required" |})
            else

            let httpClient = getHttpClient ctx

            let parseDataUri (dataUri: string) =
                if dataUri.Contains(",") then
                    let prefix = dataUri.Substring(0, dataUri.IndexOf(","))
                    let data = dataUri.Substring(dataUri.IndexOf(",") + 1)
                    let mediaType =
                        if prefix.Contains("image/jpeg") then "image/jpeg"
                        elif prefix.Contains("image/webp") then "image/webp"
                        elif prefix.Contains("image/gif") then "image/gif"
                        else "image/png"
                    (mediaType, data)
                else
                    ("image/png", dataUri)

            let images = req.images |> List.map parseDataUri

            let songName = if obj.ReferenceEquals(req.songName, null) then "" else req.songName
            let artist = if obj.ReferenceEquals(req.artist, null) then "" else req.artist
            let sourceUrl = if obj.ReferenceEquals(req.sourceUrl, null) then "" else req.sourceUrl
            let timeSignature = if obj.ReferenceEquals(req.timeSignature, null) then "4/4" else req.timeSignature
            let key = if obj.ReferenceEquals(req.key, null) then "" else req.key

            let! result =
                AnthropicClient.importChordChart httpClient config.AnthropicApiKey images songName artist sourceUrl req.bpm timeSignature key
                |> Async.StartAsTask

            match result with
            | Ok chords ->
                do! ctx.Response.WriteAsJsonAsync({| chords = chords |})
            | Error e ->
                ctx.Response.StatusCode <- 500
                do! ctx.Response.WriteAsJsonAsync({| error = $"AI import failed: {e}" |})
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

    let shareThread (repo: IThreadRepository) (threadId: string) (ctx: HttpContext) : Task =
        task {
            let! thread = repo.GetById(threadId)
            let (userId, _) = getUserInfo ctx

            match thread with
            | None ->
                ctx.Response.StatusCode <- 404
                do! ctx.Response.WriteAsJsonAsync({| error = "Thread not found" |})
            | Some t when t.CreatedBy <> userId ->
                ctx.Response.StatusCode <- 403
                do! ctx.Response.WriteAsJsonAsync({| error = "Only the owner can share" |})
            | Some _ ->
                let! req =
                    try
                        ctx.Request.ReadFromJsonAsync<ShareRequest>()
                    with _ ->
                        ValueTask<ShareRequest>(Unchecked.defaultof<ShareRequest>)

                if obj.ReferenceEquals(req, null) || obj.ReferenceEquals(req.visibility, null) then
                    ctx.Response.StatusCode <- 400
                    do! ctx.Response.WriteAsJsonAsync({| error = "Invalid request body" |})
                else

                let sharedWith = if obj.ReferenceEquals(req.sharedWith, null) then [] else req.sharedWith
                let! result = repo.UpdateShare threadId req.visibility sharedWith

                match result with
                | Some updated -> do! ctx.Response.WriteAsJsonAsync(updated)
                | None ->
                    ctx.Response.StatusCode <- 500
                    do! ctx.Response.WriteAsJsonAsync({| error = "Failed to update share settings" |})
        }

    let addComment (repo: IThreadRepository) (threadId: string) (ctx: HttpContext) : Task =
        task {
            let! thread = repo.GetById(threadId)
            let (userId, userName) = getUserInfo ctx

            match thread with
            | None ->
                ctx.Response.StatusCode <- 404
                do! ctx.Response.WriteAsJsonAsync({| error = "Thread not found" |})
            | Some t when not (Repository.canAccess userId t) ->
                ctx.Response.StatusCode <- 403
                do! ctx.Response.WriteAsJsonAsync({| error = "Access denied" |})
            | Some _ ->
                let! req =
                    try
                        ctx.Request.ReadFromJsonAsync<AddCommentRequest>()
                    with _ ->
                        ValueTask<AddCommentRequest>(Unchecked.defaultof<AddCommentRequest>)

                if obj.ReferenceEquals(req, null) || obj.ReferenceEquals(req.text, null) then
                    ctx.Response.StatusCode <- 400
                    do! ctx.Response.WriteAsJsonAsync({| error = "Invalid request body" |})
                else

                let comment: Comment =
                    { Id = Guid.NewGuid().ToString("N")
                      UserId = userId
                      UserName = userName
                      Text = req.text
                      AnchorType = if obj.ReferenceEquals(req.anchorType, null) then "global" else req.anchorType
                      AnchorStart = req.anchorStart
                      AnchorEnd = req.anchorEnd
                      AnchorSnapshot = if obj.ReferenceEquals(req.anchorSnapshot, null) then "" else req.anchorSnapshot
                      CreatedAt = DateTime.UtcNow }

                let! created = repo.AddComment threadId comment
                ctx.Response.StatusCode <- 201
                do! ctx.Response.WriteAsJsonAsync(created)
        }

    let listComments (repo: IThreadRepository) (threadId: string) (ctx: HttpContext) : Task =
        task {
            let! thread = repo.GetById(threadId)
            let (userId, _) = getUserInfo ctx

            match thread with
            | None ->
                ctx.Response.StatusCode <- 404
                do! ctx.Response.WriteAsJsonAsync({| error = "Thread not found" |})
            | Some t when not (Repository.canAccess userId t) ->
                ctx.Response.StatusCode <- 403
                do! ctx.Response.WriteAsJsonAsync({| error = "Access denied" |})
            | Some _ ->
                let! comments = repo.GetComments threadId
                do! ctx.Response.WriteAsJsonAsync(comments)
        }

    let deleteComment (repo: IThreadRepository) (threadId: string) (commentId: string) (ctx: HttpContext) : Task =
        task {
            let! thread = repo.GetById(threadId)
            let (userId, _) = getUserInfo ctx

            match thread with
            | None ->
                ctx.Response.StatusCode <- 404
                do! ctx.Response.WriteAsJsonAsync({| error = "Thread not found" |})
            | Some t when not (Repository.canAccess userId t) ->
                ctx.Response.StatusCode <- 403
                do! ctx.Response.WriteAsJsonAsync({| error = "Access denied" |})
            | Some t ->
                let! comments = repo.GetComments threadId
                let commentOpt = comments |> List.tryFind (fun c -> c.Id = commentId)

                match commentOpt with
                | None ->
                    ctx.Response.StatusCode <- 404
                    do! ctx.Response.WriteAsJsonAsync({| error = "Comment not found" |})
                | Some c when c.UserId <> userId && t.CreatedBy <> userId ->
                    ctx.Response.StatusCode <- 403
                    do! ctx.Response.WriteAsJsonAsync({| error = "Only comment author or thread owner can delete" |})
                | Some _ ->
                    let! _ = repo.DeleteComment threadId commentId
                    ctx.Response.StatusCode <- 204
        }

    let addAnnotation (repo: IThreadRepository) (threadId: string) (ctx: HttpContext) : Task =
        task {
            let! thread = repo.GetById(threadId)
            let (userId, userName) = getUserInfo ctx

            match thread with
            | None ->
                ctx.Response.StatusCode <- 404
                do! ctx.Response.WriteAsJsonAsync({| error = "Thread not found" |})
            | Some t when not (Repository.canAccess userId t) ->
                ctx.Response.StatusCode <- 403
                do! ctx.Response.WriteAsJsonAsync({| error = "Access denied" |})
            | Some _ ->
                let! req =
                    try
                        ctx.Request.ReadFromJsonAsync<AddAnnotationRequest>()
                    with _ ->
                        ValueTask<AddAnnotationRequest>(Unchecked.defaultof<AddAnnotationRequest>)

                if obj.ReferenceEquals(req, null) || obj.ReferenceEquals(req.annotationType, null) then
                    ctx.Response.StatusCode <- 400
                    do! ctx.Response.WriteAsJsonAsync({| error = "Invalid request body" |})
                else

                let annotation: Annotation =
                    { Id = Guid.NewGuid().ToString("N")
                      UserId = userId
                      UserName = userName
                      Type = req.annotationType
                      StartBar = req.startBar
                      EndBar = req.endBar
                      Snapshot = if obj.ReferenceEquals(req.snapshot, null) then "" else req.snapshot
                      Emoji = if obj.ReferenceEquals(req.emoji, null) then "" else req.emoji
                      AiComment = ""
                      CreatedAt = DateTime.UtcNow }

                let! created = repo.AddAnnotation threadId annotation
                ctx.Response.StatusCode <- 201
                do! ctx.Response.WriteAsJsonAsync(created)
        }

    let listAnnotations (repo: IThreadRepository) (threadId: string) (ctx: HttpContext) : Task =
        task {
            let! thread = repo.GetById(threadId)
            let (userId, _) = getUserInfo ctx

            match thread with
            | None ->
                ctx.Response.StatusCode <- 404
                do! ctx.Response.WriteAsJsonAsync({| error = "Thread not found" |})
            | Some t when not (Repository.canAccess userId t) ->
                ctx.Response.StatusCode <- 403
                do! ctx.Response.WriteAsJsonAsync({| error = "Access denied" |})
            | Some _ ->
                let! annotations = repo.GetAnnotations threadId
                do! ctx.Response.WriteAsJsonAsync(annotations)
        }

    let deleteAnnotation (repo: IThreadRepository) (threadId: string) (annotationId: string) (ctx: HttpContext) : Task =
        task {
            let! thread = repo.GetById(threadId)
            let (userId, _) = getUserInfo ctx

            match thread with
            | None ->
                ctx.Response.StatusCode <- 404
                do! ctx.Response.WriteAsJsonAsync({| error = "Thread not found" |})
            | Some t when not (Repository.canAccess userId t) ->
                ctx.Response.StatusCode <- 403
                do! ctx.Response.WriteAsJsonAsync({| error = "Access denied" |})
            | Some _ ->
                let! annotations = repo.GetAnnotations threadId
                let annotationOpt = annotations |> List.tryFind (fun a -> a.Id = annotationId)

                match annotationOpt with
                | None ->
                    ctx.Response.StatusCode <- 404
                    do! ctx.Response.WriteAsJsonAsync({| error = "Annotation not found" |})
                | Some a when a.UserId <> userId ->
                    ctx.Response.StatusCode <- 403
                    do! ctx.Response.WriteAsJsonAsync({| error = "Only annotation author can delete" |})
                | Some _ ->
                    let! _ = repo.DeleteAnnotation threadId annotationId
                    ctx.Response.StatusCode <- 204
        }

    let analyzeSelection (repo: IThreadRepository) (config: AppConfig) (threadId: string) (ctx: HttpContext) : Task =
        task {
            let! thread = repo.GetById(threadId)
            let (userId, userName) = getUserInfo ctx

            match thread with
            | None ->
                ctx.Response.StatusCode <- 404
                do! ctx.Response.WriteAsJsonAsync({| error = "Thread not found" |})
            | Some t when not (Repository.canAccess userId t) ->
                ctx.Response.StatusCode <- 403
                do! ctx.Response.WriteAsJsonAsync({| error = "Access denied" |})
            | Some _ ->
                if String.IsNullOrEmpty(config.AnthropicApiKey) then
                    ctx.Response.StatusCode <- 400
                    do! ctx.Response.WriteAsJsonAsync({| error = "AI analysis is not configured" |})
                else

                let! req =
                    try
                        ctx.Request.ReadFromJsonAsync<AnalyzeSelectionRequest>()
                    with _ ->
                        ValueTask<AnalyzeSelectionRequest>(Unchecked.defaultof<AnalyzeSelectionRequest>)

                if obj.ReferenceEquals(req, null) || obj.ReferenceEquals(req.selectedChords, null) then
                    ctx.Response.StatusCode <- 400
                    do! ctx.Response.WriteAsJsonAsync({| error = "Invalid request body" |})
                else

                let httpClient = getHttpClient ctx
                let! result =
                    AnthropicClient.analyzeSelection httpClient config.AnthropicApiKey req.selectedChords req.fullScore req.key req.timeSignature
                    |> Async.StartAsTask

                match result with
                | Ok aiComment ->
                    let annotation: Annotation =
                        { Id = Guid.NewGuid().ToString("N")
                          UserId = userId
                          UserName = userName
                          Type = "ai_analysis"
                          StartBar = 0
                          EndBar = 0
                          Snapshot = req.selectedChords
                          Emoji = ""
                          AiComment = aiComment
                          CreatedAt = DateTime.UtcNow }

                    let! created = repo.AddAnnotation threadId annotation
                    do! ctx.Response.WriteAsJsonAsync(created)
                | Error e ->
                    ctx.Response.StatusCode <- 500
                    do! ctx.Response.WriteAsJsonAsync({| error = $"AI analysis failed: {e}" |})
        }
