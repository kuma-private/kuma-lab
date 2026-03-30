namespace ChordBattle.Api.Thread

open System

module Models =

    type Post =
        { UserId: string
          UserName: string
          Chords: string
          Comment: string
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
          Posts: Post list }

    type CreateThreadRequest =
        { title: string
          key: string
          timeSignature: string
          bpm: int }

    type CreatePostRequest =
        { chords: string
          comment: string }
