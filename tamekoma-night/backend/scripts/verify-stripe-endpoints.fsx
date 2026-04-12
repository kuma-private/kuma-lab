// Smoke test for the Phase 9 Stripe stub handlers.
//
// Verifies the checkout / webhook handlers exist, return JSON, and respect
// the FrontendUrl config. No real Stripe SDK, no network — just the stub
// surface that the frontend `/upgrade` page depends on.
//
// Run from the backend dir AFTER `dotnet build`:
//     dotnet fsi scripts/verify-stripe-endpoints.fsx

#r "../src/TamekomaNight.Api/bin/Debug/net9.0/TamekomaNight.Api.dll"
#r "../src/TamekomaNight.Api/bin/Debug/net9.0/Microsoft.AspNetCore.Http.Abstractions.dll"
#r "../src/TamekomaNight.Api/bin/Debug/net9.0/Microsoft.AspNetCore.Http.Features.dll"

open System
open System.IO
open System.Text
open System.Text.Json
open System.Threading.Tasks
open Microsoft.AspNetCore.Http
open TamekomaNight.Api
open TamekomaNight.Api.Stripe

let mutable passed = 0
let mutable failed = 0

let assertTrue label cond =
    if cond then
        printfn "  PASS  %s" label
        passed <- passed + 1
    else
        printfn "  FAIL  %s" label
        failed <- failed + 1

let assertContains label (haystack: string) (needle: string) =
    if haystack.Contains(needle) then
        printfn "  PASS  %s" label
        passed <- passed + 1
    else
        printfn "  FAIL  %s: %s missing %s" label haystack needle
        failed <- failed + 1

let mkConfig frontendUrl : AppConfig =
    { GoogleClientId = "dev"
      GoogleClientSecret = "dev"
      JwtSigningKey = "dev-signing-key-at-least-32-chars-long!"
      FrontendUrl = frontendUrl
      FirestoreProjectId = ""
      AnthropicApiKey = ""
      DevPremiumUids = [ "dev-user" ] }

// Tiny in-memory HttpContext that captures the response body so we can
// inspect what the handler wrote. Avoids spinning up Kestrel.
let mkContext (body: string) =
    let ctx = DefaultHttpContext()
    ctx.Request.Body <- new MemoryStream(Encoding.UTF8.GetBytes(body))
    ctx.Request.ContentType <- "application/json"
    let resBody = new MemoryStream()
    ctx.Response.Body <- resBody
    ctx, resBody

let readBody (ms: MemoryStream) =
    ms.Position <- 0L
    use reader = new StreamReader(ms, Encoding.UTF8)
    reader.ReadToEnd()

printfn "== Stripe stub smoke test =="
printfn ""

// ---------------------------------------------------------------
// 1. checkoutHandler returns 401 when no user is on the context.
// ---------------------------------------------------------------
printfn "1. checkoutHandler — anonymous"
let cfg1 = mkConfig "https://cadenza.fm"
let ctx1, body1 = mkContext "{}"
(Handlers.checkoutHandler cfg1 ctx1).GetAwaiter().GetResult()
assertTrue "anonymous returns 401" (ctx1.Response.StatusCode = 401)
let payload1 = readBody body1
assertContains "401 body mentions Unauthorized" payload1 "Unauthorized"

printfn ""

// ---------------------------------------------------------------
// 2. checkoutHandler with DEV_MODE-style user returns 200 + url.
// ---------------------------------------------------------------
// We exercise the dev-mode branch by setting the env var the production
// code reads at startup. The handler resolves the user via Shared.getUserInfo
// which respects DEV_MODE.
printfn "2. checkoutHandler — dev user"
Environment.SetEnvironmentVariable("DEV_MODE", "true")
// Config.devMode is captured at module init time so we can't flip it here.
// Instead we manually mark the context as authenticated, which is the path
// the real handler takes for Google-authenticated users.
let cfg2 = mkConfig "https://cadenza.fm"
let ctx2, body2 = mkContext "{}"
let identity = System.Security.Claims.ClaimsIdentity([| System.Security.Claims.Claim(System.Security.Claims.ClaimTypes.NameIdentifier, "dev-user") |], "test")
ctx2.User <- System.Security.Claims.ClaimsPrincipal(identity)
(Handlers.checkoutHandler cfg2 ctx2).GetAwaiter().GetResult()
assertTrue "authenticated returns 200" (ctx2.Response.StatusCode = 200)
let payload2 = readBody body2
assertContains "body has url field" payload2 "\"url\""
assertContains "url uses configured FrontendUrl" payload2 "https://cadenza.fm"
assertContains "url points at upgrade-stub" payload2 "/upgrade-stub"
assertContains "body has sessionId" payload2 "sessionId"
assertContains "body marked stub:true" payload2 "\"stub\":true"

