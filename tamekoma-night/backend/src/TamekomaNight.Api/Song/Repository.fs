namespace TamekomaNight.Api.Song

open System
open System.Collections.Concurrent
open System.Threading.Tasks
open TamekomaNight.Api
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

        // Aliases for shared Firestore helpers
        let private tryGetDocString = FirestoreHelpers.tryGetDocString
        let private tryGetDocTimestamp = FirestoreHelpers.tryGetDocTimestamp
        let private tryGetStringList = FirestoreHelpers.tryGetStringList
        let private tryGetDictString = FirestoreHelpers.tryGetDictString
        let private tryGetDictInt = FirestoreHelpers.tryGetDictInt
        let private tryGetDictFloat = FirestoreHelpers.tryGetDictFloat
        let private tryGetDictBool = FirestoreHelpers.tryGetDictBool
        let private toStringList = FirestoreHelpers.toStringList
        let private toTimestamp = FirestoreHelpers.toTimestamp
        let private updateFields = FirestoreHelpers.updateFields

        // --- Firestore document conversion ---

        let private toMidiControlChange (dict: System.Collections.Generic.IDictionary<string, obj>) : MidiControlChange =
            { Tick = tryGetDictInt dict "tick" 0
              Cc = tryGetDictInt dict "cc" 0
              Value = tryGetDictInt dict "value" 0 }

        let private toMidiNoteData (dict: System.Collections.Generic.IDictionary<string, obj>) : MidiNoteData =
            { Midi = tryGetDictInt dict "midi" 0
              StartTick = tryGetDictInt dict "startTick" 0
              DurationTicks = tryGetDictInt dict "durationTicks" 0
              Velocity = tryGetDictInt dict "velocity" 0
              Channel = tryGetDictInt dict "channel" 0 }

        let private toGeneratedMidiData (dict: System.Collections.Generic.IDictionary<string, obj>) : GeneratedMidiData =
            let notes =
                match dict.TryGetValue("notes") with
                | true, (:? System.Collections.IList as list) ->
                    list
                    |> Seq.cast<System.Collections.Generic.IDictionary<string, obj>>
                    |> Seq.map toMidiNoteData
                    |> Seq.toList
                | _ -> []

            let controlChanges =
                match dict.TryGetValue("controlChanges") with
                | true, (:? System.Collections.IList as list) ->
                    list
                    |> Seq.cast<System.Collections.Generic.IDictionary<string, obj>>
                    |> Seq.map toMidiControlChange
                    |> Seq.toList
                    |> Some
                | _ -> None

            { Notes = notes
              Style = tryGetDictString dict "style"
              Expression = tryGetDictInt dict "expression" 0
              Feel = tryGetDictInt dict "feel" 0
              ControlChanges = controlChanges
              GeneratedAt = tryGetDictString dict "generatedAt" }

        let private toDirectiveBlock (dict: System.Collections.Generic.IDictionary<string, obj>) : DirectiveBlock =
            let generatedMidi =
                match dict.TryGetValue("generatedMidi") with
                | true, (:? System.Collections.Generic.IDictionary<string, obj> as midiDict) ->
                    Some (toGeneratedMidiData midiDict)
                | _ -> None

            { Id = tryGetDictString dict "id"
              StartBar = tryGetDictInt dict "startBar" 0
              EndBar = tryGetDictInt dict "endBar" 0
              Directives = tryGetDictString dict "directives"
              GeneratedMidi = generatedMidi }

        let private toTrack (dict: System.Collections.Generic.IDictionary<string, obj>) : Track =
            let blocks =
                match dict.TryGetValue("blocks") with
                | true, (:? System.Collections.IList as list) ->
                    list
                    |> Seq.cast<System.Collections.Generic.IDictionary<string, obj>>
                    |> Seq.map toDirectiveBlock
                    |> Seq.toList
                | _ -> []

            let program =
                match dict.TryGetValue("program") with
                | true, v when isNotNull v ->
                    try Some (System.Convert.ToInt32(v))
                    with _ -> None
                | _ -> None

            { Id = tryGetDictString dict "id"
              Name = tryGetDictString dict "name"
              Instrument = tryGetDictString dict "instrument"
              Program = program
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

        let private midiControlChangeToDict (cc: MidiControlChange) : System.Collections.Generic.Dictionary<string, obj> =
            System.Collections.Generic.Dictionary<string, obj>(
                dict
                    [ "tick", cc.Tick :> obj
                      "cc", cc.Cc :> obj
                      "value", cc.Value :> obj ])

        let private midiNoteDataToDict (note: MidiNoteData) : System.Collections.Generic.Dictionary<string, obj> =
            System.Collections.Generic.Dictionary<string, obj>(
                dict
                    [ "midi", note.Midi :> obj
                      "startTick", note.StartTick :> obj
                      "durationTicks", note.DurationTicks :> obj
                      "velocity", note.Velocity :> obj
                      "channel", note.Channel :> obj ])

        let private generatedMidiDataToDict (midi: GeneratedMidiData) : System.Collections.Generic.Dictionary<string, obj> =
            let noteDicts = midi.Notes |> List.map (fun n -> midiNoteDataToDict n :> obj)
            let baseFields =
                [ "notes", (System.Collections.Generic.List<obj>(noteDicts) :> obj)
                  "style", midi.Style :> obj
                  "expression", midi.Expression :> obj
                  "feel", midi.Feel :> obj
                  "generatedAt", midi.GeneratedAt :> obj ]

            let allFields =
                match midi.ControlChanges with
                | Some ccs ->
                    let ccDicts = ccs |> List.map (fun c -> midiControlChangeToDict c :> obj)
                    baseFields @ [ "controlChanges", (System.Collections.Generic.List<obj>(ccDicts) :> obj) ]
                | None -> baseFields

            System.Collections.Generic.Dictionary<string, obj>(dict allFields)

        let private directiveBlockToDict (block: DirectiveBlock) : System.Collections.Generic.Dictionary<string, obj> =
            let baseFields =
                [ "id", block.Id :> obj
                  "startBar", block.StartBar :> obj
                  "endBar", block.EndBar :> obj
                  "directives", block.Directives :> obj ]

            let allFields =
                match block.GeneratedMidi with
                | Some midi -> baseFields @ [ "generatedMidi", generatedMidiDataToDict midi :> obj ]
                | None -> baseFields

            System.Collections.Generic.Dictionary<string, obj>(dict allFields)

        let private trackToDict (track: Track) : System.Collections.Generic.Dictionary<string, obj> =
            let blockDicts = track.Blocks |> List.map (fun b -> directiveBlockToDict b :> obj)
            let baseFields =
                [ "id", track.Id :> obj
                  "name", track.Name :> obj
                  "instrument", track.Instrument :> obj
                  "blocks", (System.Collections.Generic.List<obj>(blockDicts) :> obj)
                  "volume", track.Volume :> obj
                  "mute", track.Mute :> obj
                  "solo", track.Solo :> obj ]

            let allFields =
                match track.Program with
                | Some p -> baseFields @ [ "program", p :> obj ]
                | None -> baseFields

            System.Collections.Generic.Dictionary<string, obj>(dict allFields)

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
