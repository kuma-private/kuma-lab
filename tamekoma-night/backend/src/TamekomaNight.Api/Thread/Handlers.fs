namespace TamekomaNight.Api.Thread

open System
open System.Net.Http
open System.Security.Claims
open System.Text
open System.Threading.Tasks
open Microsoft.AspNetCore.Http
open Microsoft.Extensions.DependencyInjection
open TamekomaNight.Api
open TamekomaNight.Api.Thread.Models
open TamekomaNight.Api.Thread.Repository
open TamekomaNight.Api.Analysis

module ThreadHandlers =

    let private devMode = Config.devMode

    // --- Pure helper functions ---

    let private getUserInfo (ctx: HttpContext) : UserInfo =
        if devMode && (ctx.User = null || ctx.User.Identity = null || not ctx.User.Identity.IsAuthenticated) then
            { UserId = "dev-user"; UserName = "Dev User"; Email = "" }
        else
            let findClaim (claimType: string) defaultValue =
                ctx.User.FindFirst(claimType)
                |> Option.ofObj
                |> Option.map (fun c -> c.Value)
                |> Option.defaultValue defaultValue

            { UserId = findClaim ClaimTypes.NameIdentifier "anonymous"
              UserName = findClaim ClaimTypes.Name "Anonymous"
              Email = findClaim ClaimTypes.Email "" }

    let private getHttpClient (ctx: HttpContext) =
        ctx.RequestServices.GetRequiredService<IHttpClientFactory>().CreateClient("Anthropic")

    // --- HTTP response helpers ---

    let private respondJson (ctx: HttpContext) (statusCode: int) (body: obj) : Task =
        ctx.Response.StatusCode <- statusCode
        ctx.Response.WriteAsJsonAsync(body)

    let private respond404 ctx = respondJson ctx 404 {| error = "Thread not found" |}
    let private respond403 ctx msg = respondJson ctx 403 {| error = msg |}
    let private respond400 ctx msg = respondJson ctx 400 {| error = msg |}
    let private respond500 ctx msg = respondJson ctx 500 {| error = msg |}

    // --- Request parsing with Result type ---

    let private parseRequest<'T> (ctx: HttpContext) : Task<Result<'T, string>> =
        task {
            try
                let! req = ctx.Request.ReadFromJsonAsync<'T>()
                if obj.ReferenceEquals(req, null) then
                    return Error "Invalid request body"
                else
                    return Ok req
            with _ ->
                return Error "Invalid request body"
        }

    // --- Higher-order handler combinators ---

    /// Fetch thread + check access, then run handler. Handles 404/403 automatically.
    let private withThread
        (repo: IThreadRepository)
        (threadId: string)
        (ctx: HttpContext)
        (handler: Thread -> UserInfo -> Task)
        : Task =
        task {
            let! thread = repo.GetById(threadId)
            let user = getUserInfo ctx

            match thread with
            | None ->
                do! respond404 ctx
            | Some t when not (Repository.canAccessWithEmail user.UserId user.Email t) ->
                do! respond403 ctx "Access denied"
            | Some t ->
                do! handler t user
        }

    /// Fetch thread + check ownership, then run handler. Handles 404/403 automatically.
    let private withOwnerThread
        (repo: IThreadRepository)
        (threadId: string)
        (ctx: HttpContext)
        (errorMsg: string)
        (handler: Thread -> UserInfo -> Task)
        : Task =
        task {
            let! thread = repo.GetById(threadId)
            let user = getUserInfo ctx

            match thread with
            | None ->
                do! respond404 ctx
            | Some t when t.CreatedBy <> user.UserId ->
                do! respond403 ctx errorMsg
            | Some t ->
                do! handler t user
        }

    /// Parse request and run handler if valid, else return 400.
    let private withParsedRequest<'T>
        (ctx: HttpContext)
        (validate: 'T -> bool)
        (handler: 'T -> Task)
        : Task =
        task {
            let! result = parseRequest<'T> ctx
            match result with
            | Error msg ->
                do! respond400 ctx msg
            | Ok req when not (validate req) ->
                do! respond400 ctx "Invalid request body"
            | Ok req ->
                do! handler req
        }

    // --- Handlers ---

    let listThreads (repo: IThreadRepository) (ctx: HttpContext) : Task =
        task {
            let user = getUserInfo ctx
            let! threads = repo.GetByUser user.UserId user.Email

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
        withParsedRequest<CreateThreadRequest> ctx (fun req -> isNotNull req.title) (fun req ->
            task {
                let user = getUserInfo ctx

                let thread =
                    { Id = Guid.NewGuid().ToString("N")
                      Title = req.title
                      Key = "C Major"
                      TimeSignature = "4/4"
                      Bpm = 120
                      CreatedBy = user.UserId
                      CreatedByName = user.UserName
                      CreatedAt = DateTime.UtcNow
                      Score = ""
                      MidiData = ""
                      LastEditedBy = user.UserId
                      LastEditedAt = DateTime.UtcNow
                      Members = [ user.UserId ]
                      History = []
                      Visibility = "private"
                      SharedWith = [] }

                let! created = repo.Create(thread)
                do! respondJson ctx 201 {| id = created.Id |}
            })

    let deleteThread (repo: IThreadRepository) (threadId: string) (ctx: HttpContext) : Task =
        withOwnerThread repo threadId ctx "Only the owner can delete" (fun _ _ ->
            task {
                let! _ = repo.Delete(threadId)
                ctx.Response.StatusCode <- 204
            })

    let getThread (repo: IThreadRepository) (threadId: string) (ctx: HttpContext) : Task =
        withThread repo threadId ctx (fun t _ ->
            ctx.Response.WriteAsJsonAsync(t))

    let saveScore (repo: IThreadRepository) (threadId: string) (ctx: HttpContext) : Task =
        withThread repo threadId ctx (fun _ user ->
            withParsedRequest<SaveScoreRequest> ctx (fun req -> isNotNull req.score) (fun req ->
                task {
                    let midiData =
                        req.midiData |> defaultIfNull "" |> function "" -> None | v -> Some v

                    let history =
                        { UserId = user.UserId
                          UserName = user.UserName
                          Score = req.score
                          MidiData = midiData |> Option.defaultValue ""
                          Comment = req.comment
                          AiComment = ""
                          AiScores = ""
                          CreatedAt = DateTime.UtcNow }

                    let! result = repo.SaveScore threadId req.score midiData history

                    match result with
                    | Some updated -> do! ctx.Response.WriteAsJsonAsync(updated)
                    | None -> do! respond500 ctx "Failed to save score"
                }))

    let updateSettings (repo: IThreadRepository) (threadId: string) (ctx: HttpContext) : Task =
        withOwnerThread repo threadId ctx "Only the owner can update settings" (fun _ _ ->
            withParsedRequest<UpdateSettingsRequest> ctx (fun req -> isNotNull req.key) (fun req ->
                task {
                    let title = req.title |> defaultIfNull ""
                    let! result = repo.UpdateSettings threadId req.key req.timeSignature req.bpm title

                    match result with
                    | Some updated -> do! ctx.Response.WriteAsJsonAsync(updated)
                    | None -> do! respond500 ctx "Failed to update settings"
                }))

    let reviewScore (repo: IThreadRepository) (config: AppConfig) (threadId: string) (ctx: HttpContext) : Task =
        withThread repo threadId ctx (fun t user ->
            task {
                if String.IsNullOrEmpty(config.AnthropicApiKey) then
                    do! respond400 ctx "AI review is not configured"
                elif t.History.Length = 0 then
                    do! respond400 ctx "No history to review"
                else
                    let httpClient = getHttpClient ctx
                    let scoreLines = t.Score.Split('\n') |> Array.toList

                    let! result =
                        AnthropicClient.reviewTurn httpClient config.AnthropicApiKey t.Key t.TimeSignature t.Score scoreLines
                        |> Async.StartAsTask

                    match result with
                    | Ok r ->
                        let updatedHistory =
                            t.History
                            |> List.mapi (fun i h ->
                                if i = t.History.Length - 1 then
                                    { h with AiComment = r.Comment; AiScores = r.ScoresJson }
                                else h)

                        let! _ = repo.Update({ t with History = updatedHistory })
                        do! ctx.Response.WriteAsJsonAsync({| comment = r.Comment; scores = r.ScoresJson |})
                    | Error e ->
                        do! respond500 ctx $"AI review failed: {e}"
            })

    let transformChords (config: AppConfig) (threadId: string) (ctx: HttpContext) : Task =
        task {
            if String.IsNullOrEmpty(config.AnthropicApiKey) then
                do! respond400 ctx "AI transform is not configured"
            else

            do! withParsedRequest<TransformRequest> ctx
                    (fun req -> isNotNull req.selectedChords && isNotNull req.instruction)
                    (fun req ->
                        task {
                            let httpClient = getHttpClient ctx

                            let! result =
                                AnthropicClient.transformChords httpClient config.AnthropicApiKey req.key req.timeSignature req.fullScore req.selectedChords req.instruction
                                |> Async.StartAsTask

                            match result with
                            | Ok r ->
                                do! ctx.Response.WriteAsJsonAsync({| comment = r.comment; chords = r.chords |})
                            | Error e ->
                                do! respond500 ctx $"AI transform failed: {e}"
                        })
        }

    let importChordChart (config: AppConfig) (ctx: HttpContext) : Task =
        task {
            if String.IsNullOrEmpty(config.AnthropicApiKey) then
                do! respond400 ctx "AI import is not configured"
            else

            do! withParsedRequest<ImportChordChartRequest> ctx
                    (fun req -> isNotNull req.images && not req.images.IsEmpty)
                    (fun req ->
                        task {
                            let httpClient = getHttpClient ctx
                            let images = req.images |> List.map parseDataUri

                            let songName = req.songName |> defaultIfNull ""
                            let artist = req.artist |> defaultIfNull ""
                            let sourceUrl = req.sourceUrl |> defaultIfNull ""
                            let timeSignature = req.timeSignature |> defaultIfNull "4/4"
                            let key = req.key |> defaultIfNull ""

                            let! result =
                                AnthropicClient.importChordChart httpClient config.AnthropicApiKey images songName artist sourceUrl req.bpm timeSignature key
                                |> Async.StartAsTask

                            match result with
                            | Ok chords ->
                                do! ctx.Response.WriteAsJsonAsync({| chords = chords |})
                            | Error e ->
                                do! respond500 ctx $"AI import failed: {e}"
                        })
        }

    let getHistory (repo: IThreadRepository) (threadId: string) (ctx: HttpContext) : Task =
        withThread repo threadId ctx (fun t _ ->
            ctx.Response.WriteAsJsonAsync(t.History))

    let exportThread (repo: IThreadRepository) (threadId: string) (ctx: HttpContext) : Task =
        withThread repo threadId ctx (fun t _ ->
            task {
                let markdown =
                    [ $"# {t.Title}"
                      ""
                      $"- Key: {t.Key}"
                      $"- Time Signature: {t.TimeSignature}"
                      $"- BPM: {t.Bpm}"
                      ""
                      "## Score"
                      ""
                      "```"
                      t.Score
                      "```" ]
                    |> String.concat Environment.NewLine

                ctx.Response.ContentType <- "text/markdown; charset=utf-8"
                do! ctx.Response.WriteAsync(markdown + Environment.NewLine)
            })

    let shareThread (repo: IThreadRepository) (threadId: string) (ctx: HttpContext) : Task =
        withOwnerThread repo threadId ctx "Only the owner can share" (fun _ _ ->
            withParsedRequest<ShareRequest> ctx (fun req -> isNotNull req.visibility) (fun req ->
                task {
                    let sharedWith = if obj.ReferenceEquals(req.sharedWith, null) then [] else req.sharedWith
                    let! result = repo.UpdateShare threadId req.visibility sharedWith

                    match result with
                    | Some updated -> do! ctx.Response.WriteAsJsonAsync(updated)
                    | None -> do! respond500 ctx "Failed to update share settings"
                }))

    let addComment (repo: IThreadRepository) (threadId: string) (ctx: HttpContext) : Task =
        withThread repo threadId ctx (fun _ user ->
            withParsedRequest<AddCommentRequest> ctx (fun req -> isNotNull req.text) (fun req ->
                task {
                    let comment: Comment =
                        { Id = Guid.NewGuid().ToString("N")
                          UserId = user.UserId
                          UserName = user.UserName
                          Text = req.text
                          AnchorType = req.anchorType |> defaultIfNull "global"
                          AnchorStart = req.anchorStart
                          AnchorEnd = req.anchorEnd
                          AnchorSnapshot = req.anchorSnapshot |> defaultIfNull ""
                          CreatedAt = DateTime.UtcNow }

                    let! created = repo.AddComment threadId comment
                    do! respondJson ctx 201 created
                }))

    let listComments (repo: IThreadRepository) (threadId: string) (ctx: HttpContext) : Task =
        withThread repo threadId ctx (fun _ _ ->
            task {
                let! comments = repo.GetComments threadId
                do! ctx.Response.WriteAsJsonAsync(comments)
            })

    let deleteComment (repo: IThreadRepository) (threadId: string) (commentId: string) (ctx: HttpContext) : Task =
        withThread repo threadId ctx (fun t user ->
            task {
                let! comments = repo.GetComments threadId
                let commentOpt = comments |> List.tryFind (fun c -> c.Id = commentId)

                match commentOpt with
                | None ->
                    do! respond404 ctx
                | Some c when c.UserId <> user.UserId && t.CreatedBy <> user.UserId ->
                    do! respond403 ctx "Only comment author or thread owner can delete"
                | Some _ ->
                    let! _ = repo.DeleteComment threadId commentId
                    ctx.Response.StatusCode <- 204
            })

    let addAnnotation (repo: IThreadRepository) (threadId: string) (ctx: HttpContext) : Task =
        withThread repo threadId ctx (fun _ user ->
            withParsedRequest<AddAnnotationRequest> ctx (fun req -> isNotNull req.annotationType) (fun req ->
                task {
                    let annotation: Annotation =
                        { Id = Guid.NewGuid().ToString("N")
                          UserId = user.UserId
                          UserName = user.UserName
                          Type = req.annotationType
                          StartBar = req.startBar
                          EndBar = req.endBar
                          Snapshot = req.snapshot |> defaultIfNull ""
                          Emoji = req.emoji |> defaultIfNull ""
                          AiComment = ""
                          CreatedAt = DateTime.UtcNow }

                    let! created = repo.AddAnnotation threadId annotation
                    do! respondJson ctx 201 created
                }))

    let listAnnotations (repo: IThreadRepository) (threadId: string) (ctx: HttpContext) : Task =
        withThread repo threadId ctx (fun _ _ ->
            task {
                let! annotations = repo.GetAnnotations threadId
                do! ctx.Response.WriteAsJsonAsync(annotations)
            })

    let deleteAnnotation (repo: IThreadRepository) (threadId: string) (annotationId: string) (ctx: HttpContext) : Task =
        withThread repo threadId ctx (fun _ user ->
            task {
                let! annotations = repo.GetAnnotations threadId
                let annotationOpt = annotations |> List.tryFind (fun a -> a.Id = annotationId)

                match annotationOpt with
                | None ->
                    do! respond404 ctx
                | Some a when a.UserId <> user.UserId ->
                    do! respond403 ctx "Only annotation author can delete"
                | Some _ ->
                    let! _ = repo.DeleteAnnotation threadId annotationId
                    ctx.Response.StatusCode <- 204
            })

    let analyzeSelection (repo: IThreadRepository) (config: AppConfig) (threadId: string) (ctx: HttpContext) : Task =
        withThread repo threadId ctx (fun _ user ->
            task {
                if String.IsNullOrEmpty(config.AnthropicApiKey) then
                    do! respond400 ctx "AI analysis is not configured"
                else

                do! withParsedRequest<AnalyzeSelectionRequest> ctx
                        (fun req -> isNotNull req.selectedChords)
                        (fun req ->
                            task {
                                let httpClient = getHttpClient ctx

                                let! result =
                                    AnthropicClient.analyzeSelection httpClient config.AnthropicApiKey req.selectedChords req.fullScore req.key req.timeSignature
                                    |> Async.StartAsTask

                                match result with
                                | Ok aiComment ->
                                    let annotation: Annotation =
                                        { Id = Guid.NewGuid().ToString("N")
                                          UserId = user.UserId
                                          UserName = user.UserName
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
                                    do! respond500 ctx $"AI analysis failed: {e}"
                            })
            })
