namespace TamekomaNight.Api.User

open System
open System.Collections.Concurrent
open System.Threading.Tasks
open TamekomaNight.Api
open TamekomaNight.Api.User.Models

module Repository =

    type IUserRepository =
        { GetOrCreate: string -> Task<UserDoc>
          SetTier: string -> string -> Task<unit> }

    module InMemory =

        let private users = ConcurrentDictionary<string, UserDoc>()

        let getOrCreate (uid: string) : Task<UserDoc> =
            let created =
                users.GetOrAdd(uid, fun key ->
                    { Uid = key
                      Tier = "free"
                      CreatedAt = DateTime.UtcNow
                      StripeCustomerId = None })
            Task.FromResult created

        let setTier (uid: string) (tier: string) : Task<unit> =
            users.AddOrUpdate(
                uid,
                (fun key ->
                    { Uid = key
                      Tier = tier
                      CreatedAt = DateTime.UtcNow
                      StripeCustomerId = None }),
                (fun _ existing -> { existing with Tier = tier }))
            |> ignore
            Task.FromResult ()

    module Firestore =

        open Google.Cloud.Firestore

        let private db =
            lazy (
                let projectId = Environment.GetEnvironmentVariable("FIRESTORE_PROJECT_ID")
                FirestoreDb.Create(projectId)
            )

        let private toUserDoc (uid: string) (doc: DocumentSnapshot) : UserDoc =
            let tier =
                FirestoreHelpers.tryGetDocString doc "tier" "free"
            let createdAt =
                FirestoreHelpers.tryGetDocTimestamp doc "createdAt" DateTime.UtcNow
            let stripeCustomerId =
                match doc.TryGetValue<string>("stripeCustomerId") with
                | true, v when not (String.IsNullOrEmpty v) -> Some v
                | _ -> None
            { Uid = uid
              Tier = if String.IsNullOrEmpty tier then "free" else tier
              CreatedAt = createdAt
              StripeCustomerId = stripeCustomerId }

        let getOrCreate (uid: string) : Task<UserDoc> =
            task {
                let docRef = db.Value.Collection("users").Document(uid)
                let! snapshot = docRef.GetSnapshotAsync()
                if snapshot.Exists then
                    return toUserDoc uid snapshot
                else
                    let now = DateTime.UtcNow
                    let fields =
                        System.Collections.Generic.Dictionary<string, obj>(
                            dict
                                [ "tier", ("free" :> obj)
                                  "createdAt", FirestoreHelpers.toTimestamp now ])
                    let! _ = docRef.SetAsync(fields)
                    return
                        { Uid = uid
                          Tier = "free"
                          CreatedAt = now
                          StripeCustomerId = None }
            }

        let setTier (uid: string) (tier: string) : Task<unit> =
            task {
                let docRef = db.Value.Collection("users").Document(uid)
                do! FirestoreHelpers.updateFields docRef [ "tier", tier :> obj ]
                return ()
            }

    let create (firestoreProjectId: string) : IUserRepository =
        if String.IsNullOrEmpty(firestoreProjectId) then
            { GetOrCreate = InMemory.getOrCreate
              SetTier = InMemory.setTier }
        else
            { GetOrCreate = Firestore.getOrCreate
              SetTier = Firestore.setTier }

    /// Resolve the effective tier for a user, honouring the dev-premium override.
    /// This is the single place that combines Firestore state with CADENZA_DEV_PREMIUM_UIDS.
    let resolveTier (config: AppConfig) (repo: IUserRepository) (uid: string) : Task<string> =
        task {
            let! user = repo.GetOrCreate uid
            if Config.isDevPremiumUid config uid then
                return "premium"
            else
                return user.Tier
        }
