namespace ChordBattle.Api.Thread

open System
open System.Collections.Concurrent
open System.Threading.Tasks
open ChordBattle.Api.Thread.Models

module Repository =

    // In-memory implementation for DEV_MODE / when Firestore is not configured
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

        let addPost (threadId: string) (post: Post) : Task<Thread option> =
            task {
                match threads.TryGetValue(threadId) with
                | true, thread ->
                    let updated = { thread with Posts = thread.Posts @ [ post ] }
                    threads.[threadId] <- updated
                    return Some updated
                | false, _ -> return None
            }

    // Firestore implementation
    module Firestore =

        open Google.Cloud.Firestore

        let private db =
            lazy (
                let projectId = Environment.GetEnvironmentVariable("FIRESTORE_PROJECT_ID")
                FirestoreDb.Create(projectId)
            )

        let private toPost (dict: System.Collections.Generic.IDictionary<string, obj>) : Post =
            { UserId = dict.["userId"] :?> string
              UserName = dict.["userName"] :?> string
              Chords = dict.["chords"] :?> string
              Comment = dict.["comment"] :?> string
              CreatedAt =
                  match dict.["createdAt"] with
                  | :? Timestamp as ts -> ts.ToDateTime()
                  | _ -> DateTime.UtcNow }

        let private toThread (doc: DocumentSnapshot) : Thread =
            let posts =
                match doc.GetValue<obj>("posts") with
                | :? System.Collections.IList as list ->
                    list
                    |> Seq.cast<System.Collections.Generic.IDictionary<string, obj>>
                    |> Seq.map toPost
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
              Posts = posts }

        let private toFirestorePost (post: Post) : System.Collections.Generic.Dictionary<string, obj> =
            let d = System.Collections.Generic.Dictionary<string, obj>()
            d.["userId"] <- post.UserId
            d.["userName"] <- post.UserName
            d.["chords"] <- post.Chords
            d.["comment"] <- post.Comment
            d.["createdAt"] <- Timestamp.FromDateTime(post.CreatedAt.ToUniversalTime())
            d

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
                              "posts", System.Collections.Generic.List<obj>() :> obj ]
                    )

                let! _ = docRef.SetAsync(data)
                return thread
            }

        let addPost (threadId: string) (post: Post) : Task<Thread option> =
            task {
                let docRef = db.Value.Collection("threads").Document(threadId)
                let! snapshot = docRef.GetSnapshotAsync()

                if snapshot.Exists then
                    let postData = toFirestorePost post
                    let! _ = docRef.UpdateAsync("posts", FieldValue.ArrayUnion(postData))
                    let! updated = docRef.GetSnapshotAsync()
                    return Some(toThread updated)
                else
                    return None
            }

    // Repository interface that delegates to the appropriate implementation
    type IThreadRepository =
        { GetAll: unit -> Task<Thread list>
          GetById: string -> Task<Thread option>
          Create: Thread -> Task<Thread>
          AddPost: string -> Post -> Task<Thread option> }

    let create (firestoreProjectId: string) : IThreadRepository =
        if String.IsNullOrEmpty(firestoreProjectId) then
            { GetAll = InMemory.getAll
              GetById = InMemory.getById
              Create = InMemory.create
              AddPost = InMemory.addPost }
        else
            { GetAll = Firestore.getAll
              GetById = Firestore.getById
              Create = Firestore.create
              AddPost = Firestore.addPost }
