// Smoke test for the Phase 9 Stripe stub handlers.
//
// Spins up the backend in DEV_MODE on a private port and exercises the
// /api/stripe/checkout and /api/stripe/webhook endpoints over HTTP. No real
// Stripe SDK, no Firestore — just the stub surface that the frontend
// `/upgrade` page depends on.
//
// Run from the backend dir AFTER `dotnet build`:
//     dotnet fsi scripts/verify-stripe-endpoints.fsx
//
// Checks:
//  1. POST /api/stripe/checkout returns 200 with a stub url and sessionId.
//  2. The stub url honours FRONTEND_URL when set.
//  3. POST /api/stripe/webhook returns 200 for arbitrary JSON bodies.
//  4. POST /api/stripe/webhook tolerates an empty body.

open System
open System.Diagnostics
open System.IO
open System.Net.Http
open System.Text
open System.Text.Json
open System.Threading

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
    if haystack.Contains(needle: string) then
        printfn "  PASS  %s" label
        passed <- passed + 1
    else
        printfn "  FAIL  %s: %s missing %s" label haystack needle
        failed <- failed + 1

// Configuration
let port = 52877
let baseUrl = sprintf "http://127.0.0.1:%d" port
let frontendUrl = "https://staging.cadenza.fm"

let scriptDir = __SOURCE_DIRECTORY__
let projectDir = Path.Combine(scriptDir, "..", "src", "TamekomaNight.Api")

printfn "== Stripe stub smoke test =="
printfn "[stripe-test] starting backend on %s" baseUrl

// Start the backend in DEV_MODE.
let psi = ProcessStartInfo("dotnet", "run --no-build --project " + projectDir)
psi.UseShellExecute <- false
psi.RedirectStandardOutput <- true
psi.RedirectStandardError <- true
psi.EnvironmentVariables.["DEV_MODE"] <- "true"
psi.EnvironmentVariables.["JWT_SIGNING_KEY"] <- "dev-signing-key-at-least-32-chars-long!"
psi.EnvironmentVariables.["FRONTEND_URL"] <- frontendUrl
psi.EnvironmentVariables.["ASPNETCORE_URLS"] <- baseUrl
psi.EnvironmentVariables.["CADENZA_DEV_PREMIUM_UIDS"] <- "dev-user"

let proc = Process.Start(psi)

let cleanup () =
    if not proc.HasExited then
        try proc.Kill(true) with _ -> ()
        try proc.WaitForExit(3000) |> ignore with _ -> ()

System.AppDomain.CurrentDomain.ProcessExit.Add(fun _ -> cleanup ())

try
    // Wait for the server to come up.
    use client = new HttpClient()
    client.Timeout <- TimeSpan.FromSeconds(2.0)
    let mutable ready = false
    let deadline = DateTime.UtcNow + TimeSpan.FromSeconds(30.0)
    while not ready && DateTime.UtcNow < deadline do
        try
            let resp = client.GetAsync(baseUrl + "/health").GetAwaiter().GetResult()
            if resp.IsSuccessStatusCode then
                ready <- true
        with _ ->
            Thread.Sleep(500)
    if not ready then
        printfn "  FAIL  backend never came up on %s" baseUrl
        failed <- failed + 1
        cleanup ()
        exit 1

    printfn "[stripe-test] backend ready"
    printfn ""

    // ---------------------------------------------------------------
    // 1. POST /api/stripe/checkout (DEV_MODE -> dev-user)
    // ---------------------------------------------------------------
    printfn "1. POST /api/stripe/checkout"
    let req = new HttpRequestMessage(HttpMethod.Post, baseUrl + "/api/stripe/checkout")
    req.Content <- new StringContent("{}", Encoding.UTF8, "application/json")
    let resp = client.SendAsync(req).GetAwaiter().GetResult()
    assertTrue "status = 200" (int resp.StatusCode = 200)
    let body = resp.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    assertContains "body has url" body "\"url\""
    assertContains "url uses configured FRONTEND_URL" body frontendUrl
    assertContains "url points at /upgrade-stub" body "/upgrade-stub"
    assertContains "body has sessionId" body "sessionId"
    assertContains "body marked stub:true" body "\"stub\":true"

    let parsed = JsonDocument.Parse(body)
    let urlField = parsed.RootElement.GetProperty("url").GetString()
    assertTrue "url begins with FRONTEND_URL" (urlField.StartsWith(frontendUrl + "/upgrade-stub"))
    let sessField = parsed.RootElement.GetProperty("sessionId").GetString()
    assertTrue "sessionId is non-empty" (sessField.Length > 8)

    printfn ""

    // ---------------------------------------------------------------
    // 2. POST /api/stripe/webhook with arbitrary body
    // ---------------------------------------------------------------
    printfn "2. POST /api/stripe/webhook"
    let webhookBody = "{\"type\":\"checkout.session.completed\",\"data\":{}}"
    let req2 = new HttpRequestMessage(HttpMethod.Post, baseUrl + "/api/stripe/webhook")
    req2.Content <- new StringContent(webhookBody, Encoding.UTF8, "application/json")
    let resp2 = client.SendAsync(req2).GetAwaiter().GetResult()
    assertTrue "webhook status = 200" (int resp2.StatusCode = 200)
    let body2 = resp2.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    assertContains "webhook body marks received" body2 "received"
    assertContains "webhook body marks stub" body2 "stub"

    printfn ""

    // ---------------------------------------------------------------
    // 3. POST /api/stripe/webhook with empty body
    // ---------------------------------------------------------------
    printfn "3. POST /api/stripe/webhook (empty)"
    let req3 = new HttpRequestMessage(HttpMethod.Post, baseUrl + "/api/stripe/webhook")
    req3.Content <- new StringContent("", Encoding.UTF8, "application/json")
    let resp3 = client.SendAsync(req3).GetAwaiter().GetResult()
    assertTrue "empty webhook returns 200" (int resp3.StatusCode = 200)

    printfn ""
    printfn "== %d passed, %d failed ==" passed failed
    cleanup ()
    if failed > 0 then exit 1 else exit 0
with
| ex ->
    printfn "  FAIL  unexpected exception: %s" ex.Message
    cleanup ()
    exit 1
