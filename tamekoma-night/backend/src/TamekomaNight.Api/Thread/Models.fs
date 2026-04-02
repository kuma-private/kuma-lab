namespace TamekomaNight.Api.Thread

open System

module Models =

    type SaveHistory =
        { UserId: string
          UserName: string
          Score: string
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
          PianoRollData: string
          LastEditedBy: string
          LastEditedAt: DateTime
          Members: string list
          History: SaveHistory list
          Visibility: string
          SharedWith: string list }

    type CreateThreadRequest = { title: string }

    type SaveScoreRequest = { score: string; comment: string; pianoRollData: string }

    type UpdateSettingsRequest = { title: string; key: string; timeSignature: string; bpm: int }

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
