namespace TamekomaNight.Api.Song

open System
open TamekomaNight.Api

module Models =

    type MidiNoteData =
        { Midi: int
          StartTick: int
          DurationTicks: int
          Velocity: int
          Channel: int }

    type GeneratedMidiData =
        { Notes: MidiNoteData list
          Style: string
          Expression: int
          Feel: int
          GeneratedAt: string }

    type DirectiveBlock =
        { Id: string
          StartBar: int
          EndBar: int
          Directives: string
          GeneratedMidi: GeneratedMidiData option }

    // ── Bridge (VST hosting) data model extensions ────────
    // All fields are optional on Track/Song so existing songs remain valid.

    /// Reference to a plugin (VST3/CLAP/builtin).
    [<CLIMutable>]
    type PluginRef =
        { Format: string     // "vst3" | "clap" | "builtin"
          Uid: string        // URI or plugin path
          Name: string
          Vendor: string }   // "" if unknown

    /// One slot in a track's (or bus's) plugin chain.
    [<CLIMutable>]
    type ChainNode =
        { Id: string
          Kind: string       // "instrument" | "insert" | "bus"
          Plugin: PluginRef
          Bypass: bool
          Params: System.Collections.Generic.Dictionary<string, float>
          StateBlob: string option }  // base64 opaque plugin state

    /// One send from a track to a bus.
    [<CLIMutable>]
    type Send =
        { Id: string
          DestBusId: string
          Level: float
          Pre: bool }

    /// Single automation breakpoint.
    [<CLIMutable>]
    type AutomationPoint =
        { Tick: int
          Value: float
          Curve: string option }  // "linear" | "hold" | "bezier"

    /// Automation points for one param on one node.
    [<CLIMutable>]
    type Automation =
        { NodeId: string
          ParamId: string
          Points: AutomationPoint list }

    /// Group/aux bus with its own chain, sends and gain.
    [<CLIMutable>]
    type Bus =
        { Id: string
          Name: string
          Chain: ChainNode list
          Sends: Send list
          Volume: float
          Pan: float }

    /// Master output chain.
    [<CLIMutable>]
    type Master =
        { Chain: ChainNode list
          Volume: float }

    type Track =
        { Id: string
          Name: string
          Instrument: string
          Blocks: DirectiveBlock list
          Volume: float
          Mute: bool
          Solo: bool
          // Bridge extensions (optional, additive)
          Chain: ChainNode list option
          Sends: Send list option
          Pan: float option
          Automation: Automation list option }

    type Section =
        { Id: string
          Name: string
          StartBar: int
          EndBar: int
          Color: string }

    type Song =
        { Id: string
          Title: string
          Bpm: int
          TimeSignature: string
          Key: string
          ChordProgression: string
          Sections: Section list
          Tracks: Track list
          CreatedBy: string
          CreatedByName: string
          CreatedAt: DateTime
          LastEditedBy: string
          LastEditedAt: DateTime
          Visibility: string
          SharedWith: string list
          // Bridge extensions (optional, additive)
          Buses: Bus list option
          Master: Master option }

    type CreateSongRequest = { title: string }

    type UpdateSongRequest =
        { title: string
          bpm: int
          timeSignature: string
          key: string
          chordProgression: string
          sections: Section list
          tracks: Track list }

    // Re-export shared helpers for backward compatibility within Song namespace
    type UserInfo = Shared.UserInfo

    let defaultIfNull = Shared.defaultIfNull
    let isNotNull = Shared.isNotNull
