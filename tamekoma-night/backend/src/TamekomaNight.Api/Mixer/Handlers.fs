namespace TamekomaNight.Api.Mixer

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

    // ── Request / snapshot types ─────────────────────────────
    // Mirror of the frontend Mixer state. We keep these loose (CLIMutable records
    // with JsonPropertyName) so the frontend can send any well-formed mixer and
    // we faithfully relay it to Claude.

    [<CLIMutable>]
    type PluginRefSnapshot =
        { [<JsonPropertyName("format")>]
          Format: string
          [<JsonPropertyName("uid")>]
          Uid: string
          [<JsonPropertyName("name")>]
          Name: string
          [<JsonPropertyName("vendor")>]
          Vendor: string }

    [<CLIMutable>]
    type ChainNodeSnapshot =
        { [<JsonPropertyName("id")>]
          Id: string
          [<JsonPropertyName("kind")>]
          Kind: string
          [<JsonPropertyName("plugin")>]
          Plugin: PluginRefSnapshot
          [<JsonPropertyName("bypass")>]
          Bypass: bool
          [<JsonPropertyName("params")>]
          Params: System.Collections.Generic.Dictionary<string, float> }

    [<CLIMutable>]
    type SendSnapshot =
        { [<JsonPropertyName("id")>]
          Id: string
          [<JsonPropertyName("destBusId")>]
          DestBusId: string
          [<JsonPropertyName("level")>]
          Level: float
          [<JsonPropertyName("pre")>]
          Pre: bool }

    [<CLIMutable>]
    type TrackSnapshot =
        { [<JsonPropertyName("id")>]
          Id: string
          [<JsonPropertyName("name")>]
          Name: string
          [<JsonPropertyName("volume")>]
          Volume: float
          [<JsonPropertyName("pan")>]
          Pan: float
          [<JsonPropertyName("mute")>]
          Mute: bool
          [<JsonPropertyName("solo")>]
          Solo: bool
          [<JsonPropertyName("chain")>]
          Chain: ChainNodeSnapshot array
          [<JsonPropertyName("sends")>]
          Sends: SendSnapshot array }

    [<CLIMutable>]
    type BusSnapshot =
        { [<JsonPropertyName("id")>]
          Id: string
          [<JsonPropertyName("name")>]
          Name: string
          [<JsonPropertyName("chain")>]
          Chain: ChainNodeSnapshot array
          [<JsonPropertyName("sends")>]
          Sends: SendSnapshot array
          [<JsonPropertyName("volume")>]
          Volume: float
          [<JsonPropertyName("pan")>]
          Pan: float }

    [<CLIMutable>]
    type MasterSnapshot =
        { [<JsonPropertyName("chain")>]
          Chain: ChainNodeSnapshot array
          [<JsonPropertyName("volume")>]
          Volume: float }

    [<CLIMutable>]
    type MixerSnapshot =
        { [<JsonPropertyName("tracks")>]
          Tracks: TrackSnapshot array
          [<JsonPropertyName("buses")>]
          Buses: BusSnapshot array
          [<JsonPropertyName("master")>]
          Master: MasterSnapshot }

    [<CLIMutable>]
    type SuggestRequest =
        { [<JsonPropertyName("songId")>]
          SongId: string
          [<JsonPropertyName("prompt")>]
          Prompt: string
          [<JsonPropertyName("mixer")>]
          Mixer: MixerSnapshot }

    // ── System prompt ────────────────────────────────────────

    let private systemPrompt =
        "You are a music production assistant for Cadenza.fm. The user will provide:\n"
        + "1. The current state of their mixer (tracks, inserts, sends, buses, master)\n"
        + "2. A natural language instruction\n\n"
        + "You return a JSON object with:\n"
        + "- \"explanation\": a 1-2 sentence explanation of what you'll change\n"
        + "- \"ops\": an array of RFC 6902 JSON Patch operations on the mixer state\n"
        + "- \"sideEffects\": optional list of plain-language warnings\n\n"
        + "Available built-in plugins (uid -> params):\n"
        + "- \"gain\" -> { gainDb: float -inf..+12 }\n"
        + "- \"svf\" -> { cutoff: 20..20000 (Hz), resonance: 0..1, mode: \"lp\"|\"hp\"|\"bp\" }\n"
        + "- \"compressor\" -> { thresholdDb: -60..0, ratio: 1..20, attackMs: 0.1..100, releaseMs: 10..1000 }\n\n"
        + "Use id-keyed JSON Pointer paths, e.g.:\n"
        + "- /tracks/{trackId}/volumeDb\n"
        + "- /tracks/{trackId}/pan\n"
        + "- /tracks/{trackId}/inserts/-  (append)\n"
        + "- /tracks/{trackId}/inserts/{nodeId}/params/{paramId}\n"
        + "- /tracks/{trackId}/sends/-\n"
        + "- /buses/-\n"
        + "- /master/inserts/-\n"
        + "- /master/volumeDb\n\n"
        + "Return ONLY the JSON object. No prose, no markdown fences."

    // ── Helpers ──────────────────────────────────────────────

    let private getHttpClient (ctx: HttpContext) : HttpClient =
        ctx.RequestServices.GetRequiredService<IHttpClientFactory>().CreateClient("Anthropic")

    let private stripCodeFences (text: string) =
        text.Trim().Replace("```json", "").Replace("```", "").Trim()

    /// Extract the explanation / ops / sideEffects fields from Claude's response.
    /// Throws on malformed JSON; caller should wrap in try/with.
    /// The returned `opsNode` is a JsonNode that System.Text.Json serialises
    /// transparently, so we can hand Claude's ops array straight through to the
    /// frontend without re-deserialising.
    let private parseClaudeResponse (raw: string) : string * System.Text.Json.Nodes.JsonNode * string array =
        let cleaned = stripCodeFences raw
        let doc = JsonDocument.Parse(cleaned)
        try
            let root = doc.RootElement
            let explanation = root.GetProperty("explanation").GetString()
            let opsRaw = root.GetProperty("ops").GetRawText()
            let opsNode = System.Text.Json.Nodes.JsonNode.Parse(opsRaw)
            let sideEffects =
                let mutable arr = Unchecked.defaultof<JsonElement>
                if root.TryGetProperty("sideEffects", &arr) && arr.ValueKind = JsonValueKind.Array then
                    arr.EnumerateArray()
                    |> Seq.map (fun e -> e.GetString())
                    |> Array.ofSeq
                else
                    [||]
            explanation, opsNode, sideEffects
        finally
            doc.Dispose()

    let private validateRequest (req: SuggestRequest) : bool =
        not (obj.ReferenceEquals(req, null))
        && not (String.IsNullOrWhiteSpace(req.Prompt))
        && not (obj.ReferenceEquals(req.Mixer, null))

    // ── Handler ──────────────────────────────────────────────

    let suggestHandler (config: AppConfig) (ctx: HttpContext) : Task =
        task {
            if String.IsNullOrEmpty(config.AnthropicApiKey) then
                do! Shared.respond400 ctx "AI mixer suggest is not configured (API key missing)"
            else

            do! Shared.withParsedRequest<SuggestRequest> ctx validateRequest
                    (fun req ->
                        task {
                            let httpClient = getHttpClient ctx
                            let mixerJson = JsonSerializer.Serialize(req.Mixer)
                            let userMessage =
                                sprintf "Current mixer state:\n%s\n\nUser request: %s" mixerJson req.Prompt

                            let! result =
                                AnthropicClient.callApi httpClient config.AnthropicApiKey
                                    "claude-opus-4-20250514" systemPrompt userMessage 4000
                                |> Async.StartAsTask

                            match result with
                            | Ok response ->
                                try
                                    let explanation, opsNode, sideEffects = parseClaudeResponse response
                                    do! Shared.respondJson ctx 200
                                            {| explanation = explanation
                                               ops = opsNode
                                               sideEffects = sideEffects |}
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
