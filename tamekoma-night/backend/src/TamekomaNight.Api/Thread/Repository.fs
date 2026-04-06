namespace TamekomaNight.Api.Thread

open System
open System.Collections.Concurrent
open System.Threading.Tasks
open TamekomaNight.Api
open TamekomaNight.Api.Thread.Models

module Repository =

    let canAccess (userId: string) (thread: Thread) : bool =
        thread.CreatedBy = userId
        || thread.Visibility = "public"
        || (thread.Visibility = "shared" && thread.SharedWith |> List.contains userId)

    let canAccessWithEmail (userId: string) (email: string) (thread: Thread) : bool =
        thread.CreatedBy = userId
        || thread.Visibility = "public"
        || (thread.Visibility = "shared" &&
            (thread.SharedWith |> List.contains userId
             || (email <> "" && thread.SharedWith |> List.contains email)))

    module InMemory =

        let private threads = ConcurrentDictionary<string, Thread>()
        let private saveLock = obj()
        let private comments = ConcurrentDictionary<string, ConcurrentDictionary<string, Comment>>()
        let private annotations = ConcurrentDictionary<string, ConcurrentDictionary<string, Annotation>>()

        let getByUser (userId: string) (email: string) : Task<Thread list> =
            threads.Values
            |> Seq.filter (canAccessWithEmail userId email)
            |> Seq.toList
            |> List.sortByDescending (fun t -> t.CreatedAt)
            |> Task.FromResult

        let getById (id: string) : Task<Thread option> =
            threads.TryGetValue(id)
            |> function
                | true, thread -> Some thread
                | false, _ -> None
            |> Task.FromResult

        let create (thread: Thread) : Task<Thread> =
            threads.[thread.Id] <- thread
            Task.FromResult thread

        let update (thread: Thread) : Task<Thread> =
            threads.[thread.Id] <- thread
            Task.FromResult thread

        let delete (threadId: string) : Task<bool> =
            threads.TryRemove(threadId) |> fst |> Task.FromResult

        let saveScore (threadId: string) (score: string) (midiData: string option) (history: SaveHistory) : Task<Thread option> =
            threads.TryGetValue(threadId)
            |> function
                | true, _ ->
                    lock saveLock (fun () ->
                        match threads.TryGetValue(threadId) with
                        | true, thread ->
                            let updated =
                                { thread with
                                    Score = score
                                    MidiData = midiData |> Option.defaultValue thread.MidiData
                                    LastEditedBy = history.UserId
                                    LastEditedAt = history.CreatedAt
                                    History = thread.History @ [ history ] }
                            threads.[threadId] <- updated
                            Some updated
                        | false, _ -> None)
                | false, _ -> None
            |> Task.FromResult

        let updateSettings (threadId: string) (key: string) (timeSignature: string) (bpm: int) (title: string) (editorMode: string) : Task<Thread option> =
            threads.TryGetValue(threadId)
            |> function
                | true, thread ->
                    let updated =
                        { thread with
                            Title = if title <> "" then title else thread.Title
                            Key = key
                            TimeSignature = timeSignature
                            Bpm = bpm
                            EditorMode = if editorMode <> "" then editorMode else thread.EditorMode }
                    threads.[threadId] <- updated
                    Some updated
                | false, _ -> None
            |> Task.FromResult

        let updateShare (threadId: string) (visibility: string) (sharedWith: string list) : Task<Thread option> =
            threads.TryGetValue(threadId)
            |> function
                | true, thread ->
                    let updated = { thread with Visibility = visibility; SharedWith = sharedWith }
                    threads.[threadId] <- updated
                    Some updated
                | false, _ -> None
            |> Task.FromResult

        let addComment (threadId: string) (comment: Comment) : Task<Comment> =
            let bag = comments.GetOrAdd(threadId, fun _ -> ConcurrentDictionary<string, Comment>())
            bag.[comment.Id] <- comment
            Task.FromResult comment

        let getComments (threadId: string) : Task<Comment list> =
            comments.TryGetValue(threadId)
            |> function
                | true, bag ->
                    bag.Values
                    |> Seq.toList
                    |> List.sortBy (fun c -> c.CreatedAt)
                | false, _ -> []
            |> Task.FromResult

        let deleteComment (threadId: string) (commentId: string) : Task<bool> =
            comments.TryGetValue(threadId)
            |> function
                | true, bag -> bag.TryRemove(commentId) |> fst
                | false, _ -> false
            |> Task.FromResult

        let addAnnotation (threadId: string) (annotation: Annotation) : Task<Annotation> =
            let bag = annotations.GetOrAdd(threadId, fun _ -> ConcurrentDictionary<string, Annotation>())
            bag.[annotation.Id] <- annotation
            Task.FromResult annotation

        let getAnnotations (threadId: string) : Task<Annotation list> =
            annotations.TryGetValue(threadId)
            |> function
                | true, bag ->
                    bag.Values
                    |> Seq.toList
                    |> List.sortBy (fun a -> a.CreatedAt)
                | false, _ -> []
            |> Task.FromResult

        let deleteAnnotation (threadId: string) (annotationId: string) : Task<bool> =
            annotations.TryGetValue(threadId)
            |> function
                | true, bag -> bag.TryRemove(annotationId) |> fst
                | false, _ -> false
            |> Task.FromResult

    module Firestore =

        open Google.Cloud.Firestore

        let private db =
            lazy (
                let projectId = Environment.GetEnvironmentVariable("FIRESTORE_PROJECT_ID")
                FirestoreDb.Create(projectId)
            )

        // Aliases for shared Firestore helpers
        let private tryGetString = FirestoreHelpers.tryGetString
        let private tryGetDocString = FirestoreHelpers.tryGetDocString
        let private tryGetDocInt = FirestoreHelpers.tryGetDocInt
        let private tryGetDocTimestamp = FirestoreHelpers.tryGetDocTimestamp
        let private tryGetStringList = FirestoreHelpers.tryGetStringList
        let private toStringList = FirestoreHelpers.toStringList
        let private toTimestamp = FirestoreHelpers.toTimestamp
        let private updateFields = FirestoreHelpers.updateFields

        // --- Firestore document conversion ---

        let private toSaveHistory (dict: System.Collections.Generic.IDictionary<string, obj>) : SaveHistory =
            let getString = tryGetString dict
            { UserId = getString "userId"
              UserName = getString "userName"
              Score = getString "score" |> function "" -> getString "chords" | s -> s
              MidiData = getString "midiData"
              Comment = getString "comment"
              AiComment = getString "aiComment"
              AiScores = getString "aiScores"
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

            { Id = doc.Id
              Title = doc.GetValue<string>("title")
              Key = doc.GetValue<string>("key")
              TimeSignature = doc.GetValue<string>("timeSignature")
              Bpm = doc.GetValue<int>("bpm")
              CreatedBy = doc.GetValue<string>("createdBy")
              CreatedByName = doc.GetValue<string>("createdByName")
              CreatedAt = doc.GetValue<Timestamp>("createdAt").ToDateTime()
              Score = doc |> tryGetDocString <| "score" <| ""
              MidiData = doc |> tryGetDocString <| "midiData" <| ""
              LastEditedBy = doc |> tryGetDocString <| "lastEditedBy" <| ""
              LastEditedAt = doc |> tryGetDocTimestamp <| "lastEditedAt" <| DateTime.UtcNow
              Members = doc |> tryGetStringList <| "members"
              History = history
              Visibility = doc |> tryGetDocString <| "visibility" <| "private"
              SharedWith = doc |> tryGetStringList <| "sharedWith"
              EditorMode = doc |> tryGetDocString <| "editorMode" <| "" }

        let private toComment (doc: DocumentSnapshot) : Comment =
            { Id = doc.Id
              UserId = doc.GetValue<string>("userId")
              UserName = doc.GetValue<string>("userName")
              Text = doc.GetValue<string>("text")
              AnchorType = doc |> tryGetDocString <| "anchorType" <| "global"
              AnchorStart = doc |> tryGetDocInt <| "anchorStart" <| -1
              AnchorEnd = doc |> tryGetDocInt <| "anchorEnd" <| -1
              AnchorSnapshot = doc |> tryGetDocString <| "anchorSnapshot" <| ""
              CreatedAt = doc.GetValue<Timestamp>("createdAt").ToDateTime() }

        let private toAnnotation (doc: DocumentSnapshot) : Annotation =
            { Id = doc.Id
              UserId = doc.GetValue<string>("userId")
              UserName = doc.GetValue<string>("userName")
              Type = doc |> tryGetDocString <| "type" <| "reaction"
              StartBar = doc |> tryGetDocInt <| "startBar" <| 0
              EndBar = doc |> tryGetDocInt <| "endBar" <| 0
              Snapshot = doc |> tryGetDocString <| "snapshot" <| ""
              Emoji = doc |> tryGetDocString <| "emoji" <| ""
              AiComment = doc |> tryGetDocString <| "aiComment" <| ""
              CreatedAt = doc.GetValue<Timestamp>("createdAt").ToDateTime() }

        // --- Firestore serialization helpers ---

        let private saveHistoryToDict (h: SaveHistory) : System.Collections.Generic.Dictionary<string, obj> =
            System.Collections.Generic.Dictionary<string, obj>(
                dict
                    [ "userId", h.UserId :> obj
                      "userName", h.UserName :> obj
                      "score", h.Score :> obj
                      "midiData", h.MidiData :> obj
                      "comment", h.Comment :> obj
                      "aiComment", h.AiComment :> obj
                      "aiScores", h.AiScores :> obj
                      "createdAt", toTimestamp h.CreatedAt ])

        let private threadToDict (thread: Thread) : System.Collections.Generic.Dictionary<string, obj> =
            System.Collections.Generic.Dictionary<string, obj>(
                dict
                    [ "title", thread.Title :> obj
                      "key", thread.Key :> obj
                      "timeSignature", thread.TimeSignature :> obj
                      "bpm", thread.Bpm :> obj
                      "createdBy", thread.CreatedBy :> obj
                      "createdByName", thread.CreatedByName :> obj
                      "createdAt", toTimestamp thread.CreatedAt
                      "score", thread.Score :> obj
                      "midiData", thread.MidiData :> obj
                      "lastEditedBy", thread.LastEditedBy :> obj
                      "lastEditedAt", toTimestamp thread.LastEditedAt
                      "members", toStringList thread.Members
                      "history", System.Collections.Generic.List<obj>() :> obj
                      "visibility", thread.Visibility :> obj
                      "sharedWith", toStringList thread.SharedWith
                      "editorMode", thread.EditorMode :> obj ])

        // --- CRUD operations ---

        let getByUser (userId: string) (email: string) : Task<Thread list> =
            task {
                let collection = db.Value.Collection("threads")

                let! ownedSnapshot =
                    collection.WhereEqualTo("createdBy", userId).GetSnapshotAsync()

                let! publicSnapshot =
                    collection.WhereEqualTo("visibility", "public").GetSnapshotAsync()

                let! sharedByIdSnapshot =
                    collection.WhereArrayContains("sharedWith", userId).GetSnapshotAsync()

                let! sharedByEmailSnapshot =
                    if email <> "" then
                        collection.WhereArrayContains("sharedWith", email).GetSnapshotAsync()
                    else
                        task { return ownedSnapshot } // dummy, will be deduped

                return
                    [ ownedSnapshot.Documents; publicSnapshot.Documents; sharedByIdSnapshot.Documents; sharedByEmailSnapshot.Documents ]
                    |> Seq.concat
                    |> Seq.distinctBy (fun d -> d.Id)
                    |> Seq.map toThread
                    |> Seq.toList
                    |> List.sortByDescending (fun t -> t.CreatedAt)
            }

        let getById (id: string) : Task<Thread option> =
            task {
                let! snapshot =
                    db.Value.Collection("threads").Document(id).GetSnapshotAsync()

                return
                    if snapshot.Exists then Some(toThread snapshot)
                    else None
            }

        let create (thread: Thread) : Task<Thread> =
            task {
                let docRef = db.Value.Collection("threads").Document(thread.Id)
                let! _ = thread |> threadToDict |> docRef.SetAsync
                return thread
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
                    "midiData", thread.MidiData :> obj
                    "lastEditedBy", thread.LastEditedBy :> obj
                    "lastEditedAt", toTimestamp thread.LastEditedAt
                    "members", toStringList thread.Members
                    "history", (System.Collections.Generic.List<obj>(histDicts) :> obj)
                    "visibility", thread.Visibility :> obj
                    "sharedWith", toStringList thread.SharedWith
                    "editorMode", thread.EditorMode :> obj
                ]
                return thread
            }

        let delete (threadId: string) : Task<bool> =
            task {
                let docRef = db.Value.Collection("threads").Document(threadId)
                let! snapshot = docRef.GetSnapshotAsync()
                if snapshot.Exists then
                    let! _ = docRef.DeleteAsync()
                    return true
                else
                    return false
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

        let saveScore (threadId: string) (score: string) (midiData: string option) (history: SaveHistory) : Task<Thread option> =
            task {
                let docRef = db.Value.Collection("threads").Document(threadId)
                let histDict = saveHistoryToDict history :> obj
                // Atomic update: use ArrayUnion for history to avoid race conditions
                let updates: (string * obj) list = [
                    "score", score :> obj
                    "lastEditedBy", history.UserId :> obj
                    "lastEditedAt", toTimestamp history.CreatedAt :> obj
                    "history", Google.Cloud.Firestore.FieldValue.ArrayUnion(histDict) :> obj
                ]
                let updates =
                    match midiData with
                    | Some md -> ("midiData", md :> obj) :: updates
                    | None -> updates
                do! updateFields docRef updates
                return! getById threadId
            }

        let updateSettings (threadId: string) (key: string) (timeSignature: string) (bpm: int) (title: string) (editorMode: string) : Task<Thread option> =
            updateThread threadId (fun thread ->
                { thread with
                    Title = if title <> "" then title else thread.Title
                    Key = key
                    TimeSignature = timeSignature
                    Bpm = bpm
                    EditorMode = if editorMode <> "" then editorMode else thread.EditorMode })

        let updateShare (threadId: string) (visibility: string) (sharedWith: string list) : Task<Thread option> =
            updateThread threadId (fun thread ->
                { thread with Visibility = visibility; SharedWith = sharedWith })

        let private commentToDict (comment: Comment) =
            System.Collections.Generic.Dictionary<string, obj>(
                dict
                    [ "userId", comment.UserId :> obj
                      "userName", comment.UserName :> obj
                      "text", comment.Text :> obj
                      "anchorType", comment.AnchorType :> obj
                      "anchorStart", comment.AnchorStart :> obj
                      "anchorEnd", comment.AnchorEnd :> obj
                      "anchorSnapshot", comment.AnchorSnapshot :> obj
                      "createdAt", toTimestamp comment.CreatedAt ])

        let addComment (threadId: string) (comment: Comment) : Task<Comment> =
            task {
                let docRef =
                    db.Value.Collection("threads").Document(threadId)
                        .Collection("comments").Document(comment.Id)
                let! _ = comment |> commentToDict |> docRef.SetAsync
                return comment
            }

        let getComments (threadId: string) : Task<Comment list> =
            task {
                let! snapshot =
                    db.Value.Collection("threads").Document(threadId)
                        .Collection("comments").OrderBy("createdAt").GetSnapshotAsync()

                return snapshot.Documents |> Seq.map toComment |> Seq.toList
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

        let private annotationToDict (annotation: Annotation) =
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
                      "createdAt", toTimestamp annotation.CreatedAt ])

        let addAnnotation (threadId: string) (annotation: Annotation) : Task<Annotation> =
            task {
                let docRef =
                    db.Value.Collection("threads").Document(threadId)
                        .Collection("annotations").Document(annotation.Id)
                let! _ = annotation |> annotationToDict |> docRef.SetAsync
                return annotation
            }

        let getAnnotations (threadId: string) : Task<Annotation list> =
            task {
                let! snapshot =
                    db.Value.Collection("threads").Document(threadId)
                        .Collection("annotations").OrderBy("createdAt").GetSnapshotAsync()

                return snapshot.Documents |> Seq.map toAnnotation |> Seq.toList
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
        { GetByUser: string -> string -> Task<Thread list>
          GetById: string -> Task<Thread option>
          Create: Thread -> Task<Thread>
          Update: Thread -> Task<Thread>
          Delete: string -> Task<bool>
          SaveScore: string -> string -> string option -> SaveHistory -> Task<Thread option>
          UpdateSettings: string -> string -> string -> int -> string -> string -> Task<Thread option>
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
              Delete = InMemory.delete
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
              Delete = Firestore.delete
              SaveScore = Firestore.saveScore
              UpdateSettings = Firestore.updateSettings
              UpdateShare = Firestore.updateShare
              AddComment = Firestore.addComment
              GetComments = Firestore.getComments
              DeleteComment = Firestore.deleteComment
              AddAnnotation = Firestore.addAnnotation
              GetAnnotations = Firestore.getAnnotations
              DeleteAnnotation = Firestore.deleteAnnotation }
