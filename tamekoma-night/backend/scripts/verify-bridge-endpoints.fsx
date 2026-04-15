// Smoke test for the Phase 4 Bridge / Mixer / Automation backend endpoints.
//
// Verifies the ticket sign/verify round-trip by calling into the compiled
// TamekomaNight.Api.dll directly. No network, no Claude, no Firestore —
// just the JWT logic that is the security-critical piece of Phase 4.
//
// Run from the backend dir AFTER `dotnet build`:
//     dotnet fsi scripts/verify-bridge-endpoints.fsx
//
// Checks:
//  1. entitlementsFor "free" and "premium" return the expected shape
//  2. signTicket + JwtSecurityTokenHandler validation round-trips cleanly
//  3. A tampered ticket fails validation (IsValid = false)
//  4. A ticket with the wrong audience fails validation
//  5. An expired ticket fails validation
//  6. Config.isDevPremiumUid honours a CSV override

#r "../src/TamekomaNight.Api/bin/Debug/net9.0/TamekomaNight.Api.dll"
#r "../src/TamekomaNight.Api/bin/Debug/net9.0/System.IdentityModel.Tokens.Jwt.dll"
#r "../src/TamekomaNight.Api/bin/Debug/net9.0/Microsoft.IdentityModel.Tokens.dll"
#r "../src/TamekomaNight.Api/bin/Debug/net9.0/Microsoft.IdentityModel.JsonWebTokens.dll"
#r "../src/TamekomaNight.Api/bin/Debug/net9.0/Microsoft.IdentityModel.Abstractions.dll"
#r "../src/TamekomaNight.Api/bin/Debug/net9.0/Microsoft.IdentityModel.Logging.dll"

open System
open System.IdentityModel.Tokens.Jwt
open System.Text
open Microsoft.IdentityModel.Tokens
open TamekomaNight.Api
open TamekomaNight.Api.Bridge

let mutable passed = 0
let mutable failed = 0

let assertTrue label cond =
    if cond then
        printfn "  PASS  %s" label
        passed <- passed + 1
    else
        printfn "  FAIL  %s" label
        failed <- failed + 1

let assertEq label (expected: 'a) (actual: 'a) =
    if expected = actual then
        printfn "  PASS  %s" label
        passed <- passed + 1
    else
        printfn "  FAIL  %s: expected %A, got %A" label expected actual
        failed <- failed + 1

// Build a minimal config. We use the same default key the server falls back
// to in DEV_MODE so a subsequent `dotnet run` would verify the same tickets.
let config : AppConfig =
    { GoogleClientId = "dev"
      GoogleClientSecret = "dev"
      JwtSigningKey = "dev-signing-key-at-least-32-chars-long!"
      FrontendUrl = ""
      FirestoreProjectId = ""
      AnthropicApiKey = ""
      DevPremiumUids = [ "alice"; "bob" ]
      AllowedOrigins = [ "http://localhost:52730" ] }

printfn "== Bridge endpoints smoke test =="
printfn ""

// ---------------------------------------------------------------
// 1. entitlementsFor
// ---------------------------------------------------------------
printfn "1. entitlementsFor"
let freeEnt = Handlers.entitlementsFor "free"
let premEnt = Handlers.entitlementsFor "premium"

assertTrue "free.bridgeAccess = false"        (not freeEnt.bridgeAccess)
assertTrue "free.builtinSynths = true"        freeEnt.builtinSynths
assertTrue "free.vstHosting = false"          (not freeEnt.vstHosting)
assertTrue "free.automation = false"          (not freeEnt.automation)
assertTrue "free.wavHighQualityExport = false" (not freeEnt.wavHighQualityExport)

assertTrue "premium.bridgeAccess = true"       premEnt.bridgeAccess
assertTrue "premium.vstHosting = true"         premEnt.vstHosting
assertTrue "premium.clapHosting = true"        premEnt.clapHosting
assertTrue "premium.wavHighQualityExport = true" premEnt.wavHighQualityExport
assertTrue "premium.automation = true"         premEnt.automation
assertTrue "premium.mixerNlEdit = true"        premEnt.mixerNlEdit
assertTrue "premium.builtinSynths = true"      premEnt.builtinSynths

printfn ""

// ---------------------------------------------------------------
// 2. Config.isDevPremiumUid
// ---------------------------------------------------------------
printfn "2. Config.isDevPremiumUid"
assertTrue "alice is dev-premium"   (Config.isDevPremiumUid config "alice")
assertTrue "bob is dev-premium"     (Config.isDevPremiumUid config "bob")
assertTrue "carol is NOT dev-premium" (not (Config.isDevPremiumUid config "carol"))
assertTrue "empty uid is NOT dev-premium" (not (Config.isDevPremiumUid config ""))

printfn ""

