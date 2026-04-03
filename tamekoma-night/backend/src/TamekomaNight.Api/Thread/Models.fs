namespace TamekomaNight.Api.Thread

open System

module Models =

    type SaveHistory =
        { UserId: string
          UserName: string
          Score: string
          MidiData: string
          Comment: string
          AiComment: string
          AiScores: string
          CreatedAt: DateTime }

    type Thread =
        { Id: string
          Title: string
          Key: string
          TimeSignature: string
          Bpm: int
          CreatedBy: string
          CreatedByName: string
          CreatedAt: DateTime
          Score: string
          MidiData: string
          LastEditedBy: string
          LastEditedAt: DateTime
          Members: string list
          History: SaveHistory list
          Visibility: string
          SharedWith: string list
          EditorMode: string }

    type CreateThreadRequest = { title: string }

    type SaveScoreRequest = { score: string; comment: string; midiData: string }

    type UpdateSettingsRequest = { title: string; key: string; timeSignature: string; bpm: int; editorMode: string }

    type TransformRequest =
        { selectedChords: string
          instruction: string
          key: string
          timeSignature: string
          fullScore: string }

    type ShareRequest = { visibility: string; sharedWith: string list }

    type Comment =
        { Id: string
          UserId: string
          UserName: string
          Text: string
          AnchorType: string
          AnchorStart: int
          AnchorEnd: int
          AnchorSnapshot: string
          CreatedAt: DateTime }

    type AddCommentRequest =
        { text: string
          anchorType: string
          anchorStart: int
          anchorEnd: int
          anchorSnapshot: string }

    type ImportChordChartRequest =
        { images: string list
          songName: string
          artist: string
          sourceUrl: string
          bpm: int
          timeSignature: string
          key: string }

    type Annotation =
        { Id: string
          UserId: string
          UserName: string
          Type: string
          StartBar: int
          EndBar: int
          Snapshot: string
          Emoji: string
          AiComment: string
          CreatedAt: DateTime }

    type AddAnnotationRequest =
        { annotationType: string
          startBar: int
          endBar: int
          snapshot: string
          emoji: string }

    type AnalyzeSelectionRequest =
        { selectedChords: string
          fullScore: string
          key: string
          timeSignature: string }

    /// Represents authenticated user information extracted from HttpContext
    type UserInfo =
        { UserId: string
          UserName: string
          Email: string }

    // --- Validation helpers ---

    /// Safely coalesce a possibly-null string to a default value
    let defaultIfNull (defaultValue: string) (value: string) =
        if obj.ReferenceEquals(value, null) then defaultValue else value

    /// Check if a deserialized request object is non-null
    let isNotNull (value: 'T) = not (obj.ReferenceEquals(value, null))

    /// Validate that a Base64 string contains a valid MIDI file (starts with MThd header)
    let isValidMidiData (base64: string) =
        if System.String.IsNullOrEmpty(base64) then true // empty is OK (no MIDI data)
        else
            try
                let bytes = Convert.FromBase64String(base64)
                bytes.Length >= 14
                && bytes.[0] = byte 'M' && bytes.[1] = byte 'T'
                && bytes.[2] = byte 'h' && bytes.[3] = byte 'd'
            with
            | :? FormatException -> false
            | :? ArgumentException -> false

    /// Parse a data URI into (mediaType, base64data)
    let parseDataUri (dataUri: string) =
        if dataUri.Contains(",") then
            let prefix = dataUri.Substring(0, dataUri.IndexOf(","))
            let data = dataUri.Substring(dataUri.IndexOf(",") + 1)
            let mediaType =
                if prefix.Contains("image/jpeg") then "image/jpeg"
                elif prefix.Contains("image/webp") then "image/webp"
                elif prefix.Contains("image/gif") then "image/gif"
                else "image/png"
            (mediaType, data)
        else
            ("image/png", dataUri)
