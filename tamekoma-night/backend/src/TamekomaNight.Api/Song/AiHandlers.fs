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

    [<CLIMutable>]
    type MidiCcCompact =
        { [<JsonPropertyName("t")>]
          t: int
          [<JsonPropertyName("cc")>]
          cc: int
          [<JsonPropertyName("v")>]
          v: int }

    [<CLIMutable>]
    type GenerateMidiCompactResponse =
        { [<JsonPropertyName("notes")>]
          notes: MidiNoteCompact array
          [<JsonPropertyName("cc")>]
          cc: MidiCcCompact array }

    // --- Generate MIDI system prompt ---

    let private generateMidiSystemPrompt =
        "あなたは20年のキャリアを持つスタジオミュージシャンです。コード進行、スタイル、2つのパラメータに基づいてMIDIノートデータを出力してください。\n\n"
        + "CC64サステインペダルは v=127 がON (踏む)、v=0 がOFF (離す)。バラード系では各小節頭でON(127)、コードが変わる直前でOFF(0)を繰り返す。OFF(0)だけは不正。\n\n"
        + "出力フォーマット (JSONオブジェクト、説明不要):\n"
        + "{\n"
        + "  \"notes\": [{\"m\": <MIDI番号>, \"t\": <tick>, \"d\": <duration>, \"v\": <velocity>}, ...],\n"
        + "  \"cc\": [{\"t\": 0, \"cc\": 64, \"v\": 127}, {\"t\": 1900, \"cc\": 64, \"v\": 0}, {\"t\": 1920, \"cc\": 64, \"v\": 127}, {\"t\": 3820, \"cc\": 64, \"v\": 0}]\n"
        + "}\n\n"
        + "ccフィールド:\n"
        + "- CC64 (サステインペダル): v=127でON、v=0でOFF\n"
        + "- ピアノの場合: バラード系では小節頭でON、和音が変わる直前でOFF→ONを繰り返す\n"
        + "- ギター/ベース/ドラム: ccは空配列[]\n\n"
        + "技術仕様:\n"
        + "- 1小節 = 1920 ticks (480 ticks/quarter note, 4/4拍子)\n"
        + "- MIDI番号: C4(中央ド) = 60\n\n"
        + "コード進行の記法 (rechord形式):\n"
        + "- | Am | Em | = 各小節に1コード (4拍全て)\n"
        + "- | Dm C | = 1小節に2コード (各2拍ずつ)\n"
        + "- | A - - E | = Aが3拍、Eが1拍。'-' は前のコードの延長\n"
        + "- 必ずこの拍割りに従ってノートを配置すること\n\n"
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
        + "- 左手(MIDI 36-55): ルート+5度またはルート+オクターブの2音で深く鳴らす（例: Am7ならA2+E3、またはA2+A3）。単音ルートだけは避ける\n"
        + "- 右手(MIDI 56-84): コードトーンやテンションでアルペジオ、和音、メロディ的フレーズ\n"
        + "- ペダル効果: サステインを表現するため、一部のノートのdurationを次の拍や小節にまたがって長くする（特にバラード系）\n"
        + "- 左手と右手は独立したリズムで動かす\n\n"
        + "【piano でのペダル (CC64) の使い方】\n"
        + "- バラード/弾き語り: 各小節の頭でON(v=127)、コードが変わる直前にOFF(v=0)→すぐON(v=127)\n"
        + "- アップテンポ: ペダルは控えめ。各拍の頭でON、裏拍でOFF\n"
        + "- ジャズ: ほぼペダルなし。レガートで表現\n\n"
        + "【guitar】\n"
        + "- ギターのボイシングを意識（同時発音6音まで、MIDI 40-80の範囲）\n"
        + "- ストラム: 和音の各音を3-8 tickずつずらして下から上（ダウン）or 上から下（アップ）\n\n"
        + "【bass】\n"
        + "- 単音ベースライン（MIDI 28-55）。和音は使わない\n"
        + "- ルート、5度、経過音、アプローチノートを組み合わせる\n"
        + "- ウォーキングベース: コードトーン(ルート,3rd,5th,7th)を中心に、経過音は1小節に1-2音まで。次のコードへのアプローチノート(半音下/上)を活用\n\n"
        + "【strings】\n"
        + "- 長いサステインのパッド的な和音\n"
        + "- ゆっくりとしたダイナミクス変化\n\n"
        + "絶対に守るべきルール:\n"
        + "1. コード進行のハーモニーに正確に従う。基本はコード構成音を使用する。\n"
        + "   - Am7 → A,C,E,G が基本\n"
        + "   - Expression 50以上: 9th,11th,13thのテンションノート追加OK（Am7→B,D,Fも可）\n"
        + "   - ただしアボイドノート（Am7のFなど、特にピアノ左手）は避ける\n"
        + "   - 経過音・アプローチノート: 各小節1-2音まで短い音価で使用OK\n"
        + "2. スタイル別ノート密度の目安:\n"
        + "   - バラード/弾き語り: 1小節 6-10ノート\n"
        + "   - ジャズバラード: 1小節 8-14ノート（左手のベースライン含む）\n"
        + "   - ジャズコンピング: 1小節 12-20ノート\n"
        + "   - ポップ/ロック: 1小節 8-16ノート\n"
        + "   - ファンク/カッティング: 1小節 16-32ノート\n"
        + "5. スタイルの指示を最優先で尊重すること\n"
        + "6. 各コードの構成音を正確に把握してから演奏パターンを組み立てること\n"
        + "7. スラッシュコード（例: A/B）の場合、/の後の音（B）を最低音として使用してください。ルート（A）ではなくベース指定音（B）が最も低い音になります。\n\n"
        + "重要: ピアノのバラード・弾き語り系スタイルでは、必ずCC64サステインペダルを含めること。\n"
        + "ペダルの正しいパターン（4小節の例）:\n"
        + "{\"t\": 0, \"cc\": 64, \"v\": 127},      // bar 1 開始: ペダルON\n"
        + "{\"t\": 1900, \"cc\": 64, \"v\": 0},     // bar 1 終了直前: ペダルOFF\n"
        + "{\"t\": 1920, \"cc\": 64, \"v\": 127},   // bar 2 開始: ペダルON\n"
        + "{\"t\": 3820, \"cc\": 64, \"v\": 0},     // bar 2 終了直前: ペダルOFF\n"
        + "{\"t\": 3840, \"cc\": 64, \"v\": 127},   // bar 3 開始: ペダルON\n"
        + "{\"t\": 5740, \"cc\": 64, \"v\": 0},     // bar 3 終了直前: ペダルOFF\n"
        + "{\"t\": 5760, \"cc\": 64, \"v\": 127},   // bar 4 開始: ペダルON\n"
        + "{\"t\": 7660, \"cc\": 64, \"v\": 0}      // bar 4 終了直前: ペダルOFF\n\n"
        + "v=127がON、v=0がOFF。各小節でON→OFF→ONを繰り返す。v=0だけは間違い。"

    /// Post-process CC events: auto-generate CC64 sustain pedal for piano ballad styles
    /// when the AI fails to produce proper ON/OFF patterns.
    let private addPedalIfNeeded (instrument: string) (style: string) (barCount: int) (ccs: MidiCcCompact array) : MidiCcCompact array =
        if instrument <> "piano" then ccs
        else
        let styleLower = (style |> Shared.defaultIfNull "").ToLowerInvariant()
        let needsPedal =
            styleLower.Contains("バラード") || styleLower.Contains("弾き語り")
            || styleLower.Contains("ジャズ") || styleLower.Contains("ballad")
            || styleLower.Contains("jazz")
        if not needsPedal then ccs
        else
        let hasOnEvents = ccs |> Array.exists (fun cc -> cc.cc = 64 && cc.v > 0)
        if hasOnEvents then ccs
        else
        // Generate pedal pattern: ON at bar start, OFF 20 ticks before bar end
        let ticksPerBar = 1920
        [| for i in 0 .. barCount - 1 do
               let barStart = i * ticksPerBar
               yield { t = barStart; cc = 64; v = 127 }
               yield { t = barStart + ticksPerBar - 20; cc = 64; v = 0 } |]

    /// Extract JSON content from text that may contain markdown code fences or extra text.
    /// Handles both JSON arrays (legacy) and JSON objects (new format with notes + cc).
    let private extractJsonContent (text: string) : string =
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
                // Try JSON object first (new format), then array (legacy)
                let braceStart = trimmed.IndexOf('{')
                let braceEnd = trimmed.LastIndexOf('}')
                if braceStart >= 0 && braceEnd > braceStart then
                    trimmed.Substring(braceStart, braceEnd - braceStart + 1)
                else
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
                                + $"{barCount}小節分のMIDIデータをJSONオブジェクトで出力。"

                            let! result =
                                AnthropicClient.callApi httpClient config.AnthropicApiKey "claude-opus-4-20250514" generateMidiSystemPrompt userMessage 4000
                                |> Async.StartAsTask

                            match result with
                            | Ok text ->
                                let jsonContent = extractJsonContent text
                                try
                                    // Try new object format first, fall back to legacy array format
                                    let compactNotes, ccEvents =
                                        let trimmedJson = jsonContent.TrimStart()
                                        if trimmedJson.StartsWith("{") then
                                            let parsed = System.Text.Json.JsonSerializer.Deserialize<GenerateMidiCompactResponse>(jsonContent)
                                            let cc =
                                                if isNull (box parsed.cc) then Array.empty
                                                else parsed.cc
                                            (parsed.notes, cc)
                                        else
                                            // Legacy: plain array of notes, no CC
                                            let notes = System.Text.Json.JsonSerializer.Deserialize<MidiNoteCompact array>(jsonContent)
                                            (notes, Array.empty)
                                    let ccWithPedal = addPedalIfNeeded req.instrument req.style barCount ccEvents
                                    let notes =
                                        compactNotes
                                        |> Array.map (fun n ->
                                            {| midi = n.m; tick = n.t; duration = n.d; velocity = n.v |})
                                    let controlChanges =
                                        ccWithPedal
                                        |> Array.map (fun c ->
                                            {| tick = c.t; cc = c.cc; value = c.v |})
                                    do! ctx.Response.WriteAsJsonAsync(
                                        {| notes = notes
                                           controlChanges = controlChanges
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

    let importChordChart (config: AppConfig) (songId: string) (ctx: HttpContext) : Task =
        task {
            if String.IsNullOrEmpty(config.AnthropicApiKey) then
                do! respond400 ctx "AI import is not configured"
            else

            do! withParsedRequest<Models.ImportChordChartRequest> ctx
                    (fun req -> Shared.isNotNull req.images && not req.images.IsEmpty)
                    (fun req ->
                        task {
                            let httpClient = getHttpClient ctx

                            let images = req.images |> List.map Thread.Models.parseDataUri

                            let songName = req.songName |> Shared.defaultIfNull ""
                            let artist = req.artist |> Shared.defaultIfNull ""
                            let sourceUrl = req.sourceUrl |> Shared.defaultIfNull ""
                            let timeSignature = req.timeSignature |> Shared.defaultIfNull "4/4"
                            let key = req.key |> Shared.defaultIfNull ""

                            let! result =
                                AnthropicClient.importChordChart httpClient config.AnthropicApiKey images songName artist sourceUrl req.bpm timeSignature key
                                |> Async.StartAsTask

                            match result with
                            | Ok chords ->
                                do! ctx.Response.WriteAsJsonAsync({| chords = chords |})
                            | Error e ->
                                do! respond500 ctx $"AI import failed: {e}"
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
