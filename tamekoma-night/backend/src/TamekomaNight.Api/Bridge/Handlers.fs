namespace TamekomaNight.Api.Bridge

open System
open System.IdentityModel.Tokens.Jwt
open System.Security.Claims
open System.Text
open System.Text.Json.Serialization
open System.Threading.Tasks
open Microsoft.AspNetCore.Http
open Microsoft.IdentityModel.Tokens
open TamekomaNight.Api

module Handlers =

    // Audience used when signing Bridge-facing tickets. Must match the audience
    // checked on verify. Kept private to this module so it cannot drift.
    let private bridgeTicketAudience = "cadenza-bridge"
    let private bridgeTicketIssuer = "tamekoma-night"
    let private bridgeTicketLifetime = TimeSpan.FromMinutes(10.0)

    // ── Entitlements ─────────────────────────────────────────

    /// Entitlements the Bridge should trust for the given tier. Kept as a small
    /// anonymous record so the wire format stays declarative and is easy to
    /// extend from a single place.
    let entitlementsFor (tier: string) =
        let isPremium = tier = "premium"
        {| bridgeAccess = isPremium
           vstHosting = isPremium
           clapHosting = isPremium
           wavHighQualityExport = isPremium
           automation = isPremium
           mixerNlEdit = isPremium
           builtinSynths = true |}

    // ── Ticket signing ───────────────────────────────────────

    let signTicket (config: AppConfig) (uid: string) (tier: string) : string * DateTime =
        let handler = JwtSecurityTokenHandler()
        let key = SymmetricSecurityKey(Encoding.UTF8.GetBytes(config.JwtSigningKey))
        let creds = SigningCredentials(key, SecurityAlgorithms.HmacSha256)
        let claims : Claim array =
            [| Claim(JwtRegisteredClaimNames.Sub, uid)
               Claim("tier", tier) |]
        let expires = DateTime.UtcNow + bridgeTicketLifetime
        let token =
            JwtSecurityToken(
                issuer = bridgeTicketIssuer,
                audience = bridgeTicketAudience,
                claims = claims,
                expires = expires,
                signingCredentials = creds
            )
        handler.WriteToken(token), expires

    // ── POST /api/bridge/ticket ──────────────────────────────
    // Requires cookie auth. Returns a short-lived JWT the browser can hand to
    // the Bridge via `session.verify`.

    let issueTicketHandler
        (config: AppConfig)
        (userRepo: User.Repository.IUserRepository)
        (ctx: HttpContext)
        : Task =
        task {
            // Use Shared.getUserInfo which honours DEV_MODE (returns "dev-user")
            // so local QA can exercise the Bridge ticket flow without Google OAuth.
            let userInfo = Shared.getUserInfo Config.devMode ctx
            let uid = userInfo.UserId

            if String.IsNullOrEmpty uid || uid = "anonymous" then
                do! Shared.respondJson ctx 401 {| error = "Unauthorized" |}
            else
                let! tier = User.Repository.resolveTier config userRepo uid
                let token, expiresAt = signTicket config uid tier
                do! Shared.respondJson ctx 200
                        {| ticket = token
                           tier = tier
                           expiresAt = expiresAt |}
        }

    // ── POST /api/bridge/verify-ticket ───────────────────────
    // Intentionally unauthenticated — the JWT in the request body is the credential.
    // Bridge calls this; it has no browser cookie.

    [<CLIMutable>]
    type VerifyTicketRequest =
        { [<JsonPropertyName("ticket")>]
          Ticket: string }

    let private validateVerifyRequest (req: VerifyTicketRequest) : bool =
        not (String.IsNullOrWhiteSpace(req.Ticket))

    let verifyTicketHandler (config: AppConfig) (ctx: HttpContext) : Task =
        Shared.withParsedRequest<VerifyTicketRequest>
            ctx
            validateVerifyRequest
            (fun req ->
                task {
                    let handler = JwtSecurityTokenHandler()
                    let key = SymmetricSecurityKey(Encoding.UTF8.GetBytes(config.JwtSigningKey))
                    let parameters =
                        TokenValidationParameters(
                            ValidateIssuerSigningKey = true,
                            IssuerSigningKey = key,
                            ValidateIssuer = false,
                            ValidateAudience = true,
                            ValidAudience = bridgeTicketAudience,
                            ValidateLifetime = true,
                            ClockSkew = TimeSpan.FromSeconds(30.0)
                        )
                    try
                        let! validation = handler.ValidateTokenAsync(req.Ticket, parameters)
                        // ValidateTokenAsync is non-throwing — it returns IsValid = false on
                        // signature / audience / lifetime failures. We MUST check this.
                        if not validation.IsValid then
                            let reason =
                                if obj.ReferenceEquals(validation.Exception, null) then
                                    "Token validation failed"
                                else
                                    validation.Exception.Message
                            do! Shared.respondJson ctx 200
                                    {| valid = false
                                       reason = reason |}
                        else
                            let token = handler.ReadJwtToken(req.Ticket)
                            let uid = token.Subject
                            let tier =
                                token.Claims
                                |> Seq.tryFind (fun c -> c.Type = "tier")
                                |> Option.map (fun c -> c.Value)
                                |> Option.defaultValue "free"
                            let entitlements = entitlementsFor tier
                            do! Shared.respondJson ctx 200
                                    {| valid = true
                                       userId = uid
                                       tier = tier
                                       entitlements = entitlements
                                       expiresAt = token.ValidTo |}
                    with ex ->
                        do! Shared.respondJson ctx 200
                                {| valid = false
                                   reason = ex.Message |}
                })
