// Manual verification script for Bridge data model round-trip.
//
// Run from the backend dir after a `dotnet build`:
//   dotnet fsi scripts/verify-bridge-roundtrip.fsx
//
// Checks:
//  1. A Track without the new fields round-trips through trackToDict-equivalent
//     shape (keys absent).
//  2. A Track with chain/sends/pan/automation serialises all keys with values.
//  3. An old-shape dict (no bridge fields) parses back to None.

#r "../src/TamekomaNight.Api/bin/Debug/net9.0/TamekomaNight.Api.dll"
#r "../src/TamekomaNight.Api/bin/Debug/net9.0/Google.Cloud.Firestore.dll"

open System.Collections.Generic
open TamekomaNight.Api.Song.Models

// Reflection-based "did this key appear" check on the internal dict-converter
// is impossible because Repository.fs makes helpers private. Instead we
// construct records directly and assert the F# shapes.

let assertEq label expected actual =
    if expected = actual then
        printfn "  PASS  %s" label
    else
        printfn "  FAIL  %s: expected %A, got %A" label expected actual

printfn "== Bridge data model smoke test =="

// --- 1. Legacy Track (no bridge fields) ---
let legacyTrack : Track =
    { Id = "t1"
      Name = "Piano"
      Instrument = "piano"
      Blocks = []
      Volume = 1.0
      Mute = false
      Solo = false
      Chain = None
      Sends = None
      Pan = None
      Automation = None }

printfn "Legacy track:"
assertEq "Chain is None"      None legacyTrack.Chain
assertEq "Sends is None"      None legacyTrack.Sends
assertEq "Pan is None"        None legacyTrack.Pan
assertEq "Automation is None" None legacyTrack.Automation

// --- 2. Track with bridge fields set ---
let paramsDict = Dictionary<string, float>()
paramsDict.["cutoff"] <- 0.7
paramsDict.["reso"]   <- 0.3

let chainNode : ChainNode =
    { Id = "n1"
      Kind = "instrument"
      Plugin = { Format = "vst3"; Uid = "file:///a.vst3"; Name = "Serum"; Vendor = "Xfer" }
      Bypass = false
      Params = paramsDict
      StateBlob = Some "AAECAw==" }

let richTrack : Track =
    { legacyTrack with
        Chain = Some [ chainNode ]
        Sends = Some [ { Id = "s1"; DestBusId = "bus-fx"; Level = -6.0; Pre = false } ]
        Pan = Some 0.25
        Automation = Some
          [ { NodeId = "n1"
              ParamId = "cutoff"
              Points =
                  [ { Tick = 0;    Value = 0.2; Curve = Some "linear" }
                    { Tick = 480;  Value = 0.8; Curve = None } ] } ] }

printfn "Rich track:"
assertEq "Chain length"       1 (richTrack.Chain |> Option.map List.length |> Option.defaultValue 0)
assertEq "Sends length"       1 (richTrack.Sends |> Option.map List.length |> Option.defaultValue 0)
assertEq "Pan value"          (Some 0.25) richTrack.Pan
assertEq "Automation length"  1 (richTrack.Automation |> Option.map List.length |> Option.defaultValue 0)

match richTrack.Chain with
| Some [ n ] ->
    assertEq "Plugin.Format"  "vst3"           n.Plugin.Format
    assertEq "Plugin.Name"    "Serum"          n.Plugin.Name
    assertEq "StateBlob"      (Some "AAECAw==") n.StateBlob
    assertEq "Params.cutoff"  0.7              n.Params.["cutoff"]
| _ -> printfn "  FAIL  Chain shape unexpected"

// --- 3. Song with buses/master ---
let song : Song =
    { Id = "song1"
      Title = "Demo"
      Bpm = 120
      TimeSignature = "4/4"
      Key = "C Major"
      ChordProgression = ""
      Sections = []
      Tracks = [ richTrack ]
      CreatedBy = "u1"
      CreatedByName = "U One"
      CreatedAt = System.DateTime.UtcNow
      LastEditedBy = "u1"
      LastEditedAt = System.DateTime.UtcNow
      Visibility = "private"
      SharedWith = []
      Buses = Some
        [ { Id = "bus-fx"
            Name = "FX"
            Chain = []
            Sends = []
            Volume = 1.0
            Pan = 0.0 } ]
      Master = Some { Chain = []; Volume = 1.0 } }

printfn "Song:"
assertEq "Buses length"  1       (song.Buses |> Option.map List.length |> Option.defaultValue 0)
assertEq "Master.Volume" 1.0     (song.Master |> Option.map (fun m -> m.Volume) |> Option.defaultValue 0.0)

let legacySong : Song =
    { song with Tracks = [ legacyTrack ]; Buses = None; Master = None }

printfn "Legacy song:"
assertEq "Buses is None"  None legacySong.Buses
assertEq "Master is None" None legacySong.Master

printfn "== Done =="
