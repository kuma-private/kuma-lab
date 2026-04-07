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

    // --- Generate MIDI types ---

    [<CLIMutable>]
    type GenerateMidiRequest =
        { [<JsonPropertyName("chordProgression")>]
          chordProgression: string
          [<JsonPropertyName("style")>]
          style: string
          [<JsonPropertyName("instrument")>]
          instrument: string
          [<JsonPropertyName("bpm")>]
          bpm: int
          [<JsonPropertyName("expression")>]
          expression: int
          [<JsonPropertyName("feel")>]
          feel: int
          [<JsonPropertyName("barRange")>]
          barRange: string }

    [<CLIMutable>]
    type MidiNoteCompact =
        { [<JsonPropertyName("m")>]
          m: int
          [<JsonPropertyName("t")>]
          t: int
          [<JsonPropertyName("d")>]
          d: int
          [<JsonPropertyName("v")>]
          v: int }

    // --- Generate MIDI system prompt ---

    let private generateMidiSystemPrompt =
        "あなたは20年のキャリアを持つスタジオミュージシャンです。コード進行、スタイル、2つのパラメータに基づいてMIDIノートデータを出力してください。\n\n"
        + "出力フォーマット (JSON配列のみ、説明不要):\n"
        + "[{\"m\": <MIDI番号>, \"t\": <tick>, \"d\": <duration>, \"v\": <velocity>}, ...]\n\n"
        + "技術仕様:\n"
        + "- 1小節 = 1920 ticks (480 ticks/quarter note, 4/4拍子)\n"
        + "- MIDI番号: C4(中央ド) = 60\n\n"
        + "2つのパラメータ:\n\n"
        + "【Expression (0-100)】\n"
        + "表現の厚みと派手さを制御。\n"
        + "0 (Subtle): シンプルなクローズドボイシング。3-4音の基本和音。テンションなし。\n"
        + "50: 適度なテンション。オクターブの広がり。標準的なアレンジ。\n"
        + "100 (Dramatic): 広いボイシング。テンションノート多用。和音の厚み最大。\n\n"
        + "楽器別のExpression解釈:\n"
        + "- ピアノ: Subtle=3音クローズド → Dramatic=両手6-8音の広いボイシング\n"
        + "- ギター: Subtle=パワーコード的 → Dramatic=テンション入りジャズコード\n"
        + "- ストリングス: Subtle=ユニゾン → Dramatic=divisi、対旋律\n\n"
        + "【Feel (0-100)】\n"
        + "演奏の人間味とリアリティ。\n"
        + "0 (Tight): 機械的に正確。タイミングずれなし。ベロシティ均一。\n"
        + "50: 自然な揺れ。タイミング±8tick。ベロシティ±5。\n"
        + "100 (Loose): 大きな揺れ。±20tick。±12。レイドバック。ゴーストノート多用。\n\n"
        + "演奏のリアリティ:\n"
        + "1. 和音のストラム: 2-12 tickずらす（Feel値に比例）\n"
        + "2. タイミングの揺れ: Feel値に比例\n"
        + "3. ベロシティの揺れ: Feel値に比例\n"
        + "4. ゴーストノート: Feel 60以上で登場\n"
        + "5. アーティキュレーション: スタイルに適切なレガート/スタッカート\n"
        + "6. ダイナミクス: フレーズの起伏\n\n"
        + "楽器固有の演奏法:\n\n"
        + "【piano】\n"
        + "- 左手(MIDI 36-55): ルート音を全音符〜2分音符で深く鳴らす。時折5度やオクターブを添える\n"
        + "- 右手(MIDI 56-84): コードトーンやテンションでアルペジオ、和音、メロディ的フレーズ\n"
        + "- ペダル効果: サステインを表現するため、一部のノートのdurationを次の拍や小節にまたがって長くする（特にバラード系）\n"
        + "- 左手と右手は独立したリズムで動かす\n\n"
        + "【guitar】\n"
        + "- ギターのボイシングを意識（同時発音6音まで、MIDI 40-80の範囲）\n"
        + "- ストラム: 和音の各音を3-8 tickずつずらして下から上（ダウン）or 上から下（アップ）\n\n"
        + "【bass】\n"
        + "- 単音ベースライン（MIDI 28-55）。和音は使わない\n"
        + "- ルート、5度、経過音、アプローチノートを組み合わせる\n\n"
        + "【strings】\n"
        + "- 長いサステインのパッド的な和音\n"
        + "- ゆっくりとしたダイナミクス変化\n\n"
        + "重要な注意:\n"
        + "- スタイルの指示を最優先で尊重すること\n"
        + "- バラード/弾き語り系: 1小節あたり6-10ノート。穏やかに\n"
        + "- ロック/ポップ系: 1小節あたり8-16ノート\n"
        + "- ファンク/カッティング系: 1小節あたり16-32ノート\n"
        + "- 必ずコード進行のハーモニーに正確に従うこと"

    /// Extract a JSON array from text that may contain markdown code fences or extra text.
    let private extractJsonArray (text: string) : string =
        let trimmed = text.Trim()
        // Try to find content within ```json ... ``` or ``` ... ```
        let mutable start = trimmed.IndexOf("```json")
        if start >= 0 then
            let afterFence = start + 7
            let endFence = trimmed.IndexOf("```", afterFence)
            if endFence > afterFence then
                trimmed.Substring(afterFence, endFence - afterFence).Trim()
            else
                trimmed.Substring(afterFence).Trim()
        else
            start <- trimmed.IndexOf("```")
            if start >= 0 then
                let afterFence = start + 3
                let endFence = trimmed.IndexOf("```", afterFence)
                if endFence > afterFence then
                    trimmed.Substring(afterFence, endFence - afterFence).Trim()
                else
                    trimmed.Substring(afterFence).Trim()
            else
                // Find the first '[' and last ']'
                let bracketStart = trimmed.IndexOf('[')
                let bracketEnd = trimmed.LastIndexOf(']')
                if bracketStart >= 0 && bracketEnd > bracketStart then
                    trimmed.Substring(bracketStart, bracketEnd - bracketStart + 1)
                else
                    trimmed

    /// Parse barRange like "1-4" and return bar count.
    let private parseBarCount (barRange: string) : int =
        if String.IsNullOrWhiteSpace(barRange) then
            4
        else
            let parts = barRange.Split('-')
            if parts.Length = 2 then
                match Int32.TryParse(parts.[0]), Int32.TryParse(parts.[1]) with
                | (true, s), (true, e) when e >= s -> e - s + 1
                | _ -> 4
            else
                4

    // --- Handlers ---

    let generateMidi (config: AppConfig) (songId: string) (ctx: HttpContext) : Task =
        task {
            if String.IsNullOrEmpty(config.AnthropicApiKey) then
                do! respond400 ctx "AI generate-midi is not configured (API key missing)"
            else

            do! withParsedRequest<GenerateMidiRequest> ctx
                    (fun req ->
                        not (String.IsNullOrWhiteSpace(req.chordProgression))
                        && not (String.IsNullOrWhiteSpace(req.instrument))
                        && req.bpm > 0
                        && req.expression >= 0 && req.expression <= 100
                        && req.feel >= 0 && req.feel <= 100)
                    (fun req ->
                        task {
                            let httpClient = getHttpClient ctx
                            let barCount = parseBarCount req.barRange

                            let userMessage =
                                $"コード進行: {req.chordProgression}\n"
                                + $"楽器: {req.instrument}\n"
                                + $"スタイル: {req.style}、BPM {req.bpm}\n"
                                + $"Expression: {req.expression}\n"
                                + $"Feel: {req.feel}\n\n"
                                + $"{barCount}小節分のMIDIノートをJSON配列で出力。"

                            let! result =
                                AnthropicClient.callApi httpClient config.AnthropicApiKey "claude-opus-4-20250514" generateMidiSystemPrompt userMessage 4000
                                |> Async.StartAsTask

                            match result with
                            | Ok text ->
                                let jsonArray = extractJsonArray text
                                try
                                    let compactNotes = System.Text.Json.JsonSerializer.Deserialize<MidiNoteCompact array>(jsonArray)
                                    let notes =
                                        compactNotes
                                        |> Array.map (fun n ->
                                            {| midi = n.m; tick = n.t; duration = n.d; velocity = n.v |})
                                    do! ctx.Response.WriteAsJsonAsync(
                                        {| notes = notes
                                           style = req.style |> Shared.defaultIfNull ""
                                           expression = req.expression
                                           feel = req.feel |})
                                with ex ->
                                    do! respond500 ctx $"Failed to parse AI MIDI response: {ex.Message}"
                            | Error e ->
                                do! respond500 ctx $"AI generate-midi failed: {e}"
                        })
        }

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
