namespace TamekomaNight.Api.Automation

open System
open System.Net.Http
open System.Text.Json
open System.Text.Json.Serialization
open System.Threading.Tasks
open Microsoft.AspNetCore.Http
open Microsoft.Extensions.DependencyInjection
open TamekomaNight.Api
open TamekomaNight.Api.Analysis

module Handlers =

    // ── Request / response types ─────────────────────────────

    [<CLIMutable>]
    type AutomationSuggestRequest =
        { [<JsonPropertyName("trackId")>]
          TrackId: string
          [<JsonPropertyName("nodeId")>]
          NodeId: string
          [<JsonPropertyName("paramId")>]
          ParamId: string
          [<JsonPropertyName("startTick")>]
          StartTick: int
          [<JsonPropertyName("endTick")>]
          EndTick: int
          [<JsonPropertyName("prompt")>]
          Prompt: string
          // The frontend sends [bpm, beatsPerBar]; we accept it as a plain float array
          // so the wire stays identical to the MixerSuggest request shape.
          [<JsonPropertyName("bpmBpb")>]
          BpmBpb: float array }

    [<CLIMutable>]
    type AutomationPointDto =
        { [<JsonPropertyName("tick")>]
          Tick: int
          [<JsonPropertyName("value")>]
          Value: float
          [<JsonPropertyName("curve")>]
          Curve: string }

    [<CLIMutable>]
    type AutomationSuggestPayload =
        { [<JsonPropertyName("explanation")>]
          Explanation: string
          [<JsonPropertyName("points")>]
          Points: AutomationPointDto array }

    // ── System prompt ────────────────────────────────────────

    let private systemPrompt =
        "You are a music production assistant for Cadenza.fm.\n"
        + "The user wants you to draw an automation curve for a single parameter on a single track.\n\n"
        + "You will return a JSON object with:\n"
        + "- \"explanation\": 1 sentence what you'll do\n"
        + "- \"points\": array of { tick: int, value: float (0..1 normalized), curve: \"linear\"|\"hold\"|\"bezier\" }\n\n"
        + "The PPQ is 480 (i.e. 1 quarter note = 480 ticks). Use the [startTick, endTick] range.\n"
        + "Place 5-20 points for natural curves. The first point should be at startTick, the last at endTick.\n\n"
        + "Return ONLY the JSON object. No prose, no markdown fences."

    // ── Helpers ──────────────────────────────────────────────

    let private getHttpClient (ctx: HttpContext) : HttpClient =
        ctx.RequestServices.GetRequiredService<IHttpClientFactory>().CreateClient("Anthropic")

    let private stripCodeFences (text: string) =
        text.Trim().Replace("```json", "").Replace("```", "").Trim()

    let private isValidCurve (c: string) =
        c = "linear" || c = "hold" || c = "bezier"

    /// Parse Claude's response into explanation + points. Throws on malformed JSON.
    let private parseClaudeResponse (raw: string) : string * AutomationPointDto array =
        let cleaned = stripCodeFences raw
        let parsed = JsonSerializer.Deserialize<AutomationSuggestPayload>(cleaned)
        if obj.ReferenceEquals(parsed, null) then
            failwith "Claude response was null"
        else
            let explanation =
                if obj.ReferenceEquals(parsed.Explanation, null) then "" else parsed.Explanation
            let points =
                if obj.ReferenceEquals(parsed.Points, null) then [||]
                else
                    parsed.Points
                    |> Array.map (fun p ->
                        let curve =
                            if obj.ReferenceEquals(p.Curve, null) || not (isValidCurve p.Curve) then
                                "linear"
                            else
                                p.Curve
                        { Tick = p.Tick; Value = p.Value; Curve = curve })
            explanation, points

    let private validateRequest (req: AutomationSuggestRequest) : bool =
        not (obj.ReferenceEquals(req, null))
        && not (String.IsNullOrWhiteSpace(req.TrackId))
        && not (String.IsNullOrWhiteSpace(req.NodeId))
        && not (String.IsNullOrWhiteSpace(req.ParamId))
        && not (String.IsNullOrWhiteSpace(req.Prompt))
        && req.EndTick > req.StartTick

    // ── Handler ──────────────────────────────────────────────

    let suggestHandler (config: AppConfig) (ctx: HttpContext) : Task =
        task {
            if String.IsNullOrEmpty(config.AnthropicApiKey) then
                do! Shared.respond400 ctx "AI automation suggest is not configured (API key missing)"
            else

            do! Shared.withParsedRequest<AutomationSuggestRequest> ctx validateRequest
                    (fun req ->
                        task {
                            let httpClient = getHttpClient ctx
                            // BpmBpb is [bpm, beatsPerBar] — tolerate missing / empty arrays so we
                            // still feed the prompt something useful.
                            let bpm, beatsPerBar =
                                let src =
                                    if obj.ReferenceEquals(req.BpmBpb, null) then [||] else req.BpmBpb
                                let bpm = if src.Length >= 1 then src.[0] else 120.0
                                let bpb = if src.Length >= 2 then int src.[1] else 4
                                bpm, bpb

                            let userMessage =
                                sprintf
                                    "Track: %s\nNode: %s\nParam: %s\nRange: startTick=%d endTick=%d\nBPM: %g (beats per bar: %d)\nUser request: %s"
                                    req.TrackId
                                    req.NodeId
                                    req.ParamId
                                    req.StartTick
                                    req.EndTick
                                    bpm
                                    beatsPerBar
                                    req.Prompt

                            let! result =
                                AnthropicClient.callApi httpClient config.AnthropicApiKey
                                    "claude-opus-4-20250514" systemPrompt userMessage 2000
                                |> Async.StartAsTask

                            match result with
                            | Ok response ->
                                try
                                    let explanation, points = parseClaudeResponse response
                                    let payload =
                                        points
                                        |> Array.map (fun p ->
                                            {| tick = p.Tick
                                               value = p.Value
                                               curve = p.Curve |})
                                    do! Shared.respondJson ctx 200
                                            {| explanation = explanation
                                               points = payload |}
                                with ex ->
                                    do! Shared.respondJson ctx 502
                                            {| error = "claude_response_invalid"
                                               message = ex.Message
                                               raw = response |}
                            | Error err ->
                                do! Shared.respondJson ctx 502
                                        {| error = "claude_call_failed"
                                           message = err |}
                        })
        }
