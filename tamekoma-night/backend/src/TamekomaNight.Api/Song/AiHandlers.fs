namespace TamekomaNight.Api.Song

open System
open System.Net.Http
open System.Text.Json.Serialization
open System.Threading.Tasks
open Microsoft.AspNetCore.Http
open Microsoft.Extensions.DependencyInjection
open TamekomaNight.Api
open TamekomaNight.Api.Analysis

module SongAiHandlers =

    let private getHttpClient (ctx: HttpContext) =
        ctx.RequestServices.GetRequiredService<IHttpClientFactory>().CreateClient("Anthropic")

    let private respond400 = Shared.respond400
    let private respond500 = Shared.respond500
    let private withParsedRequest<'T> = Shared.withParsedRequest<'T>

    // --- Request types ---

    [<CLIMutable>]
    type SuggestRequest =
        { [<JsonPropertyName("chordProgression")>]
          chordProgression: string
          [<JsonPropertyName("genre")>]
          genre: string
          [<JsonPropertyName("trackName")>]
          trackName: string
          [<JsonPropertyName("instrument")>]
          instrument: string
          [<JsonPropertyName("barRange")>]
          barRange: string }

    [<CLIMutable>]
    type ArrangeRequest =
        { [<JsonPropertyName("chordProgression")>]
          chordProgression: string
          [<JsonPropertyName("genre")>]
          genre: string
          [<JsonPropertyName("key")>]
          key: string
          [<JsonPropertyName("bpm")>]
          bpm: int }

    // --- Response types for JSON deserialization ---

    [<CLIMutable>]
    type ArrangeBlock =
        { [<JsonPropertyName("startBar")>]
          StartBar: int
          [<JsonPropertyName("endBar")>]
          EndBar: int
          [<JsonPropertyName("directives")>]
          Directives: string }

    [<CLIMutable>]
    type ArrangeTrack =
        { [<JsonPropertyName("name")>]
          Name: string
          [<JsonPropertyName("instrument")>]
          Instrument: string
          [<JsonPropertyName("blocks")>]
          Blocks: ArrangeBlock array }

    [<CLIMutable>]
    type ArrangeResponse =
        { [<JsonPropertyName("tracks")>]
          Tracks: ArrangeTrack array }

    // --- System prompts ---

    let private suggestSystemPrompt =
        "あなたは音楽制作ツール Cadenza.fm のアレンジAIです。\n"
        + "コード進行とジャンルに基づいて、楽器トラックの演奏ディレクティブを提案してください。\n\n"
        + "利用可能なディレクティブ:\n"
        + "- @mode: block, arpUp, arpDown, fingerpick, bossa-nova, comp-jazz, 8beat, walking, root, root-fifth, sustain\n"
        + "- @voicing: close, open, drop2, spread, shell\n"
        + "- @velocity: pp, p, mp, mf, f, ff (または mp→f のようなグラデーション)\n"
        + "- @humanize: 0-30 (%)\n"
        + "- @swing: 0-70 (%)\n"
        + "- @strum: ミリ秒 (0, 10, 20, -15 等)\n"
        + "- @octave: 2, 3 (ベース用)\n\n"
        + "出力形式:\n"
        + "@key: value を1行ずつ、JSON等の囲みなしで直接出力してください。"

    let private arrangeSystemPrompt =
        "あなたは音楽制作ツール Cadenza.fm のアレンジAIです。\n"
        + "コード進行全体に対して、マルチトラックのアレンジを提案してください。\n\n"
        + "JSONで回答:\n"
        + "{\n"
        + "  \"tracks\": [\n"
        + "    {\n"
        + "      \"name\": \"トラック名\",\n"
        + "      \"instrument\": \"piano|bass|drums|strings|guitar|organ\",\n"
        + "      \"blocks\": [\n"
        + "        { \"startBar\": 0, \"endBar\": 4, \"directives\": \"@mode: ...\\n@velocity: ...\" }\n"
        + "      ]\n"
        + "    }\n"
        + "  ]\n"
        + "}\n\n"
        + "ルール:\n"
        + "- 2-4トラックを提案\n"
        + "- 各トラックに適切な楽器とモードを選択\n"
        + "- ジャンルの特徴を反映\n"
        + "- 全小節をカバー"

    // --- Handlers ---

    let suggestDirectives (config: AppConfig) (songId: string) (ctx: HttpContext) : Task =
        task {
            if String.IsNullOrEmpty(config.AnthropicApiKey) then
                do! respond400 ctx "AI suggest is not configured"
            else

            do! withParsedRequest<SuggestRequest> ctx
                    (fun req ->
                        not (String.IsNullOrWhiteSpace(req.chordProgression))
                        && not (String.IsNullOrWhiteSpace(req.genre)))
                    (fun req ->
                        task {
                            let httpClient = getHttpClient ctx

                            let userMessage =
                                $"コード進行: {req.chordProgression}\n"
                                + $"ジャンル: {req.genre}\n"
                                + $"トラック名: {req.trackName}\n"
                                + $"楽器: {req.instrument}\n"
                                + $"小節範囲: {req.barRange}"

                            let! result =
                                AnthropicClient.callApi httpClient config.AnthropicApiKey "claude-sonnet-4-20250514" suggestSystemPrompt userMessage 300
                                |> Async.StartAsTask

                            match result with
                            | Ok text ->
                                do! ctx.Response.WriteAsJsonAsync({| directives = text.Trim() |})
                            | Error e ->
                                do! respond500 ctx $"AI suggest failed: {e}"
                        })
        }

    let suggestArrangement (config: AppConfig) (songId: string) (ctx: HttpContext) : Task =
        task {
            if String.IsNullOrEmpty(config.AnthropicApiKey) then
                do! respond400 ctx "AI arrange is not configured"
            else

            do! withParsedRequest<ArrangeRequest> ctx
                    (fun req ->
                        not (String.IsNullOrWhiteSpace(req.chordProgression))
                        && not (String.IsNullOrWhiteSpace(req.genre)))
                    (fun req ->
                        task {
                            let httpClient = getHttpClient ctx

                            let userMessage =
                                $"コード進行:\n{req.chordProgression}\n\n"
                                + $"ジャンル: {req.genre}\n"
                                + $"キー: {req.key}\n"
                                + $"BPM: {req.bpm}"

                            let! result =
                                AnthropicClient.callApi httpClient config.AnthropicApiKey "claude-sonnet-4-20250514" arrangeSystemPrompt userMessage 1000
                                |> Async.StartAsTask

                            match result with
                            | Ok text ->
                                let cleaned = text.Trim().Replace("```json", "").Replace("```", "").Trim()
                                try
                                    let parsed = System.Text.Json.JsonSerializer.Deserialize<ArrangeResponse>(cleaned)
                                    let tracks =
                                        parsed.Tracks
                                        |> Array.map (fun t ->
                                            {| name = t.Name
                                               instrument = t.Instrument
                                               blocks =
                                                t.Blocks
                                                |> Array.map (fun b ->
                                                    {| startBar = b.StartBar
                                                       endBar = b.EndBar
                                                       directives = b.Directives |}) |})
                                    do! ctx.Response.WriteAsJsonAsync({| tracks = tracks |})
                                with ex ->
                                    do! respond500 ctx $"Failed to parse AI response: {ex.Message}"
                            | Error e ->
                                do! respond500 ctx $"AI arrange failed: {e}"
                        })
        }
