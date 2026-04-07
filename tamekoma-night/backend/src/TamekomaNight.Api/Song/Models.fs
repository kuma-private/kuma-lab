namespace TamekomaNight.Api.Song

open System
open TamekomaNight.Api

module Models =

    type MidiControlChange =
        { Tick: int
          Cc: int
          Value: int }

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
          ControlChanges: MidiControlChange list option
          GeneratedAt: string }

    type DirectiveBlock =
        { Id: string
          StartBar: int
          EndBar: int
          Directives: string
          GeneratedMidi: GeneratedMidiData option }

    type Track =
        { Id: string
          Name: string
          Instrument: string
          Program: int option
          Blocks: DirectiveBlock list
          Volume: float
          Mute: bool
          Solo: bool }

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
          SharedWith: string list }

    type CreateSongRequest = { title: string }

    type UpdateSongRequest =
        { title: string
          bpm: int
          timeSignature: string
          key: string
          chordProgression: string
          sections: Section list
          tracks: Track list }

    type ImportChordChartRequest =
        { images: string list
          songName: string
          artist: string
          sourceUrl: string
          bpm: int
          timeSignature: string
          key: string }

    // Re-export shared helpers for backward compatibility within Song namespace
    type UserInfo = Shared.UserInfo

    let defaultIfNull = Shared.defaultIfNull
    let isNotNull = Shared.isNotNull
