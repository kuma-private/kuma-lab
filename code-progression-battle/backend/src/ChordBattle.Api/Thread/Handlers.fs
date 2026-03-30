namespace ChordBattle.Api.Thread

open System
open System.Security.Claims
open System.Text
open System.Threading.Tasks
open Microsoft.AspNetCore.Http
open ChordBattle.Api.Thread.Models
open ChordBattle.Api.Thread.Repository

module ThreadHandlers =

    let private devMode =
        match Environment.GetEnvironmentVariable("DEV_MODE") with
        | "true" | "1" -> true
        | _ -> false

    let private getUserInfo (ctx: HttpContext) =
        if devMode && (ctx.User = null || ctx.User.Identity = null || not ctx.User.Identity.IsAuthenticated) then
            ("dev-user", "Dev User", "dev@example.com")
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

            let email =
                ctx.User.FindFirst(ClaimTypes.Email)
                |> Option.ofObj
                |> Option.map (fun c -> c.Value)
                |> Option.defaultValue ""

            (userId, userName, email)

    let private getOpponentId (thread: Thread) (userId: string) =
        if userId = thread.CreatedBy then thread.OpponentId
        else thread.CreatedBy

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
                       opponentName = t.OpponentName
                       createdAt = t.CreatedAt
                       status = t.Status
                       currentTurn = t.CurrentTurn
                       lineCount = t.Lines.Length |})

            do! ctx.Response.WriteAsJsonAsync(result)
        }

    let createThread (repo: IThreadRepository) (ctx: HttpContext) : Task =
        task {
            let! req = ctx.Request.ReadFromJsonAsync<CreateThreadRequest>()
            let (userId, userName, _email) = getUserInfo ctx

            let thread =
                { Id = Guid.NewGuid().ToString("N")
                  Title = req.title
                  Key = req.key
                  TimeSignature = req.timeSignature
                  Bpm = req.bpm
                  CreatedBy = userId
                  CreatedByName = userName
                  OpponentId = ""
                  OpponentName = ""
                  OpponentEmail = req.opponentEmail
                  CreatedAt = DateTime.UtcNow
                  Status = "waiting"
                  CurrentTurn = userId
                  TurnCount = 0
                  FinishProposedBy = ""
                  Lines = []
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

    let joinThread (repo: IThreadRepository) (threadId: string) (ctx: HttpContext) : Task =
        task {
            let! thread = repo.GetById(threadId)

            match thread with
            | None ->
                ctx.Response.StatusCode <- 404
                do! ctx.Response.WriteAsJsonAsync({| error = "Thread not found" |})
            | Some t ->
                if t.Status <> "waiting" then
                    ctx.Response.StatusCode <- 400
                    do! ctx.Response.WriteAsJsonAsync({| error = "Thread is not waiting for opponent" |})
                else
                    let (userId, userName, email) = getUserInfo ctx

                    if not devMode && email <> t.OpponentEmail then
                        ctx.Response.StatusCode <- 403
                        do! ctx.Response.WriteAsJsonAsync({| error = "Email does not match invitation" |})
                    else
                        let! result = repo.JoinThread threadId userId userName

                        match result with
                        | Some updated -> do! ctx.Response.WriteAsJsonAsync(updated)
                        | None ->
                            ctx.Response.StatusCode <- 500
                            do! ctx.Response.WriteAsJsonAsync({| error = "Failed to join thread" |})
        }

    let executeTurn (repo: IThreadRepository) (threadId: string) (ctx: HttpContext) : Task =
        task {
            let! thread = repo.GetById(threadId)

            match thread with
            | None ->
                ctx.Response.StatusCode <- 404
                do! ctx.Response.WriteAsJsonAsync({| error = "Thread not found" |})
            | Some t ->
                if t.Status <> "active" then
                    ctx.Response.StatusCode <- 403
                    do! ctx.Response.WriteAsJsonAsync({| error = "Game is not active" |})
                else
                    let (userId, userName, _email) = getUserInfo ctx

                    if t.CurrentTurn <> userId then
                        ctx.Response.StatusCode <- 403
                        do! ctx.Response.WriteAsJsonAsync({| error = "Not your turn" |})
                    else
                        let! req = ctx.Request.ReadFromJsonAsync<TurnRequest>()
                        let nextTurn = getOpponentId t userId

                        match req.action with
                        | "add" ->
                            if String.IsNullOrWhiteSpace(req.chords) then
                                ctx.Response.StatusCode <- 400
                                do! ctx.Response.WriteAsJsonAsync({| error = "chords is required for add" |})
                            else
                                let newLineNumber = t.Lines.Length + 1
                                let newLine =
                                    { LineNumber = newLineNumber
                                      Chords = req.chords
                                      AddedBy = userId
                                      AddedByName = userName
                                      LastEditedBy = userId }
                                let updatedLines = t.Lines @ [ newLine ]
                                let action =
                                    { TurnNumber = t.TurnCount + 1
                                      UserId = userId
                                      UserName = userName
                                      Action = "add"
                                      LineNumber = newLineNumber
                                      Chords = req.chords
                                      PreviousChords = ""
                                      Comment = req.comment
                                      CreatedAt = DateTime.UtcNow }

                                let! result = repo.ExecuteTurn threadId action updatedLines nextTurn
                                match result with
                                | Some updated -> do! ctx.Response.WriteAsJsonAsync(updated)
                                | None ->
                                    ctx.Response.StatusCode <- 500
                                    do! ctx.Response.WriteAsJsonAsync({| error = "Failed to execute turn" |})

                        | "edit" ->
                            if req.lineNumber < 1 || req.lineNumber > t.Lines.Length then
                                ctx.Response.StatusCode <- 400
                                do! ctx.Response.WriteAsJsonAsync({| error = "Invalid lineNumber" |})
                            elif String.IsNullOrWhiteSpace(req.chords) then
                                ctx.Response.StatusCode <- 400
                                do! ctx.Response.WriteAsJsonAsync({| error = "chords is required for edit" |})
                            else
                                let targetLine = t.Lines.[req.lineNumber - 1]
                                let updatedLines =
                                    t.Lines
                                    |> List.mapi (fun i line ->
                                        if i = req.lineNumber - 1 then
                                            { line with Chords = req.chords; LastEditedBy = userId }
                                        else line)
                                let action =
                                    { TurnNumber = t.TurnCount + 1
                                      UserId = userId
                                      UserName = userName
                                      Action = "edit"
                                      LineNumber = req.lineNumber
                                      Chords = req.chords
                                      PreviousChords = targetLine.Chords
                                      Comment = req.comment
                                      CreatedAt = DateTime.UtcNow }

                                let! result = repo.ExecuteTurn threadId action updatedLines nextTurn
                                match result with
                                | Some updated -> do! ctx.Response.WriteAsJsonAsync(updated)
                                | None ->
                                    ctx.Response.StatusCode <- 500
                                    do! ctx.Response.WriteAsJsonAsync({| error = "Failed to execute turn" |})

                        | "delete" ->
                            if req.lineNumber < 1 || req.lineNumber > t.Lines.Length then
                                ctx.Response.StatusCode <- 400
                                do! ctx.Response.WriteAsJsonAsync({| error = "Invalid lineNumber" |})
                            else
                                let targetLine = t.Lines.[req.lineNumber - 1]
                                let updatedLines =
                                    t.Lines
                                    |> List.filter (fun line -> line.LineNumber <> req.lineNumber)
                                    |> List.mapi (fun i line -> { line with LineNumber = i + 1 })
                                let action =
                                    { TurnNumber = t.TurnCount + 1
                                      UserId = userId
                                      UserName = userName
                                      Action = "delete"
                                      LineNumber = req.lineNumber
                                      Chords = ""
                                      PreviousChords = targetLine.Chords
                                      Comment = req.comment
                                      CreatedAt = DateTime.UtcNow }

                                let! result = repo.ExecuteTurn threadId action updatedLines nextTurn
                                match result with
                                | Some updated -> do! ctx.Response.WriteAsJsonAsync(updated)
                                | None ->
                                    ctx.Response.StatusCode <- 500
                                    do! ctx.Response.WriteAsJsonAsync({| error = "Failed to execute turn" |})

                        | _ ->
                            ctx.Response.StatusCode <- 400
                            do! ctx.Response.WriteAsJsonAsync({| error = "Invalid action. Must be add, edit, or delete" |})
        }

    let proposeFinish (repo: IThreadRepository) (threadId: string) (ctx: HttpContext) : Task =
        task {
            let! thread = repo.GetById(threadId)

            match thread with
            | None ->
                ctx.Response.StatusCode <- 404
                do! ctx.Response.WriteAsJsonAsync({| error = "Thread not found" |})
            | Some t ->
                if t.Status <> "active" then
                    ctx.Response.StatusCode <- 403
                    do! ctx.Response.WriteAsJsonAsync({| error = "Game is not active" |})
                else
                    let (userId, _userName, _email) = getUserInfo ctx

                    if t.CurrentTurn <> userId then
                        ctx.Response.StatusCode <- 403
                        do! ctx.Response.WriteAsJsonAsync({| error = "Not your turn" |})
                    else
                        let nextTurn = getOpponentId t userId
                        let! result = repo.ProposeFinish threadId userId nextTurn

                        match result with
                        | Some updated -> do! ctx.Response.WriteAsJsonAsync(updated)
                        | None ->
                            ctx.Response.StatusCode <- 500
                            do! ctx.Response.WriteAsJsonAsync({| error = "Failed to propose finish" |})
        }

    let acceptFinish (repo: IThreadRepository) (threadId: string) (ctx: HttpContext) : Task =
        task {
            let! thread = repo.GetById(threadId)

            match thread with
            | None ->
                ctx.Response.StatusCode <- 404
                do! ctx.Response.WriteAsJsonAsync({| error = "Thread not found" |})
            | Some t ->
                if t.Status <> "finish_proposed" then
                    ctx.Response.StatusCode <- 403
                    do! ctx.Response.WriteAsJsonAsync({| error = "No finish proposal pending" |})
                else
                    let (userId, _userName, _email) = getUserInfo ctx

                    if t.FinishProposedBy = userId then
                        ctx.Response.StatusCode <- 403
                        do! ctx.Response.WriteAsJsonAsync({| error = "Cannot accept your own proposal" |})
                    else
                        let! result = repo.AcceptFinish threadId

                        match result with
                        | Some updated -> do! ctx.Response.WriteAsJsonAsync(updated)
                        | None ->
                            ctx.Response.StatusCode <- 500
                            do! ctx.Response.WriteAsJsonAsync({| error = "Failed to accept finish" |})
        }

    let rejectFinish (repo: IThreadRepository) (threadId: string) (ctx: HttpContext) : Task =
        task {
            let! thread = repo.GetById(threadId)

            match thread with
            | None ->
                ctx.Response.StatusCode <- 404
                do! ctx.Response.WriteAsJsonAsync({| error = "Thread not found" |})
            | Some t ->
                if t.Status <> "finish_proposed" then
                    ctx.Response.StatusCode <- 403
                    do! ctx.Response.WriteAsJsonAsync({| error = "No finish proposal pending" |})
                else
                    let (userId, _userName, _email) = getUserInfo ctx

                    if t.FinishProposedBy = userId then
                        ctx.Response.StatusCode <- 403
                        do! ctx.Response.WriteAsJsonAsync({| error = "Cannot reject your own proposal" |})
                    else
                        let! result = repo.RejectFinish threadId userId

                        match result with
                        | Some updated -> do! ctx.Response.WriteAsJsonAsync(updated)
                        | None ->
                            ctx.Response.StatusCode <- 500
                            do! ctx.Response.WriteAsJsonAsync({| error = "Failed to reject finish" |})
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
                sb.AppendLine($"- Players: {t.CreatedByName} & {t.OpponentName}") |> ignore
                sb.AppendLine() |> ignore
                sb.AppendLine("## Chord Progression") |> ignore
                sb.AppendLine() |> ignore
                sb.AppendLine("```") |> ignore

                t.Lines
                |> List.iter (fun line ->
                    sb.AppendLine(line.Chords) |> ignore)

                sb.AppendLine("```") |> ignore

                ctx.Response.ContentType <- "text/markdown; charset=utf-8"
                do! ctx.Response.WriteAsync(sb.ToString())
            | None ->
                ctx.Response.StatusCode <- 404
                do! ctx.Response.WriteAsJsonAsync({| error = "Thread not found" |})
        }
