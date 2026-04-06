namespace TamekomaNight.Api.Song

open System
open System.Security.Claims
open System.Threading.Tasks
open Microsoft.AspNetCore.Http
open TamekomaNight.Api
open TamekomaNight.Api.Song.Models
open TamekomaNight.Api.Song.Repository

module SongHandlers =

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

    // --- HTTP response helpers ---

    let private respondJson (ctx: HttpContext) (statusCode: int) (body: obj) : Task =
        ctx.Response.StatusCode <- statusCode
        ctx.Response.WriteAsJsonAsync(body)

    let private respond404 ctx = respondJson ctx 404 {| error = "Song not found" |}
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

    /// Fetch song + check access, then run handler. Handles 404/403 automatically.
    let private withSong
        (repo: ISongRepository)
        (songId: string)
        (ctx: HttpContext)
        (handler: Song -> UserInfo -> Task)
        : Task =
        task {
            let! song = repo.GetById(songId)
            let user = getUserInfo ctx

            match song with
            | None ->
                do! respond404 ctx
            | Some s when not (Repository.canAccessWithEmail user.UserId user.Email s) ->
                do! respond403 ctx "Access denied"
            | Some s ->
                do! handler s user
        }

    /// Fetch song + check ownership, then run handler. Handles 404/403 automatically.
    let private withOwnerSong
        (repo: ISongRepository)
        (songId: string)
        (ctx: HttpContext)
        (errorMsg: string)
        (handler: Song -> UserInfo -> Task)
        : Task =
        task {
            let! song = repo.GetById(songId)
            let user = getUserInfo ctx

            match song with
            | None ->
                do! respond404 ctx
            | Some s when s.CreatedBy <> user.UserId ->
                do! respond403 ctx errorMsg
            | Some s ->
                do! handler s user
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

    let listSongs (repo: ISongRepository) (ctx: HttpContext) : Task =
        task {
            let user = getUserInfo ctx
            let! songs = repo.GetByUser user.UserId user.Email

            let result =
                songs
                |> List.map (fun s ->
                    {| id = s.Id
                       title = s.Title
                       bpm = s.Bpm
                       timeSignature = s.TimeSignature
                       key = s.Key
                       createdByName = s.CreatedByName
                       createdAt = s.CreatedAt
                       lastEditedBy = s.LastEditedBy
                       lastEditedAt = s.LastEditedAt
                       trackCount = s.Tracks.Length
                       sectionCount = s.Sections.Length
                       visibility = s.Visibility |})

            do! ctx.Response.WriteAsJsonAsync(result)
        }

    let createSong (repo: ISongRepository) (ctx: HttpContext) : Task =
        withParsedRequest<CreateSongRequest> ctx (fun req -> isNotNull req.title) (fun req ->
            task {
                let user = getUserInfo ctx

                let song =
                    { Id = Guid.NewGuid().ToString("N")
                      Title = req.title
                      Bpm = 120
                      TimeSignature = "4/4"
                      Key = "C Major"
                      ChordProgression = ""
                      Sections = []
                      Tracks = []
                      CreatedBy = user.UserId
                      CreatedByName = user.UserName
                      CreatedAt = DateTime.UtcNow
                      LastEditedBy = user.UserId
                      LastEditedAt = DateTime.UtcNow
                      Visibility = "private"
                      SharedWith = [] }

                let! created = repo.Create(song)
                do! respondJson ctx 201 {| id = created.Id |}
            })

    let getSong (repo: ISongRepository) (songId: string) (ctx: HttpContext) : Task =
        withSong repo songId ctx (fun s _ ->
            ctx.Response.WriteAsJsonAsync(s))

    let updateSong (repo: ISongRepository) (songId: string) (ctx: HttpContext) : Task =
        withSong repo songId ctx (fun s user ->
            withParsedRequest<UpdateSongRequest> ctx (fun req -> isNotNull req.title) (fun req ->
                task {
                    let updated =
                        { s with
                            Title = req.title
                            Bpm = req.bpm
                            TimeSignature = req.timeSignature
                            Key = req.key
                            ChordProgression = req.chordProgression |> defaultIfNull ""
                            Sections = if obj.ReferenceEquals(req.sections, null) then s.Sections else req.sections
                            Tracks = if obj.ReferenceEquals(req.tracks, null) then s.Tracks else req.tracks
                            LastEditedBy = user.UserId
                            LastEditedAt = DateTime.UtcNow }

                    let! result = repo.Update(updated)
                    do! ctx.Response.WriteAsJsonAsync(result)
                }))

    let deleteSong (repo: ISongRepository) (songId: string) (ctx: HttpContext) : Task =
        withOwnerSong repo songId ctx "Only the owner can delete" (fun _ _ ->
            task {
                let! _ = repo.Delete(songId)
                ctx.Response.StatusCode <- 204
            })