// ---------------------------------------------------------------
// 3. signTicket / validate round-trip
// ---------------------------------------------------------------
printfn "3. signTicket round-trip"

let validateTicket (cfg: AppConfig) (ticket: string) =
    let handler = JwtSecurityTokenHandler()
    let key = SymmetricSecurityKey(Encoding.UTF8.GetBytes(cfg.JwtSigningKey))
    // Mirror the production verifyTicketHandler in Bridge/Handlers.fs:
    // ValidateIssuer must be true so a JWT signed with the same key but a
    // different `iss` claim cannot impersonate a Bridge ticket. Production
    // changed in this commit; this smoke test must enforce the new contract.
    let parameters =
        TokenValidationParameters(
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = key,
            ValidateIssuer = true,
            ValidIssuer = "tamekoma-night",
            ValidateAudience = true,
            ValidAudience = "cadenza-bridge",
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromSeconds(30.0))
    let task = handler.ValidateTokenAsync(ticket, parameters)
    task.GetAwaiter().GetResult()

let token, expiresAt = Handlers.signTicket config "alice" "premium"
assertTrue "ticket is non-empty" (token.Length > 20)
assertTrue "expiresAt is in the future" (expiresAt > DateTime.UtcNow)

let result = validateTicket config token
assertTrue "round-trip IsValid = true" result.IsValid

let parsed = JwtSecurityTokenHandler().ReadJwtToken(token)
assertEq "Subject"  "alice"    parsed.Subject
let tierClaim =
    parsed.Claims
    |> Seq.tryFind (fun c -> c.Type = "tier")
    |> Option.map (fun c -> c.Value)
    |> Option.defaultValue ""
assertEq "tier claim" "premium" tierClaim
assertTrue "audience includes cadenza-bridge"
    (parsed.Audiences |> Seq.exists (fun a -> a = "cadenza-bridge"))

printfn ""

// ---------------------------------------------------------------
// 4. Tampered signature is rejected
// ---------------------------------------------------------------
printfn "4. Tampered signature"
let tampered = token.Substring(0, token.Length - 5) + "xxxxx"
let tamperedResult = validateTicket config tampered
assertTrue "tampered IsValid = false" (not tamperedResult.IsValid)

printfn ""

// ---------------------------------------------------------------
// 5. Wrong signing key is rejected
// ---------------------------------------------------------------
printfn "5. Wrong signing key"
let otherConfig = { config with JwtSigningKey = "a-completely-different-key-xxxxxxxxxxxx" }
let ticketOther, _ = Handlers.signTicket otherConfig "alice" "premium"
let wrongKeyResult = validateTicket config ticketOther
assertTrue "wrong key IsValid = false" (not wrongKeyResult.IsValid)

printfn ""

// ---------------------------------------------------------------
// 6. Ticket with the wrong audience is rejected
// ---------------------------------------------------------------
printfn "6. Wrong audience"
let signRaw (iss: string) (aud: string) (lifetime: TimeSpan) =
    let handler = JwtSecurityTokenHandler()
    let key = SymmetricSecurityKey(Encoding.UTF8.GetBytes(config.JwtSigningKey))
    let creds = SigningCredentials(key, SecurityAlgorithms.HmacSha256)
    let claims =
        [|
            System.Security.Claims.Claim("sub", "alice")
            System.Security.Claims.Claim("tier", "premium")
        |]
    let jwt =
        JwtSecurityToken(
            issuer = iss,
            audience = aud,
            claims = claims,
            expires = DateTime.UtcNow + lifetime,
            signingCredentials = creds)
    handler.WriteToken(jwt)

let wrongAud = signRaw "tamekoma-night" "other-service" (TimeSpan.FromMinutes 10.0)
let wrongAudResult = validateTicket config wrongAud
assertTrue "wrong audience IsValid = false" (not wrongAudResult.IsValid)

// 6b. Wrong issuer rejection (regression for the hardened verifyTicketHandler)
printfn "6b. Wrong issuer"
let wrongIss = signRaw "evil-service" "cadenza-bridge" (TimeSpan.FromMinutes 10.0)
let wrongIssResult = validateTicket config wrongIss
assertTrue "wrong issuer IsValid = false" (not wrongIssResult.IsValid)

printfn ""

// ---------------------------------------------------------------
// 7. Expired ticket is rejected
// ---------------------------------------------------------------
printfn "7. Expired ticket"
let expiredTicket = signRaw "tamekoma-night" "cadenza-bridge" (TimeSpan.FromSeconds -120.0)
let expiredResult = validateTicket config expiredTicket
assertTrue "expired IsValid = false" (not expiredResult.IsValid)

printfn ""

// ---------------------------------------------------------------
// Summary
// ---------------------------------------------------------------
printfn "== %d passed, %d failed ==" passed failed
if failed > 0 then exit 1 else exit 0
