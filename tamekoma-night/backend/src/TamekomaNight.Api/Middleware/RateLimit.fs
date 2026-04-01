namespace TamekomaNight.Api.Middleware

open System
open System.Collections.Concurrent
open System.Security.Claims
open Microsoft.AspNetCore.Http

module RateLimit =

    type private TokenBucket =
        { mutable Tokens: float
          mutable LastRefill: DateTime }

    let private buckets = ConcurrentDictionary<string, TokenBucket>()
    let private maxTokens = 20.0
    let private refillRate = 20.0 / 120.0 // 20 tokens per 120 seconds

    let private getOrCreateBucket (userId: string) =
        buckets.GetOrAdd(
            userId,
            fun _ ->
                { Tokens = maxTokens
                  LastRefill = DateTime.UtcNow }
        )

    let tryConsume (userId: string) : Result<unit, float> =
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

    let getUserId (ctx: HttpContext) =
        let user = ctx.User

        match user.FindFirst(ClaimTypes.NameIdentifier) with
        | null -> ctx.Connection.RemoteIpAddress.ToString()
        | claim -> claim.Value
