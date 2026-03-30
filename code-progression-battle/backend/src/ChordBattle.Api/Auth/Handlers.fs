namespace ChordBattle.Api.Auth

open System
open System.Security.Claims
open System.Text
open System.IdentityModel.Tokens.Jwt
open System.Threading.Tasks
open Microsoft.AspNetCore.Authentication
open Microsoft.AspNetCore.Authentication.Google
open Microsoft.AspNetCore.Http
open Microsoft.IdentityModel.Tokens
open ChordBattle.Api

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
                issuer = "chord-battle",
                audience = "chord-battle",
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

    let callbackCompleteHandler (config: AppConfig) (ctx: HttpContext) : Task =
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

    let meHandler (devMode: bool) (ctx: HttpContext) : Task =
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

                do! ctx.Response.WriteAsJsonAsync({| name = name; email = email; sub = sub |})
            elif devMode then
                do! ctx.Response.WriteAsJsonAsync({| name = "Dev User"; email = "dev@test.com"; sub = "dev-user" |})
            else
                ctx.Response.StatusCode <- 401
                do! ctx.Response.WriteAsync("Unauthorized")
        }
