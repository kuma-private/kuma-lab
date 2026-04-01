namespace ChordBattle.Api.Thread

open System
open System.Collections.Concurrent
open System.Threading.Tasks
open ChordBattle.Api.Thread.Models

module Repository =

    let canAccess (userId: string) (thread: Thread) : bool =
        thread.CreatedBy = userId
        || thread.Visibility = "public"
        || (thread.Visibility = "shared" && thread.SharedWith |> List.contains userId)

    module InMemory =

        let private threads = ConcurrentDictionary<string, Thread>()
        let private comments = ConcurrentDictionary<string, ConcurrentDictionary<string, Comment>>()
        let private annotations = ConcurrentDictionary<string, ConcurrentDictionary<string, Annotation>>()

        let getByUser (userId: string) : Task<Thread list> =
            task {
                return
                    threads.Values
                    |> Seq.filter (fun t -> canAccess userId t)
                    |> Seq.toList
                    |> List.sortByDescending (fun t -> t.CreatedAt)
            }

        let getById (id: string) : Task<Thread option> =
            task {
                match threads.TryGetValue(id) with
                | true, thread -> return Some thread
                | false, _ -> return None
            }

        let create (thread: Thread) : Task<Thread> =
            task {
                threads.[thread.Id] <- thread
                return thread
            }

        let update (thread: Thread) : Task<Thread> =
            task {
                threads.[thread.Id] <- thread
                return thread
            }

        let saveScore (threadId: string) (score: string) (history: SaveHistory) : Task<Thread option> =
            task {
                match threads.TryGetValue(threadId) with
                | true, thread ->
                    let updated =
                        { thread with
                            Score = score
                            LastEditedBy = history.UserId
                            LastEditedAt = history.CreatedAt
                            History = thread.History @ [ history ] }
                    threads.[threadId] <- updated
                    return Some updated
                | false, _ -> return None
            }

        let updateSettings (threadId: string) (key: string) (timeSignature: string) (bpm: int) (title: string) : Task<Thread option> =
            task {
                match threads.TryGetValue(threadId) with
                | true, thread ->
                    let updated =
                        { thread with
                            Title = if title <> "" then title else thread.Title
                            Key = key
                            TimeSignature = timeSignature
                            Bpm = bpm }
                    threads.[threadId] <- updated
                    return Some updated
                | false, _ -> return None
            }

        let updateShare (threadId: string) (visibility: string) (sharedWith: string list) : Task<Thread option> =
            task {
                match threads.TryGetValue(threadId) with
                | true, thread ->
                    let updated = { thread with Visibility = visibility; SharedWith = sharedWith }
                    threads.[threadId] <- updated
                    return Some updated
                | false, _ -> return None
            }

        let addComment (threadId: string) (comment: Comment) : Task<Comment> =
            task {
                let bag = comments.GetOrAdd(threadId, fun _ -> ConcurrentDictionary<string, Comment>())
                bag.[comment.Id] <- comment
                return comment
            }

        let getComments (threadId: string) : Task<Comment list> =
            task {
                match comments.TryGetValue(threadId) with
                | true, bag ->
                    return
                        bag.Values
                        |> Seq.toList
                        |> List.sortBy (fun c -> c.CreatedAt)
                | false, _ -> return []
            }

        let deleteComment (threadId: string) (commentId: string) : Task<bool> =
            task {
                match comments.TryGetValue(threadId) with
                | true, bag ->
                    let (removed, _) = bag.TryRemove(commentId)
                    return removed
                | false, _ -> return false
            }

        let addAnnotation (threadId: string) (annotation: Annotation) : Task<Annotation> =
            task {
                let bag = annotations.GetOrAdd(threadId, fun _ -> ConcurrentDictionary<string, Annotation>())
                bag.[annotation.Id] <- annotation
                return annotation
            }

        let getAnnotations (threadId: string) : Task<Annotation list> =
            task {
                match annotations.TryGetValue(threadId) with
                | true, bag ->
                    return
                        bag.Values
                        |> Seq.toList
                        |> List.sortBy (fun a -> a.CreatedAt)
                | false, _ -> return []
            }

        let deleteAnnotation (threadId: string) (annotationId: string) : Task<bool> =
            task {
                match annotations.TryGetValue(threadId) with
                | true, bag ->
                    let (removed, _) = bag.TryRemove(annotationId)
                    return removed
                | false, _ -> return false
            }

    module Firestore =

        open Google.Cloud.Firestore

        let private db =
            lazy (
                let projectId = Environment.GetEnvironmentVariable("FIRESTORE_PROJECT_ID")
                FirestoreDb.Create(projectId)
            )

        let private tryGetString (dict: System.Collections.Generic.IDictionary<string, obj>) (key: string) =
            match dict.TryGetValue(key) with
            | true, v when v <> null -> v :?> string
            | _ -> ""

        let private toSaveHistory (dict: System.Collections.Generic.IDictionary<string, obj>) : SaveHistory =
            { UserId = tryGetString dict "userId"
              UserName = tryGetString dict "userName"
              Score = let s = tryGetString dict "score" in if s <> "" then s else tryGetString dict "chords"
              Comment = tryGetString dict "comment"
              AiComment = tryGetString dict "aiComment"
              AiScores = tryGetString dict "aiScores"
              CreatedAt =
                  match dict.TryGetValue("createdAt") with
                  | true, (:? Timestamp as ts) -> ts.ToDateTime()
                  | _ -> DateTime.UtcNow }

        let private toThread (doc: DocumentSnapshot) : Thread =
            let history =
                match doc.TryGetValue<obj>("history") with
                | true, (:? System.Collections.IList as list) ->
                    list
                    |> Seq.cast<System.Collections.Generic.IDictionary<string, obj>>
                    |> Seq.map toSaveHistory
                    |> Seq.toList
                | _ -> []

            let members =
                match doc.TryGetValue<obj>("members") with
                | true, (:? System.Collections.IList as list) ->
                    list
                    |> Seq.cast<obj>
                    |> Seq.map (fun o -> o :?> string)
                    |> Seq.toList
                | _ -> []

            let visibility =
                match doc.TryGetValue<string>("visibility") with
                | true, v when v <> null -> v
                | _ -> "private"

            let sharedWith =
                match doc.TryGetValue<obj>("sharedWith") with
                | true, (:? System.Collections.IList as list) ->
                    list
                    |> Seq.cast<obj>
                    |> Seq.map (fun o -> o :?> string)
                    |> Seq.toList
                | _ -> []

            { Id = doc.Id
              Title = doc.GetValue<string>("title")
              Key = doc.GetValue<string>("key")
              TimeSignature = doc.GetValue<string>("timeSignature")
              Bpm = doc.GetValue<int>("bpm")
              CreatedBy = doc.GetValue<string>("createdBy")
              CreatedByName = doc.GetValue<string>("createdByName")
              CreatedAt = doc.GetValue<Timestamp>("createdAt").ToDateTime()
              Score =
                  match doc.TryGetValue<string>("score") with
                  | true, v -> v
                  | _ -> ""
              LastEditedBy =
                  match doc.TryGetValue<string>("lastEditedBy") with
                  | true, v -> v
                  | _ -> ""
              LastEditedAt =
                  match doc.TryGetValue<Timestamp>("lastEditedAt") with
                  | true, v -> v.ToDateTime()
                  | _ -> DateTime.UtcNow
              Members = members
              History = history
              Visibility = visibility
              SharedWith = sharedWith }

        let getByUser (userId: string) : Task<Thread list> =
            task {
                let collection = db.Value.Collection("threads")

                let! ownedSnapshot =
                    collection.WhereEqualTo("createdBy", userId).GetSnapshotAsync()

                let! publicSnapshot =
                    collection.WhereEqualTo("visibility", "public").GetSnapshotAsync()

                let! sharedSnapshot =
                    collection.WhereArrayContains("sharedWith", userId).GetSnapshotAsync()

                let allDocs =
                    [ ownedSnapshot.Documents; publicSnapshot.Documents; sharedSnapshot.Documents ]
                    |> Seq.concat
                    |> Seq.distinctBy (fun d -> d.Id)
                    |> Seq.map toThread
                    |> Seq.toList
                    |> List.sortByDescending (fun t -> t.CreatedAt)

                return allDocs
            }

        let getById (id: string) : Task<Thread option> =
            task {
                let docRef = db.Value.Collection("threads").Document(id)
                let! snapshot = docRef.GetSnapshotAsync()

                if snapshot.Exists then
                    return Some(toThread snapshot)
                else
                    return None
            }

        let create (thread: Thread) : Task<Thread> =
            task {
                let docRef = db.Value.Collection("threads").Document(thread.Id)

                let data =
                    System.Collections.Generic.Dictionary<string, obj>(
                        dict
                            [ "title", thread.Title :> obj
                              "key", thread.Key :> obj
                              "timeSignature", thread.TimeSignature :> obj
                              "bpm", thread.Bpm :> obj
                              "createdBy", thread.CreatedBy :> obj
                              "createdByName", thread.CreatedByName :> obj
                              "createdAt", Timestamp.FromDateTime(thread.CreatedAt.ToUniversalTime()) :> obj
                              "score", thread.Score :> obj
                              "lastEditedBy", thread.LastEditedBy :> obj
                              "lastEditedAt", Timestamp.FromDateTime(thread.LastEditedAt.ToUniversalTime()) :> obj
                              "members", System.Collections.Generic.List<obj>(thread.Members |> List.map (fun m -> m :> obj)) :> obj
                              "history", System.Collections.Generic.List<obj>() :> obj
                              "visibility", thread.Visibility :> obj
                              "sharedWith", System.Collections.Generic.List<obj>(thread.SharedWith |> List.map (fun s -> s :> obj)) :> obj ]
                    )

                let! _ = docRef.SetAsync(data)
                return thread
            }

        let private saveHistoryToDict (h: SaveHistory) : System.Collections.Generic.Dictionary<string, obj> =
            System.Collections.Generic.Dictionary<string, obj>(
                dict
                    [ "userId", h.UserId :> obj
                      "userName", h.UserName :> obj
                      "score", h.Score :> obj
                      "comment", h.Comment :> obj
                      "aiComment", h.AiComment :> obj
                      "aiScores", h.AiScores :> obj
                      "createdAt", Timestamp.FromDateTime(h.CreatedAt.ToUniversalTime()) :> obj ]
            )

        let private updateFields (docRef: DocumentReference) (updates: (string * obj) list) =
            task {
                let dict = System.Collections.Generic.Dictionary<string, obj>()
                for (k, v) in updates do
                    dict.[k] <- v
                let! _ = docRef.UpdateAsync(dict)
                ()
            }

        let update (thread: Thread) : Task<Thread> =
            task {
                let docRef = db.Value.Collection("threads").Document(thread.Id)
                let histDicts = thread.History |> List.map (fun h -> saveHistoryToDict h :> obj)
                do! updateFields docRef [
                    "title", thread.Title :> obj
                    "key", thread.Key :> obj
                    "timeSignature", thread.TimeSignature :> obj
                    "bpm", thread.Bpm :> obj
                    "score", thread.Score :> obj
                    "lastEditedBy", thread.LastEditedBy :> obj
                    "lastEditedAt", Timestamp.FromDateTime(thread.LastEditedAt.ToUniversalTime()) :> obj
                    "members", System.Collections.Generic.List<obj>(thread.Members |> List.map (fun m -> m :> obj)) :> obj
                    "history", (System.Collections.Generic.List<obj>(histDicts) :> obj)
                    "visibility", thread.Visibility :> obj
                    "sharedWith", System.Collections.Generic.List<obj>(thread.SharedWith |> List.map (fun s -> s :> obj)) :> obj
                ]
                return thread
            }

        let private updateThread (threadId: string) (transform: Thread -> Thread) : Task<Thread option> =
            task {
                let! existing = getById threadId
                match existing with
                | None -> return None
                | Some thread ->
                    let! result = update (transform thread)
                    return Some result
            }

        let saveScore (threadId: string) (score: string) (history: SaveHistory) : Task<Thread option> =
            updateThread threadId (fun thread ->
                { thread with
                    Score = score
                    LastEditedBy = history.UserId
                    LastEditedAt = history.CreatedAt
                    History = thread.History @ [ history ] })

        let updateSettings (threadId: string) (key: string) (timeSignature: string) (bpm: int) (title: string) : Task<Thread option> =
            updateThread threadId (fun thread ->
                { thread with
                    Title = if title <> "" then title else thread.Title
                    Key = key
                    TimeSignature = timeSignature
                    Bpm = bpm })

        let updateShare (threadId: string) (visibility: string) (sharedWith: string list) : Task<Thread option> =
            updateThread threadId (fun thread ->
                { thread with Visibility = visibility; SharedWith = sharedWith })

        let addComment (threadId: string) (comment: Comment) : Task<Comment> =
            task {
                let docRef =
                    db.Value.Collection("threads").Document(threadId)
                        .Collection("comments").Document(comment.Id)

                let data =
                    System.Collections.Generic.Dictionary<string, obj>(
                        dict
                            [ "userId", comment.UserId :> obj
                              "userName", comment.UserName :> obj
                              "text", comment.Text :> obj
                              "anchorType", comment.AnchorType :> obj
                              "anchorStart", comment.AnchorStart :> obj
                              "anchorEnd", comment.AnchorEnd :> obj
                              "anchorSnapshot", comment.AnchorSnapshot :> obj
                              "createdAt", Timestamp.FromDateTime(comment.CreatedAt.ToUniversalTime()) :> obj ]
                    )

                let! _ = docRef.SetAsync(data)
                return comment
            }

        let getComments (threadId: string) : Task<Comment list> =
            task {
                let collection =
                    db.Value.Collection("threads").Document(threadId).Collection("comments")
                let! snapshot = collection.OrderBy("createdAt").GetSnapshotAsync()

                return
                    snapshot.Documents
                    |> Seq.map (fun doc ->
                        { Id = doc.Id
                          UserId = doc.GetValue<string>("userId")
                          UserName = doc.GetValue<string>("userName")
                          Text = doc.GetValue<string>("text")
                          AnchorType =
                              match doc.TryGetValue<string>("anchorType") with
                              | true, v -> v
                              | _ -> "global"
                          AnchorStart =
                              match doc.TryGetValue<int>("anchorStart") with
                              | true, v -> v
                              | _ -> -1
                          AnchorEnd =
                              match doc.TryGetValue<int>("anchorEnd") with
                              | true, v -> v
                              | _ -> -1
                          AnchorSnapshot =
                              match doc.TryGetValue<string>("anchorSnapshot") with
                              | true, v -> v
                              | _ -> ""
                          CreatedAt = doc.GetValue<Timestamp>("createdAt").ToDateTime() })
                    |> Seq.toList
            }

        let deleteComment (threadId: string) (commentId: string) : Task<bool> =
            task {
                let docRef =
                    db.Value.Collection("threads").Document(threadId)
                        .Collection("comments").Document(commentId)
                let! snapshot = docRef.GetSnapshotAsync()
                if snapshot.Exists then
                    let! _ = docRef.DeleteAsync()
                    return true
                else
                    return false
            }

        let addAnnotation (threadId: string) (annotation: Annotation) : Task<Annotation> =
            task {
                let docRef =
                    db.Value.Collection("threads").Document(threadId)
                        .Collection("annotations").Document(annotation.Id)

                let data =
                    System.Collections.Generic.Dictionary<string, obj>(
                        dict
                            [ "userId", annotation.UserId :> obj
                              "userName", annotation.UserName :> obj
                              "type", annotation.Type :> obj
                              "startBar", annotation.StartBar :> obj
                              "endBar", annotation.EndBar :> obj
                              "snapshot", annotation.Snapshot :> obj
                              "emoji", annotation.Emoji :> obj
                              "aiComment", annotation.AiComment :> obj
                              "createdAt", Timestamp.FromDateTime(annotation.CreatedAt.ToUniversalTime()) :> obj ]
                    )

                let! _ = docRef.SetAsync(data)
                return annotation
            }

        let getAnnotations (threadId: string) : Task<Annotation list> =
            task {
                let collection =
                    db.Value.Collection("threads").Document(threadId).Collection("annotations")
                let! snapshot = collection.OrderBy("createdAt").GetSnapshotAsync()

                return
                    snapshot.Documents
                    |> Seq.map (fun doc ->
                        { Id = doc.Id
                          UserId = doc.GetValue<string>("userId")
                          UserName = doc.GetValue<string>("userName")
                          Type =
                              match doc.TryGetValue<string>("type") with
                              | true, v -> v
                              | _ -> "reaction"
                          StartBar =
                              match doc.TryGetValue<int>("startBar") with
                              | true, v -> v
                              | _ -> 0
                          EndBar =
                              match doc.TryGetValue<int>("endBar") with
                              | true, v -> v
                              | _ -> 0
                          Snapshot =
                              match doc.TryGetValue<string>("snapshot") with
                              | true, v -> v
                              | _ -> ""
                          Emoji =
                              match doc.TryGetValue<string>("emoji") with
                              | true, v -> v
                              | _ -> ""
                          AiComment =
                              match doc.TryGetValue<string>("aiComment") with
                              | true, v -> v
                              | _ -> ""
                          CreatedAt = doc.GetValue<Timestamp>("createdAt").ToDateTime() })
                    |> Seq.toList
            }

        let deleteAnnotation (threadId: string) (annotationId: string) : Task<bool> =
            task {
                let docRef =
                    db.Value.Collection("threads").Document(threadId)
                        .Collection("annotations").Document(annotationId)
                let! snapshot = docRef.GetSnapshotAsync()
                if snapshot.Exists then
                    let! _ = docRef.DeleteAsync()
                    return true
                else
                    return false
            }

    type IThreadRepository =
        { GetByUser: string -> Task<Thread list>
          GetById: string -> Task<Thread option>
          Create: Thread -> Task<Thread>
          Update: Thread -> Task<Thread>
          SaveScore: string -> string -> SaveHistory -> Task<Thread option>
          UpdateSettings: string -> string -> string -> int -> string -> Task<Thread option>
          UpdateShare: string -> string -> string list -> Task<Thread option>
          AddComment: string -> Comment -> Task<Comment>
          GetComments: string -> Task<Comment list>
          DeleteComment: string -> string -> Task<bool>
          AddAnnotation: string -> Annotation -> Task<Annotation>
          GetAnnotations: string -> Task<Annotation list>
          DeleteAnnotation: string -> string -> Task<bool> }

    let create (firestoreProjectId: string) : IThreadRepository =
        if String.IsNullOrEmpty(firestoreProjectId) then
            { GetByUser = InMemory.getByUser
              GetById = InMemory.getById
              Create = InMemory.create
              Update = InMemory.update
              SaveScore = InMemory.saveScore
              UpdateSettings = InMemory.updateSettings
              UpdateShare = InMemory.updateShare
              AddComment = InMemory.addComment
              GetComments = InMemory.getComments
              DeleteComment = InMemory.deleteComment
              AddAnnotation = InMemory.addAnnotation
              GetAnnotations = InMemory.getAnnotations
              DeleteAnnotation = InMemory.deleteAnnotation }
        else
            { GetByUser = Firestore.getByUser
              GetById = Firestore.getById
              Create = Firestore.create
              Update = Firestore.update
              SaveScore = Firestore.saveScore
              UpdateSettings = Firestore.updateSettings
              UpdateShare = Firestore.updateShare
              AddComment = Firestore.addComment
              GetComments = Firestore.getComments
              DeleteComment = Firestore.deleteComment
              AddAnnotation = Firestore.addAnnotation
              GetAnnotations = Firestore.getAnnotations
              DeleteAnnotation = Firestore.deleteAnnotation }
