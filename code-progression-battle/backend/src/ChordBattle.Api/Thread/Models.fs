namespace ChordBattle.Api.Thread

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
          LastEditedBy: string
          LastEditedAt: DateTime
          Members: string list
          History: SaveHistory list }

    type CreateThreadRequest = { title: string }

    type SaveScoreRequest = { score: string; comment: string }

    type UpdateSettingsRequest = { title: string; key: string; timeSignature: string; bpm: int }

    type TransformRequest =
        { selectedChords: string
          instruction: string
          key: string
          timeSignature: string
          fullScore: string }

    type ImportChordChartRequest =
        { images: string list
          songName: string
          artist: string
          sourceUrl: string
          bpm: int
          timeSignature: string
          key: string }
