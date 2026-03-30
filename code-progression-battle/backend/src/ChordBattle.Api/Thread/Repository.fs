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

        let joinThread (threadId: string) (opponentId: string) (opponentName: string) : Task<Thread option> =
            task {
                match threads.TryGetValue(threadId) with
                | true, thread ->
                    let updated =
                        { thread with
                            OpponentId = opponentId
                            OpponentName = opponentName
                            Status = "active" }
                    threads.[threadId] <- updated
                    return Some updated
                | false, _ -> return None
            }

        let executeTurn (threadId: string) (action: TurnAction) (updatedLines: Line list) (nextTurn: string) : Task<Thread option> =
            task {
                match threads.TryGetValue(threadId) with
                | true, thread ->
                    let updated =
                        { thread with
                            Lines = updatedLines
                            History = thread.History @ [ action ]
                            CurrentTurn = nextTurn
                            TurnCount = thread.TurnCount + 1 }
                    threads.[threadId] <- updated
                    return Some updated
                | false, _ -> return None
            }

        let proposeFinish (threadId: string) (userId: string) (nextTurn: string) : Task<Thread option> =
            task {
                match threads.TryGetValue(threadId) with
                | true, thread ->
                    let updated =
                        { thread with
                            Status = "finish_proposed"
                            FinishProposedBy = userId
                            CurrentTurn = nextTurn }
                    threads.[threadId] <- updated
                    return Some updated
                | false, _ -> return None
            }

        let acceptFinish (threadId: string) : Task<Thread option> =
            task {
                match threads.TryGetValue(threadId) with
                | true, thread ->
                    let updated = { thread with Status = "completed" }
                    threads.[threadId] <- updated
                    return Some updated
                | false, _ -> return None
            }

        let rejectFinish (threadId: string) (rejecterTurn: string) : Task<Thread option> =
            task {
                match threads.TryGetValue(threadId) with
                | true, thread ->
                    let updated =
                        { thread with
                            Status = "active"
                            FinishProposedBy = ""
                            CurrentTurn = rejecterTurn }
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

        let private toLine (dict: System.Collections.Generic.IDictionary<string, obj>) : Line =
            { LineNumber = dict.["lineNumber"] :?> int64 |> int
              Chords = dict.["chords"] :?> string
              AddedBy = dict.["addedBy"] :?> string
              AddedByName = dict.["addedByName"] :?> string
              LastEditedBy = dict.["lastEditedBy"] :?> string }

        let private toTurnAction (dict: System.Collections.Generic.IDictionary<string, obj>) : TurnAction =
            { TurnNumber = dict.["turnNumber"] :?> int64 |> int
              UserId = dict.["userId"] :?> string
              UserName = dict.["userName"] :?> string
              Action = dict.["action"] :?> string
              LineNumber = dict.["lineNumber"] :?> int64 |> int
              Chords = dict.["chords"] :?> string
              PreviousChords = dict.["previousChords"] :?> string
              Comment = dict.["comment"] :?> string
              CreatedAt =
                  match dict.["createdAt"] with
                  | :? Timestamp as ts -> ts.ToDateTime()
                  | _ -> DateTime.UtcNow }

        let private toThread (doc: DocumentSnapshot) : Thread =
            let lines =
                match doc.GetValue<obj>("lines") with
                | :? System.Collections.IList as list ->
                    list
                    |> Seq.cast<System.Collections.Generic.IDictionary<string, obj>>
                    |> Seq.map toLine
                    |> Seq.toList
                | _ -> []

            let history =
                match doc.GetValue<obj>("history") with
                | :? System.Collections.IList as list ->
                    list
                    |> Seq.cast<System.Collections.Generic.IDictionary<string, obj>>
                    |> Seq.map toTurnAction
                    |> Seq.toList
                | _ -> []

            { Id = doc.Id
              Title = doc.GetValue<string>("title")
              Key = doc.GetValue<string>("key")
              TimeSignature = doc.GetValue<string>("timeSignature")
              Bpm = doc.GetValue<int>("bpm")
              CreatedBy = doc.GetValue<string>("createdBy")
              CreatedByName = doc.GetValue<string>("createdByName")
              OpponentId = doc.GetValue<string>("opponentId")
              OpponentName = doc.GetValue<string>("opponentName")
              OpponentEmail = doc.GetValue<string>("opponentEmail")
              CreatedAt = doc.GetValue<Timestamp>("createdAt").ToDateTime()
              Status = doc.GetValue<string>("status")
              CurrentTurn = doc.GetValue<string>("currentTurn")
              TurnCount = doc.GetValue<int>("turnCount")
              FinishProposedBy = doc.GetValue<string>("finishProposedBy")
              Lines = lines
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
                              "opponentId", thread.OpponentId :> obj
                              "opponentName", thread.OpponentName :> obj
                              "opponentEmail", thread.OpponentEmail :> obj
                              "createdAt", Timestamp.FromDateTime(thread.CreatedAt.ToUniversalTime()) :> obj
                              "status", thread.Status :> obj
                              "currentTurn", thread.CurrentTurn :> obj
                              "turnCount", thread.TurnCount :> obj
                              "finishProposedBy", thread.FinishProposedBy :> obj
                              "lines", System.Collections.Generic.List<obj>() :> obj
                              "history", System.Collections.Generic.List<obj>() :> obj ]
                    )

                let! _ = docRef.SetAsync(data)
                return thread
            }

        let private lineToDict (line: Line) : System.Collections.Generic.Dictionary<string, obj> =
            System.Collections.Generic.Dictionary<string, obj>(
                dict
                    [ "lineNumber", line.LineNumber :> obj
                      "chords", line.Chords :> obj
                      "addedBy", line.AddedBy :> obj
                      "addedByName", line.AddedByName :> obj
                      "lastEditedBy", line.LastEditedBy :> obj ]
            )

        let private turnActionToDict (a: TurnAction) : System.Collections.Generic.Dictionary<string, obj> =
            System.Collections.Generic.Dictionary<string, obj>(
                dict
                    [ "turnNumber", a.TurnNumber :> obj
                      "userId", a.UserId :> obj
                      "userName", a.UserName :> obj
                      "action", a.Action :> obj
                      "lineNumber", a.LineNumber :> obj
                      "chords", a.Chords :> obj
                      "previousChords", a.PreviousChords :> obj
                      "comment", a.Comment :> obj
                      "createdAt", Timestamp.FromDateTime(a.CreatedAt.ToUniversalTime()) :> obj ]
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
                let lineDicts = thread.Lines |> List.map (fun l -> lineToDict l :> obj)
                let histDicts = thread.History |> List.map (fun a -> turnActionToDict a :> obj)
                do! updateFields docRef [
                    "lines", (System.Collections.Generic.List<obj>(lineDicts) :> obj)
                    "history", (System.Collections.Generic.List<obj>(histDicts) :> obj)
                    "status", thread.Status :> obj
                    "currentTurn", thread.CurrentTurn :> obj
                    "turnCount", thread.TurnCount :> obj
                    "finishProposedBy", thread.FinishProposedBy :> obj
                    "opponentId", thread.OpponentId :> obj
                    "opponentName", thread.OpponentName :> obj
                ]
                return thread
            }

        let joinThread (threadId: string) (opponentId: string) (opponentName: string) : Task<Thread option> =
            task {
                let! existing = getById threadId
                match existing with
                | None -> return None
                | Some thread ->
                    let updated =
                        { thread with
                            OpponentId = opponentId
                            OpponentName = opponentName
                            Status = "active" }
                    let! result = update updated
                    return Some result
            }

        let executeTurn (threadId: string) (action: TurnAction) (updatedLines: Line list) (nextTurn: string) : Task<Thread option> =
            task {
                let! existing = getById threadId
                match existing with
                | None -> return None
                | Some thread ->
                    let updated =
                        { thread with
                            Lines = updatedLines
                            History = thread.History @ [ action ]
                            CurrentTurn = nextTurn
                            TurnCount = thread.TurnCount + 1 }
                    let! result = update updated
                    return Some result
            }

        let proposeFinish (threadId: string) (userId: string) (nextTurn: string) : Task<Thread option> =
            task {
                let! existing = getById threadId
                match existing with
                | None -> return None
                | Some thread ->
                    let updated =
                        { thread with
                            Status = "finish_proposed"
                            FinishProposedBy = userId
                            CurrentTurn = nextTurn }
                    let! result = update updated
                    return Some result
            }

        let acceptFinish (threadId: string) : Task<Thread option> =
            task {
                let! existing = getById threadId
                match existing with
                | None -> return None
                | Some thread ->
                    let updated = { thread with Status = "completed" }
                    let! result = update updated
                    return Some result
            }

        let rejectFinish (threadId: string) (rejecterTurn: string) : Task<Thread option> =
            task {
                let! existing = getById threadId
                match existing with
                | None -> return None
                | Some thread ->
                    let updated =
                        { thread with
                            Status = "active"
                            FinishProposedBy = ""
                            CurrentTurn = rejecterTurn }
                    let! result = update updated
                    return Some result
            }

    type IThreadRepository =
        { GetAll: unit -> Task<Thread list>
          GetById: string -> Task<Thread option>
          Create: Thread -> Task<Thread>
          Update: Thread -> Task<Thread>
          JoinThread: string -> string -> string -> Task<Thread option>
          ExecuteTurn: string -> TurnAction -> Line list -> string -> Task<Thread option>
          ProposeFinish: string -> string -> string -> Task<Thread option>
          AcceptFinish: string -> Task<Thread option>
          RejectFinish: string -> string -> Task<Thread option> }

    let create (firestoreProjectId: string) : IThreadRepository =
        if String.IsNullOrEmpty(firestoreProjectId) then
            { GetAll = InMemory.getAll
              GetById = InMemory.getById
              Create = InMemory.create
              Update = InMemory.update
              JoinThread = InMemory.joinThread
              ExecuteTurn = InMemory.executeTurn
              ProposeFinish = InMemory.proposeFinish
              AcceptFinish = InMemory.acceptFinish
              RejectFinish = InMemory.rejectFinish }
        else
            { GetAll = Firestore.getAll
              GetById = Firestore.getById
              Create = Firestore.create
              Update = Firestore.update
              JoinThread = Firestore.joinThread
              ExecuteTurn = Firestore.executeTurn
              ProposeFinish = Firestore.proposeFinish
              AcceptFinish = Firestore.acceptFinish
              RejectFinish = Firestore.rejectFinish }
