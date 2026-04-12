namespace TamekomaNight.Api.Auth

open System
open System.Security.Claims
open System.Text
open System.IdentityModel.Tokens.Jwt
open System.Threading.Tasks
open Microsoft.AspNetCore.Authentication
open Microsoft.AspNetCore.Authentication.Google
open Microsoft.AspNetCore.Http
open Microsoft.IdentityModel.Tokens
open TamekomaNight.Api
open TamekomaNight.Api.User

module AuthHandlers =

    let private createJwt (config: AppConfig) (claims: Claim seq) =
        let key = SymmetricSecurityKey(Encoding.UTF8.GetBytes(config.JwtSigningKey))
        let credentials = SigningCredentials(key, SecurityAlgorithms.HmacSha256)

        let filteredClaims =
            claims
            |> Seq.filter (fun c ->
                c.Type = ClaimTypes.NameIdentifier
                || c.Type = ClaimTypes.Name
                || c.Type = ClaimTypes.Email)
            |> Seq.toArray

        let token =
            JwtSecurityToken(
                issuer = "tamekoma-night",
                audience = "tamekoma-night",
                claims = filteredClaims,
                expires = DateTime.UtcNow.AddDays(7.0),
                signingCredentials = credentials
            )

        JwtSecurityTokenHandler().WriteToken(token)

    let loginHandler (ctx: HttpContext) : Task =
        task {
            let properties = AuthenticationProperties(RedirectUri = "/auth/callback-complete")
            do! ctx.ChallengeAsync(GoogleDefaults.AuthenticationScheme, properties)
        }

    let callbackCompleteHandler
        (config: AppConfig)
        (userRepo: Repository.IUserRepository)
        (ctx: HttpContext)
        : Task =
        task {
            let user = ctx.User

            if user.Identity <> null && user.Identity.IsAuthenticated then
                let jwt = createJwt config user.Claims

                ctx.Response.Cookies.Append(
                    "session",
                    jwt,
                    CookieOptions(
                        HttpOnly = true,
                        Secure = true,
                        SameSite = SameSiteMode.Lax,
                        MaxAge = TimeSpan.FromDays(7.0)
                    )
                )

                // Ensure a users/{uid} document exists so /auth/me and the Bridge
                // ticket endpoint can read the tier. Failure here must not block
                // login — we just log and continue.
                let uid =
                    user.FindFirst(ClaimTypes.NameIdentifier)
                    |> Option.ofObj
                    |> Option.map (fun c -> c.Value)
                    |> Option.defaultValue ""
                if not (String.IsNullOrEmpty uid) then
                    try
                        let! _ = userRepo.GetOrCreate uid
                        ()
                    with ex ->
                        Console.Error.WriteLine(
                            sprintf "users.getOrCreate failed for uid=%s: %s" uid ex.Message)

                let redirectUrl = if String.IsNullOrEmpty(config.FrontendUrl) then "/" else config.FrontendUrl
                ctx.Response.Redirect(redirectUrl)
            else
                ctx.Response.StatusCode <- 401
                do! ctx.Response.WriteAsync("Authentication failed")
        }

    let logoutHandler (ctx: HttpContext) : Task =
        task {
            ctx.Response.Cookies.Delete("session")
            ctx.Response.StatusCode <- 204
        }

    let meHandler
        (devMode: bool)
        (config: AppConfig)
        (userRepo: Repository.IUserRepository)
        (ctx: HttpContext)
        : Task =
        task {
            let user = ctx.User

            if user.Identity <> null && user.Identity.IsAuthenticated then
                let name =
                    user.FindFirst(ClaimTypes.Name)
                    |> Option.ofObj
                    |> Option.map (fun c -> c.Value)
                    |> Option.defaultValue ""

                let email =
                    user.FindFirst(ClaimTypes.Email)
                    |> Option.ofObj
                    |> Option.map (fun c -> c.Value)
                    |> Option.defaultValue ""

                let sub =
                    user.FindFirst(ClaimTypes.NameIdentifier)
                    |> Option.ofObj
                    |> Option.map (fun c -> c.Value)
                    |> Option.defaultValue ""

                // Best-effort tier lookup. If Firestore is unreachable we default to "free"
                // rather than erroring the auth endpoint.
                let! tier =
                    task {
                        if String.IsNullOrEmpty sub then
                            return "free"
                        else
                            try
                                let! t = Repository.resolveTier config userRepo sub
                                return t
                            with ex ->
                                Console.Error.WriteLine(
                                    sprintf "users.resolveTier failed for uid=%s: %s" sub ex.Message)
                                return "free"
                    }

                do! ctx.Response.WriteAsJsonAsync(
                        {| name = name; email = email; sub = sub; tier = tier |})
            elif devMode then
                let tier =
                    if Config.isDevPremiumUid config "dev-user" then "premium" else "free"
                do! ctx.Response.WriteAsJsonAsync(
                        {| name = "Dev User"
                           email = "dev@test.com"
                           sub = "dev-user"
                           tier = tier |})
            else
                ctx.Response.StatusCode <- 401
                do! ctx.Response.WriteAsync("Unauthorized")
        }
