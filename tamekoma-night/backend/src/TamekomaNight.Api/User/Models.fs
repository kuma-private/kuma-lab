namespace TamekomaNight.Api.User

open System

module Models =

    /// Per-user document stored at users/{uid}.
    /// Introduced in Phase 4 (Cadenza Bridge) to track subscription tier.
    type UserDoc =
        { Uid: string
          Tier: string                       // "free" | "premium"
          CreatedAt: DateTime
          StripeCustomerId: string option }
