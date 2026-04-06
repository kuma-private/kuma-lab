namespace TamekomaNight.Api.Song

open System
open System.Collections.Concurrent
open System.Threading.Tasks
open TamekomaNight.Api.Song.Models

module Repository =

    let canAccess (userId: string) (song: Song) : bool =
        song.CreatedBy = userId
        || song.Visibility = "public"
        || (song.Visibility = "shared" && song.SharedWith |> List.contains userId)

    let canAccessWithEmail (userId: string) (email: string) (song: Song) : bool =
        song.CreatedBy = userId
        || song.Visibility = "public"
        || (song.Visibility = "shared" &&
            (song.SharedWith |> List.contains userId
             || (email <> "" && song.SharedWith |> List.contains email)))

    module InMemory =

        let private songs = ConcurrentDictionary<string, Song>()

        let getByUser (userId: string) (email: string) : Task<Song list> =
            songs.Values
            |> Seq.filter (canAccessWithEmail userId email)
            |> Seq.toList
            |> List.sortByDescending (fun s -> s.CreatedAt)
            |> Task.FromResult

        let getById (id: string) : Task<Song option> =
            songs.TryGetValue(id)
            |> function
                | true, song -> Some song
                | false, _ -> None
            |> Task.FromResult

        let create (song: Song) : Task<Song> =
            songs.[song.Id] <- song
            Task.FromResult song

        let update (song: Song) : Task<Song> =
            songs.[song.Id] <- song
            Task.FromResult song

        let delete (songId: string) : Task<bool> =
            songs.TryRemove(songId) |> fst |> Task.FromResult

    module Firestore =

        open Google.Cloud.Firestore

        let private db =
            lazy (
                let projectId = Environment.GetEnvironmentVariable("FIRESTORE_PROJECT_ID")
                FirestoreDb.Create(projectId)
            )

        // --- Type-safe document field extraction helpers ---

        let private tryGetString (dict: System.Collections.Generic.IDictionary<string, obj>) (key: string) =
            match dict.TryGetValue(key) with
            | true, v when v <> null -> v :?> string
            | _ -> ""

        let private tryGetDocString (doc: DocumentSnapshot) (key: string) (defaultValue: string) =
            match doc.TryGetValue<string>(key) with
            | true, v when v <> null -> v
            | _ -> defaultValue

        let private tryGetDocInt (doc: DocumentSnapshot) (key: string) (defaultValue: int) =
            match doc.TryGetValue<int>(key) with
            | true, v -> v
            | _ -> defaultValue

        let private tryGetDocFloat (doc: DocumentSnapshot) (key: string) (defaultValue: float) =
            match doc.TryGetValue<float>(key) with
            | true, v -> v
            | _ -> defaultValue

        let private tryGetDocBool (doc: DocumentSnapshot) (key: string) (defaultValue: bool) =
            match doc.TryGetValue<bool>(key) with
            | true, v -> v
            | _ -> defaultValue

        let private tryGetDocTimestamp (doc: DocumentSnapshot) (key: string) (defaultValue: DateTime) =
            match doc.TryGetValue<Timestamp>(key) with
            | true, v -> v.ToDateTime()
            | _ -> defaultValue

        let private tryGetStringList (doc: DocumentSnapshot) (key: string) =
            match doc.TryGetValue<obj>(key) with
            | true, (:? System.Collections.IList as list) ->
                list |> Seq.cast<obj> |> Seq.map (fun o -> o :?> string) |> Seq.toList
            | _ -> []

        let private tryGetDictString (dict: System.Collections.Generic.IDictionary<string, obj>) (key: string) =
            match dict.TryGetValue(key) with
            | true, v when v <> null -> v :?> string
            | _ -> ""

        let private tryGetDictInt (dict: System.Collections.Generic.IDictionary<string, obj>) (key: string) (defaultValue: int) =
            match dict.TryGetValue(key) with
            | true, v when v <> null ->
                try System.Convert.ToInt32(v) with _ -> defaultValue
            | _ -> defaultValue

        let private tryGetDictFloat (dict: System.Collections.Generic.IDictionary<string, obj>) (key: string) (defaultValue: float) =
            match dict.TryGetValue(key) with
            | true, v when v <> null ->
                try System.Convert.ToDouble(v) with _ -> defaultValue
            | _ -> defaultValue

        let private tryGetDictBool (dict: System.Collections.Generic.IDictionary<string, obj>) (key: string) (defaultValue: bool) =
            match dict.TryGetValue(key) with
            | true, v when v <> null ->
                try System.Convert.ToBoolean(v) with _ -> defaultValue
            | _ -> defaultValue

        // --- Firestore document conversion ---

        let private toDirectiveBlock (dict: System.Collections.Generic.IDictionary<string, obj>) : DirectiveBlock =
            { Id = tryGetDictString dict "id"
              StartBar = tryGetDictInt dict "startBar" 0
              EndBar = tryGetDictInt dict "endBar" 0
              Directives = tryGetDictString dict "directives" }

        let private toTrack (dict: System.Collections.Generic.IDictionary<string, obj>) : Track =
            let blocks =
                match dict.TryGetValue("blocks") with
                | true, (:? System.Collections.IList as list) ->
                    list
                    |> Seq.cast<System.Collections.Generic.IDictionary<string, obj>>
                    |> Seq.map toDirectiveBlock
                    |> Seq.toList
                | _ -> []

            { Id = tryGetDictString dict "id"
              Name = tryGetDictString dict "name"
              Instrument = tryGetDictString dict "instrument"
              Blocks = blocks
              Volume = tryGetDictFloat dict "volume" 1.0
              Mute = tryGetDictBool dict "mute" false
              Solo = tryGetDictBool dict "solo" false }

        let private toSection (dict: System.Collections.Generic.IDictionary<string, obj>) : Section =
            { Id = tryGetDictString dict "id"
              Name = tryGetDictString dict "name"
              StartBar = tryGetDictInt dict "startBar" 0
              EndBar = tryGetDictInt dict "endBar" 0
              Color = tryGetDictString dict "color" }

        let private toSong (doc: DocumentSnapshot) : Song =
            let sections =
                match doc.TryGetValue<obj>("sections") with
                | true, (:? System.Collections.IList as list) ->
                    list
                    |> Seq.cast<System.Collections.Generic.IDictionary<string, obj>>
                    |> Seq.map toSection
                    |> Seq.toList
                | _ -> []

            let tracks =
                match doc.TryGetValue<obj>("tracks") with
                | true, (:? System.Collections.IList as list) ->
                    list
                    |> Seq.cast<System.Collections.Generic.IDictionary<string, obj>>
                    |> Seq.map toTrack
                    |> Seq.toList
                | _ -> []

            { Id = doc.Id
              Title = doc.GetValue<string>("title")
              Bpm = doc.GetValue<int>("bpm")
              TimeSignature = doc.GetValue<string>("timeSignature")
              Key = doc.GetValue<string>("key")
              ChordProgression = doc |> tryGetDocString <| "chordProgression" <| ""
              Sections = sections
              Tracks = tracks
              CreatedBy = doc.GetValue<string>("createdBy")
              CreatedByName = doc.GetValue<string>("createdByName")
              CreatedAt = doc.GetValue<Timestamp>("createdAt").ToDateTime()
              LastEditedBy = doc |> tryGetDocString <| "lastEditedBy" <| ""
              LastEditedAt = doc |> tryGetDocTimestamp <| "lastEditedAt" <| DateTime.UtcNow
              Visibility = doc |> tryGetDocString <| "visibility" <| "private"
              SharedWith = doc |> tryGetStringList <| "sharedWith" }

        // --- Firestore serialization helpers ---

        let private toStringList (items: string list) =
            System.Collections.Generic.List<obj>(items |> List.map (fun s -> s :> obj)) :> obj

        let private toTimestamp (dt: DateTime) =
            Timestamp.FromDateTime(dt.ToUniversalTime()) :> obj

        let private directiveBlockToDict (block: DirectiveBlock) : System.Collections.Generic.Dictionary<string, obj> =
            System.Collections.Generic.Dictionary<string, obj>(
                dict
                    [ "id", block.Id :> obj
                      "startBar", block.StartBar :> obj
                      "endBar", block.EndBar :> obj
                      "directives", block.Directives :> obj ])

        let private trackToDict (track: Track) : System.Collections.Generic.Dictionary<string, obj> =
            let blockDicts = track.Blocks |> List.map (fun b -> directiveBlockToDict b :> obj)
            System.Collections.Generic.Dictionary<string, obj>(
                dict
                    [ "id", track.Id :> obj
                      "name", track.Name :> obj
                      "instrument", track.Instrument :> obj
                      "blocks", (System.Collections.Generic.List<obj>(blockDicts) :> obj)
                      "volume", track.Volume :> obj
                      "mute", track.Mute :> obj
                      "solo", track.Solo :> obj ])

        let private sectionToDict (section: Section) : System.Collections.Generic.Dictionary<string, obj> =
            System.Collections.Generic.Dictionary<string, obj>(
                dict
                    [ "id", section.Id :> obj
                      "name", section.Name :> obj
                      "startBar", section.StartBar :> obj
                      "endBar", section.EndBar :> obj
                      "color", section.Color :> obj ])

        let private songToDict (song: Song) : System.Collections.Generic.Dictionary<string, obj> =
            let sectionDicts = song.Sections |> List.map (fun s -> sectionToDict s :> obj)
            let trackDicts = song.Tracks |> List.map (fun t -> trackToDict t :> obj)
            System.Collections.Generic.Dictionary<string, obj>(
                dict
                    [ "title", song.Title :> obj
                      "bpm", song.Bpm :> obj
                      "timeSignature", song.TimeSignature :> obj
                      "key", song.Key :> obj
                      "chordProgression", song.ChordProgression :> obj
                      "sections", (System.Collections.Generic.List<obj>(sectionDicts) :> obj)
                      "tracks", (System.Collections.Generic.List<obj>(trackDicts) :> obj)
                      "createdBy", song.CreatedBy :> obj
                      "createdByName", song.CreatedByName :> obj
                      "createdAt", toTimestamp song.CreatedAt
                      "lastEditedBy", song.LastEditedBy :> obj
                      "lastEditedAt", toTimestamp song.LastEditedAt
                      "visibility", song.Visibility :> obj
                      "sharedWith", toStringList song.SharedWith ])

        let private updateFields (docRef: DocumentReference) (updates: (string * obj) list) =
            task {
                let dict = System.Collections.Generic.Dictionary<string, obj>()
                for (k, v) in updates do
                    dict.[k] <- v
                let! _ = docRef.UpdateAsync(dict)
                ()
            }

        // --- CRUD operations ---

        let getByUser (userId: string) (email: string) : Task<Song list> =
            task {
                let collection = db.Value.Collection("songs")

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
                    |> Seq.map toSong
                    |> Seq.toList
                    |> List.sortByDescending (fun s -> s.CreatedAt)
            }

        let getById (id: string) : Task<Song option> =
            task {
                let! snapshot =
                    db.Value.Collection("songs").Document(id).GetSnapshotAsync()

                return
                    if snapshot.Exists then Some(toSong snapshot)
                    else None
            }

        let create (song: Song) : Task<Song> =
            task {
                let docRef = db.Value.Collection("songs").Document(song.Id)
                let! _ = song |> songToDict |> docRef.SetAsync
                return song
            }

        let update (song: Song) : Task<Song> =
            task {
                let docRef = db.Value.Collection("songs").Document(song.Id)
                let sectionDicts = song.Sections |> List.map (fun s -> sectionToDict s :> obj)
                let trackDicts = song.Tracks |> List.map (fun t -> trackToDict t :> obj)
                do! updateFields docRef [
                    "title", song.Title :> obj
                    "bpm", song.Bpm :> obj
                    "timeSignature", song.TimeSignature :> obj
                    "key", song.Key :> obj
                    "chordProgression", song.ChordProgression :> obj
                    "sections", (System.Collections.Generic.List<obj>(sectionDicts) :> obj)
                    "tracks", (System.Collections.Generic.List<obj>(trackDicts) :> obj)
                    "lastEditedBy", song.LastEditedBy :> obj
                    "lastEditedAt", toTimestamp song.LastEditedAt
                    "visibility", song.Visibility :> obj
                    "sharedWith", toStringList song.SharedWith
                ]
                return song
            }

        let delete (songId: string) : Task<bool> =
            task {
                let docRef = db.Value.Collection("songs").Document(songId)
                let! snapshot = docRef.GetSnapshotAsync()
                if snapshot.Exists then
                    let! _ = docRef.DeleteAsync()
                    return true
                else
                    return false
            }

    type ISongRepository =
        { GetByUser: string -> string -> Task<Song list>
          GetById: string -> Task<Song option>
          Create: Song -> Task<Song>
          Update: Song -> Task<Song>
          Delete: string -> Task<bool> }

    let create (firestoreProjectId: string) : ISongRepository =
        if String.IsNullOrEmpty(firestoreProjectId) then
            { GetByUser = InMemory.getByUser
              GetById = InMemory.getById
              Create = InMemory.create
              Update = InMemory.update
              Delete = InMemory.delete }
        else
            { GetByUser = Firestore.getByUser
              GetById = Firestore.getById
              Create = Firestore.create
              Update = Firestore.update
              Delete = Firestore.delete }
