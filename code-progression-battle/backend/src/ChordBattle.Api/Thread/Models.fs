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

    type UpdateSettingsRequest = { key: string; timeSignature: string; bpm: int }