// Round-trip parse to make sure it's valid JSON.
let parsed = JsonDocument.Parse(payload2)
let urlElement = parsed.RootElement.GetProperty("url").GetString()
assertTrue "parsed url begins with https://cadenza.fm/upgrade-stub" (urlElement.StartsWith("https://cadenza.fm/upgrade-stub"))

printfn ""

// ---------------------------------------------------------------
// 3. checkoutHandler falls back to https://cadenza.fm when FrontendUrl is empty.
// ---------------------------------------------------------------
printfn "3. checkoutHandler — empty FrontendUrl falls back"
let cfg3 = mkConfig ""
let ctx3, body3 = mkContext "{}"
let identity3 = System.Security.Claims.ClaimsIdentity([| System.Security.Claims.Claim(System.Security.Claims.ClaimTypes.NameIdentifier, "dev-user") |], "test")
ctx3.User <- System.Security.Claims.ClaimsPrincipal(identity3)
(Handlers.checkoutHandler cfg3 ctx3).GetAwaiter().GetResult()
let payload3 = readBody body3
assertContains "fallback url is https://cadenza.fm" payload3 "https://cadenza.fm/upgrade-stub"

printfn ""

// ---------------------------------------------------------------
// 4. checkoutHandler trims trailing slash on FrontendUrl.
// ---------------------------------------------------------------
printfn "4. checkoutHandler — trailing slash trimmed"
let cfg4 = mkConfig "https://staging.cadenza.fm/"
let ctx4, body4 = mkContext "{}"
let identity4 = System.Security.Claims.ClaimsIdentity([| System.Security.Claims.Claim(System.Security.Claims.ClaimTypes.NameIdentifier, "alice") |], "test")
ctx4.User <- System.Security.Claims.ClaimsPrincipal(identity4)
(Handlers.checkoutHandler cfg4 ctx4).GetAwaiter().GetResult()
let payload4 = readBody body4
assertContains "trimmed slash" payload4 "https://staging.cadenza.fm/upgrade-stub"
let mustNotContain = "https://staging.cadenza.fm//upgrade-stub"
if payload4.Contains(mustNotContain) then
    printfn "  FAIL  double-slash leaked into url"
    failed <- failed + 1
else
    printfn "  PASS  no double-slash in url"
    passed <- passed + 1

printfn ""

// ---------------------------------------------------------------
// 5. webhookHandler accepts arbitrary body and 200s.
// ---------------------------------------------------------------
printfn "5. webhookHandler — arbitrary body"
let cfg5 = mkConfig ""
let ctx5, body5 = mkContext "{\"type\":\"checkout.session.completed\",\"data\":{}}"
(Handlers.webhookHandler cfg5 ctx5).GetAwaiter().GetResult()
assertTrue "webhook returns 200" (ctx5.Response.StatusCode = 200)
let payload5 = readBody body5
assertContains "webhook body marks received" payload5 "received"
assertContains "webhook body marks stub" payload5 "stub"

printfn ""

// ---------------------------------------------------------------
// 6. webhookHandler tolerates an empty body.
// ---------------------------------------------------------------
printfn "6. webhookHandler — empty body"
let ctx6, body6 = mkContext ""
(Handlers.webhookHandler cfg5 ctx6).GetAwaiter().GetResult()
assertTrue "empty body still returns 200" (ctx6.Response.StatusCode = 200)
let payload6 = readBody body6
assertContains "empty body still has stub flag" payload6 "stub"

printfn ""
printfn "== %d passed, %d failed ==" passed failed
if failed > 0 then exit 1 else exit 0
