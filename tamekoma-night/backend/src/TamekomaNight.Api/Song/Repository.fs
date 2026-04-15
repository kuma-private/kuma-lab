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
        let private tryGetDocInt = FirestoreHelpers.tryGetDocInt
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

            { Notes = notes
              Style = tryGetDictString dict "style"
              Expression = tryGetDictInt dict "expression" 0
              Feel = tryGetDictInt dict "feel" 0
              GeneratedAt = tryGetDictString dict "generatedAt" }

        // ── Bridge extensions: Firestore readers ──────────────

        let private toDictOfObj (v: obj) : System.Collections.Generic.IDictionary<string, obj> option =
            match v with
            | :? System.Collections.Generic.IDictionary<string, obj> as d -> Some d
            | _ -> None

        let private toListOf<'T>
            (dict: System.Collections.Generic.IDictionary<string, obj>)
            (key: string)
            (conv: System.Collections.Generic.IDictionary<string, obj> -> 'T)
            : 'T list =
            match dict.TryGetValue(key) with
            | true, (:? System.Collections.IList as list) ->
                list
                |> Seq.cast<obj>
                |> Seq.choose toDictOfObj
                |> Seq.map conv
                |> Seq.toList
            | _ -> []

        let private toOptionalListOf<'T>
            (dict: System.Collections.Generic.IDictionary<string, obj>)
            (key: string)
            (conv: System.Collections.Generic.IDictionary<string, obj> -> 'T)
            : 'T list option =
            match dict.TryGetValue(key) with
            | true, (:? System.Collections.IList as list) ->
                Some (
                    list
                    |> Seq.cast<obj>
                    |> Seq.choose toDictOfObj
                    |> Seq.map conv
                    |> Seq.toList)
            | _ -> None

        let private tryGetDocOptionalList<'T>
            (doc: DocumentSnapshot)
            (key: string)
            (conv: System.Collections.Generic.IDictionary<string, obj> -> 'T)
            : 'T list option =
            match doc.TryGetValue<obj>(key) with
            | true, (:? System.Collections.IList as list) ->
                Some (
                    list
                    |> Seq.cast<obj>
                    |> Seq.choose toDictOfObj
                    |> Seq.map conv
                    |> Seq.toList)
            | _ -> None

        let private toPluginRef (dict: System.Collections.Generic.IDictionary<string, obj>) : PluginRef =
            { Format = tryGetDictString dict "format"
              Uid = tryGetDictString dict "uid"
              Name = tryGetDictString dict "name"
              Vendor = tryGetDictString dict "vendor" }

        let private toChainNode (dict: System.Collections.Generic.IDictionary<string, obj>) : ChainNode =
            let plugin =
                match dict.TryGetValue("plugin") with
                | true, v ->
                    match toDictOfObj v with
                    | Some d -> toPluginRef d
                    | None -> { Format = ""; Uid = ""; Name = ""; Vendor = "" }
                | _ -> { Format = ""; Uid = ""; Name = ""; Vendor = "" }

            let paramsDict = System.Collections.Generic.Dictionary<string, float>()
            match dict.TryGetValue("params") with
            | true, v ->
                match toDictOfObj v with
                | Some d ->
                    for kv in d do
                        try paramsDict.[kv.Key] <- System.Convert.ToDouble(kv.Value)
                        with _ -> ()
                | None -> ()
            | _ -> ()

            let stateBlob =
                match dict.TryGetValue("stateBlob") with
                | true, v when v <> null -> Some (v :?> string)
                | _ -> None

            { Id = tryGetDictString dict "id"
              Kind = tryGetDictString dict "kind"
              Plugin = plugin
              Bypass = tryGetDictBool dict "bypass" false
              Params = paramsDict
              StateBlob = stateBlob }

        let private toSend (dict: System.Collections.Generic.IDictionary<string, obj>) : Send =
            { Id = tryGetDictString dict "id"
              DestBusId = tryGetDictString dict "destBusId"
              Level = tryGetDictFloat dict "level" 0.0
              Pre = tryGetDictBool dict "pre" false }

        let private toAutomationPoint (dict: System.Collections.Generic.IDictionary<string, obj>) : AutomationPoint =
            let curve =
                match dict.TryGetValue("curve") with
                | true, v when v <> null -> Some (v :?> string)
                | _ -> None
            { Tick = tryGetDictInt dict "tick" 0
              Value = tryGetDictFloat dict "value" 0.0
              Curve = curve }

        let private toAutomation (dict: System.Collections.Generic.IDictionary<string, obj>) : Automation =
            { NodeId = tryGetDictString dict "nodeId"
              ParamId = tryGetDictString dict "paramId"
              Points = toListOf dict "points" toAutomationPoint }

        let private toBus (dict: System.Collections.Generic.IDictionary<string, obj>) : Bus =
            { Id = tryGetDictString dict "id"
              Name = tryGetDictString dict "name"
              Chain = toListOf dict "chain" toChainNode
              Sends = toListOf dict "sends" toSend
              Volume = tryGetDictFloat dict "volume" 1.0
              Pan = tryGetDictFloat dict "pan" 0.0 }

        let private toMaster (dict: System.Collections.Generic.IDictionary<string, obj>) : Master =
            { Chain = toListOf dict "chain" toChainNode
              Volume = tryGetDictFloat dict "volume" 1.0 }

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

            let pan =
                match dict.TryGetValue("pan") with
                | true, v when v <> null ->
                    try Some (System.Convert.ToDouble(v)) with _ -> None
                | _ -> None

            { Id = tryGetDictString dict "id"
              Name = tryGetDictString dict "name"
              Instrument = tryGetDictString dict "instrument"
              Blocks = blocks
              Volume = tryGetDictFloat dict "volume" 1.0
              Mute = tryGetDictBool dict "mute" false
              Solo = tryGetDictBool dict "solo" false
              Chain = toOptionalListOf dict "chain" toChainNode
              Sends = toOptionalListOf dict "sends" toSend
              Pan = pan
              Automation = toOptionalListOf dict "automation" toAutomation }

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

            let buses = tryGetDocOptionalList doc "buses" toBus

            let master =
                match doc.TryGetValue<obj>("master") with
                | true, v ->
                    match toDictOfObj v with
                    | Some d -> Some (toMaster d)
                    | None -> None
                | _ -> None

            // Use tryGet* wrappers for every field so a Firestore doc that
            // is missing any optional column (e.g. an older song saved
            // before a schema field was added) loads cleanly with a sane
            // default instead of throwing ArgumentNullException and
            // crashing the request.
            { Id = doc.Id
              Title = doc |> tryGetDocString <| "title" <| "Untitled"
              Bpm = doc |> tryGetDocInt <| "bpm" <| 120
              TimeSignature = doc |> tryGetDocString <| "timeSignature" <| "4/4"
              Key = doc |> tryGetDocString <| "key" <| "C"
              ChordProgression = doc |> tryGetDocString <| "chordProgression" <| ""
              Sections = sections
              Tracks = tracks
              CreatedBy = doc |> tryGetDocString <| "createdBy" <| ""
              CreatedByName = doc |> tryGetDocString <| "createdByName" <| ""
              CreatedAt = doc |> tryGetDocTimestamp <| "createdAt" <| DateTime.UtcNow
              LastEditedBy = doc |> tryGetDocString <| "lastEditedBy" <| ""
              LastEditedAt = doc |> tryGetDocTimestamp <| "lastEditedAt" <| DateTime.UtcNow
              Visibility = doc |> tryGetDocString <| "visibility" <| "private"
              SharedWith = doc |> tryGetStringList <| "sharedWith"
              Buses = buses
              Master = master }

        // --- Firestore serialization helpers ---

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
            System.Collections.Generic.Dictionary<string, obj>(
                dict
                    [ "notes", (System.Collections.Generic.List<obj>(noteDicts) :> obj)
                      "style", midi.Style :> obj
                      "expression", midi.Expression :> obj
                      "feel", midi.Feel :> obj
                      "generatedAt", midi.GeneratedAt :> obj ])

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

        // ── Bridge extensions: Firestore writers ──────────────

        let private pluginRefToDict (p: PluginRef) : System.Collections.Generic.Dictionary<string, obj> =
            System.Collections.Generic.Dictionary<string, obj>(
                dict
                    [ "format", p.Format :> obj
                      "uid", p.Uid :> obj
                      "name", p.Name :> obj
                      "vendor", p.Vendor :> obj ])

        let private chainNodeToDict (n: ChainNode) : System.Collections.Generic.Dictionary<string, obj> =
            let paramsDict = System.Collections.Generic.Dictionary<string, obj>()
            if not (obj.ReferenceEquals(n.Params, null)) then
                for kv in n.Params do
                    paramsDict.[kv.Key] <- kv.Value :> obj

            let baseFields =
                [ "id", n.Id :> obj
                  "kind", n.Kind :> obj
                  "plugin", pluginRefToDict n.Plugin :> obj
                  "bypass", n.Bypass :> obj
                  "params", paramsDict :> obj ]

            let allFields =
                match n.StateBlob with
                | Some b -> baseFields @ [ "stateBlob", b :> obj ]
                | None -> baseFields

            System.Collections.Generic.Dictionary<string, obj>(dict allFields)

        let private sendToDict (s: Send) : System.Collections.Generic.Dictionary<string, obj> =
            System.Collections.Generic.Dictionary<string, obj>(
                dict
                    [ "id", s.Id :> obj
                      "destBusId", s.DestBusId :> obj
                      "level", s.Level :> obj
                      "pre", s.Pre :> obj ])

        let private automationPointToDict (p: AutomationPoint) : System.Collections.Generic.Dictionary<string, obj> =
            let baseFields =
                [ "tick", p.Tick :> obj
                  "value", p.Value :> obj ]
            let allFields =
                match p.Curve with
                | Some c -> baseFields @ [ "curve", c :> obj ]
                | None -> baseFields
            System.Collections.Generic.Dictionary<string, obj>(dict allFields)

        let private automationToDict (a: Automation) : System.Collections.Generic.Dictionary<string, obj> =
            let pointDicts = a.Points |> List.map (fun p -> automationPointToDict p :> obj)
            System.Collections.Generic.Dictionary<string, obj>(
                dict
                    [ "nodeId", a.NodeId :> obj
                      "paramId", a.ParamId :> obj
                      "points", (System.Collections.Generic.List<obj>(pointDicts) :> obj) ])

        let private busToDict (b: Bus) : System.Collections.Generic.Dictionary<string, obj> =
            let chainDicts = b.Chain |> List.map (fun c -> chainNodeToDict c :> obj)
            let sendDicts = b.Sends |> List.map (fun s -> sendToDict s :> obj)
            System.Collections.Generic.Dictionary<string, obj>(
                dict
                    [ "id", b.Id :> obj
                      "name", b.Name :> obj
                      "chain", (System.Collections.Generic.List<obj>(chainDicts) :> obj)
                      "sends", (System.Collections.Generic.List<obj>(sendDicts) :> obj)
                      "volume", b.Volume :> obj
                      "pan", b.Pan :> obj ])

        let private masterToDict (m: Master) : System.Collections.Generic.Dictionary<string, obj> =
            let chainDicts = m.Chain |> List.map (fun c -> chainNodeToDict c :> obj)
            System.Collections.Generic.Dictionary<string, obj>(
                dict
                    [ "chain", (System.Collections.Generic.List<obj>(chainDicts) :> obj)
                      "volume", m.Volume :> obj ])

        /// Wrap a list of records as a Firestore List<obj>. `Some []` becomes an empty list
        /// (distinguishable from `None`, which means the field is omitted entirely).
        let private optionalListField
            (key: string)
            (value: 'T list option)
            (toItemDict: 'T -> System.Collections.Generic.Dictionary<string, obj>)
            : (string * obj) list =
            match value with
            | None -> []
            | Some items ->
                let itemDicts = items |> List.map (fun i -> toItemDict i :> obj)
                [ key, (System.Collections.Generic.List<obj>(itemDicts) :> obj) ]

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

            let chainFields = optionalListField "chain" track.Chain chainNodeToDict
            let sendFields = optionalListField "sends" track.Sends sendToDict
            let automationFields = optionalListField "automation" track.Automation automationToDict
            let panFields =
                match track.Pan with
                | Some p -> [ "pan", p :> obj ]
                | None -> []

            System.Collections.Generic.Dictionary<string, obj>(
                dict (baseFields @ chainFields @ sendFields @ panFields @ automationFields))

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
            let baseFields =
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
                  "sharedWith", toStringList song.SharedWith ]

            let busesFields = optionalListField "buses" song.Buses busToDict
            let masterFields =
                match song.Master with
                | Some m -> [ "master", masterToDict m :> obj ]
                | None -> []

            System.Collections.Generic.Dictionary<string, obj>(
                dict (baseFields @ busesFields @ masterFields))

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
                let baseFields =
                    [ "title", song.Title :> obj
                      "bpm", song.Bpm :> obj
                      "timeSignature", song.TimeSignature :> obj
                      "key", song.Key :> obj
                      "chordProgression", song.ChordProgression :> obj
                      "sections", (System.Collections.Generic.List<obj>(sectionDicts) :> obj)
                      "tracks", (System.Collections.Generic.List<obj>(trackDicts) :> obj)
                      "lastEditedBy", song.LastEditedBy :> obj
                      "lastEditedAt", toTimestamp song.LastEditedAt
                      "visibility", song.Visibility :> obj
                      "sharedWith", toStringList song.SharedWith ]
                let busesFields = optionalListField "buses" song.Buses busToDict
                let masterFields =
                    match song.Master with
                    | Some m -> [ "master", masterToDict m :> obj ]
                    | None -> []
                do! updateFields docRef (baseFields @ busesFields @ masterFields)
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
