namespace ChordBattle.Api.Thread

open System

module Models =

    type Line =
        { LineNumber: int
          Chords: string
          AddedBy: string
          AddedByName: string
          LastEditedBy: string }

    type TurnAction =
        { TurnNumber: int
          UserId: string
          UserName: string
          Action: string
          LineNumber: int
          Chords: string
          PreviousChords: string
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
          OpponentId: string
          OpponentName: string
          OpponentEmail: string
          CreatedAt: DateTime
          Status: string
          CurrentTurn: string
          TurnCount: int
          FinishProposedBy: string
          Lines: Line list
          History: TurnAction list }

    type CreateThreadRequest =
        { title: string
          key: string
          timeSignature: string
          bpm: int
          opponentEmail: string }

    type TurnRequest =
        { action: string
          lineNumber: int
          chords: string
          comment: string }
