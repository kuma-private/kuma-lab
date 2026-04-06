namespace TamekomaNight.Api.Song

open System

module Models =

    type DirectiveBlock =
        { Id: string
          StartBar: int
          EndBar: int
          Directives: string }

    type Track =
        { Id: string
          Name: string
          Instrument: string
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

    /// Represents authenticated user information extracted from HttpContext
    type UserInfo =
        { UserId: string
          UserName: string
          Email: string }

    /// Safely coalesce a possibly-null string to a default value
    let defaultIfNull (defaultValue: string) (value: string) =
        if obj.ReferenceEquals(value, null) then defaultValue else value

    /// Check if a deserialized request object is non-null
    let isNotNull (value: 'T) = not (obj.ReferenceEquals(value, null))
