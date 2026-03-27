namespace SinSublimation.Api.Middleware

open System
open System.Collections.Concurrent
open System.Security.Claims
open Microsoft.AspNetCore.Http
open Giraffe

module RateLimit =

    type private TokenBucket =
        { mutable Tokens: float
          mutable LastRefill: DateTime }

    let private buckets = ConcurrentDictionary<string, TokenBucket>()
    let private maxTokens = 10.0
    let private refillRate = 10.0 / 60.0 // 10 tokens per 60 seconds

    let private getOrCreateBucket (userId: string) =
        buckets.GetOrAdd(
            userId,
            fun _ ->
                { Tokens = maxTokens
                  LastRefill = DateTime.UtcNow }
        )

    let private tryConsume (userId: string) : Result<unit, float> =
        let bucket = getOrCreateBucket userId
        let now = DateTime.UtcNow
        let elapsed = (now - bucket.LastRefill).TotalSeconds
        let refilled = Math.Min(maxTokens, bucket.Tokens + elapsed * refillRate)
        bucket.LastRefill <- now
        bucket.Tokens <- refilled

        if bucket.Tokens >= 1.0 then
            bucket.Tokens <- bucket.Tokens - 1.0
            Ok()
        else
            let waitSeconds = (1.0 - bucket.Tokens) / refillRate
            Error(Math.Ceiling(waitSeconds))

    let rateLimitMiddleware: HttpHandler =
        fun next ctx ->
            task {
                let user = ctx.User

                let userId =
                    match user.FindFirst(ClaimTypes.NameIdentifier) with
                    | null -> ctx.Connection.RemoteIpAddress.ToString()
                    | claim -> claim.Value

                match tryConsume userId with
                | Ok() -> return! next ctx
                | Error retryAfter ->
                    ctx.SetStatusCode 429
                    return! json {| error = "Rate limit exceeded"; retryAfterSeconds = retryAfter |} next ctx
            }
