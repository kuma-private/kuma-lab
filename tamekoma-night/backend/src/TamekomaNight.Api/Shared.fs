namespace TamekomaNight.Api

open System
open System.Security.Claims
open System.Threading.Tasks
open Microsoft.AspNetCore.Http

/// Shared types and helpers used across Song and Thread modules.
module Shared =

    // ── Common types ──────────────────────────────────────

    /// Represents authenticated user information extracted from HttpContext
    type UserInfo =
        { UserId: string
          UserName: string
          Email: string }

    // ── Null-safety helpers ───────────────────────────────

    /// Safely coalesce a possibly-null string to a default value
    let defaultIfNull (defaultValue: string) (value: string) =
        if obj.ReferenceEquals(value, null) then defaultValue else value

    /// Check if a deserialized request object is non-null
    let isNotNull (value: 'T) = not (obj.ReferenceEquals(value, null))

    // ── Auth helpers ──────────────────────────────────────

    let getUserInfo (devMode: bool) (ctx: HttpContext) : UserInfo =
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

    // ── HTTP response helpers ─────────────────────────────

    let respondJson (ctx: HttpContext) (statusCode: int) (body: obj) : Task =
        ctx.Response.StatusCode <- statusCode
        ctx.Response.WriteAsJsonAsync(body)

    let respond404 ctx entityName = respondJson ctx 404 {| error = $"{entityName} not found" |}
    let respond403 ctx msg = respondJson ctx 403 {| error = msg |}
    let respond400 ctx msg = respondJson ctx 400 {| error = msg |}
    let respond500 ctx msg = respondJson ctx 500 {| error = msg |}

    // ── Request parsing ───────────────────────────────────

    let parseRequest<'T> (ctx: HttpContext) : Task<Result<'T, string>> =
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

    /// Parse request and run handler if valid, else return 400.
    let withParsedRequest<'T>
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

module FirestoreHelpers =

    open Google.Cloud.Firestore

    // ── Document field extraction ─────────────────────────

    let tryGetString (dict: System.Collections.Generic.IDictionary<string, obj>) (key: string) =
        match dict.TryGetValue(key) with
        | true, v when v <> null -> v :?> string
        | _ -> ""

    let tryGetDocString (doc: DocumentSnapshot) (key: string) (defaultValue: string) =
        match doc.TryGetValue<string>(key) with
        | true, v when v <> null -> v
        | _ -> defaultValue

    let tryGetDocInt (doc: DocumentSnapshot) (key: string) (defaultValue: int) =
        match doc.TryGetValue<int>(key) with
        | true, v -> v
        | _ -> defaultValue

    let tryGetDocFloat (doc: DocumentSnapshot) (key: string) (defaultValue: float) =
        match doc.TryGetValue<float>(key) with
        | true, v -> v
        | _ -> defaultValue

    let tryGetDocBool (doc: DocumentSnapshot) (key: string) (defaultValue: bool) =
        match doc.TryGetValue<bool>(key) with
        | true, v -> v
        | _ -> defaultValue

    let tryGetDocTimestamp (doc: DocumentSnapshot) (key: string) (defaultValue: DateTime) =
        match doc.TryGetValue<Timestamp>(key) with
        | true, v -> v.ToDateTime()
        | _ -> defaultValue

    let tryGetStringList (doc: DocumentSnapshot) (key: string) =
        match doc.TryGetValue<obj>(key) with
        | true, (:? System.Collections.IList as list) ->
            list |> Seq.cast<obj> |> Seq.map (fun o -> o :?> string) |> Seq.toList
        | _ -> []

    let tryGetDictString (dict: System.Collections.Generic.IDictionary<string, obj>) (key: string) =
        match dict.TryGetValue(key) with
        | true, v when v <> null -> v :?> string
        | _ -> ""

    let tryGetDictInt (dict: System.Collections.Generic.IDictionary<string, obj>) (key: string) (defaultValue: int) =
        match dict.TryGetValue(key) with
        | true, v when v <> null ->
            try System.Convert.ToInt32(v) with _ -> defaultValue
        | _ -> defaultValue

    let tryGetDictFloat (dict: System.Collections.Generic.IDictionary<string, obj>) (key: string) (defaultValue: float) =
        match dict.TryGetValue(key) with
        | true, v when v <> null ->
            try System.Convert.ToDouble(v) with _ -> defaultValue
        | _ -> defaultValue

    let tryGetDictBool (dict: System.Collections.Generic.IDictionary<string, obj>) (key: string) (defaultValue: bool) =
        match dict.TryGetValue(key) with
        | true, v when v <> null ->
            try System.Convert.ToBoolean(v) with _ -> defaultValue
        | _ -> defaultValue

    // ── Serialization helpers ─────────────────────────────

    let toStringList (items: string list) =
        System.Collections.Generic.List<obj>(items |> List.map (fun s -> s :> obj)) :> obj

    let toTimestamp (dt: DateTime) =
        Timestamp.FromDateTime(dt.ToUniversalTime()) :> obj

    let updateFields (docRef: DocumentReference) (updates: (string * obj) list) =
        task {
            let dict = System.Collections.Generic.Dictionary<string, obj>()
            for (k, v) in updates do
                dict.[k] <- v
            let! _ = docRef.UpdateAsync(dict)
            ()
        }
