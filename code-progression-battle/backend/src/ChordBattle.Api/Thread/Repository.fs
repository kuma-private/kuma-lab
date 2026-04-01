namespace ChordBattle.Api.Thread

open System
open System.Collections.Concurrent
open System.Threading.Tasks
open ChordBattle.Api.Thread.Models

module Repository =

    module InMemory =

        let private threads = ConcurrentDictionary<string, Thread>()

        let getAll () : Task<Thread list> =
            task {
                return
                    threads.Values
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
              History = history }

        let getAll () : Task<Thread list> =
            task {
                let collection = db.Value.Collection("threads")
                let! snapshot = collection.OrderByDescending("createdAt").GetSnapshotAsync()

                return
                    snapshot.Documents
                    |> Seq.map toThread
                    |> Seq.toList
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
                              "history", System.Collections.Generic.List<obj>() :> obj ]
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

    type IThreadRepository =
        { GetAll: unit -> Task<Thread list>
          GetById: string -> Task<Thread option>
          Create: Thread -> Task<Thread>
          Update: Thread -> Task<Thread>
          SaveScore: string -> string -> SaveHistory -> Task<Thread option>
          UpdateSettings: string -> string -> string -> int -> string -> Task<Thread option> }

    let create (firestoreProjectId: string) : IThreadRepository =
        if String.IsNullOrEmpty(firestoreProjectId) then
            { GetAll = InMemory.getAll
              GetById = InMemory.getById
              Create = InMemory.create
              Update = InMemory.update
              SaveScore = InMemory.saveScore
              UpdateSettings = InMemory.updateSettings }
        else
            { GetAll = Firestore.getAll
              GetById = Firestore.getById
              Create = Firestore.create
              Update = Firestore.update
              SaveScore = Firestore.saveScore
              UpdateSettings = Firestore.updateSettings }
