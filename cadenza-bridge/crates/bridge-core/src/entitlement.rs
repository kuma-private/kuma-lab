//! Premium entitlement tracking for the Bridge.
//!
//! The browser session logs into the Cadenza backend over HTTPS and
//! receives a short-lived JWT ticket. It hands the ticket to the
//! Bridge over WebSocket via the `session.verify` command. The Bridge
//! POSTs the ticket to `{backend_url}/api/bridge/verify-ticket`, which
//! returns the user's tier + entitlement shape. The result is cached
//! here so every subsequent command can gate in O(1).
//!
//! The cache expires after `CACHE_TTL`; commands issued after that
//! window return `premium_required` even if they were previously
//! allowed. The browser is responsible for refreshing the ticket via
//! a fresh `session.verify`.
//!
//! When the session has never verified (or verification failed), the
//! cache reports the free entitlement shape. Free users can still use
//! every non-gated Bridge command (built-in effects, transport,
//! project.load, etc.).

use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::Deserialize;

/// Per-feature premium entitlements, mirrored from the backend's
/// `entitlementsFor` function in `Bridge/Handlers.fs`.
#[derive(Debug, Clone, Copy)]
pub struct Entitlements {
    pub bridge_access: bool,
    pub vst_hosting: bool,
    pub clap_hosting: bool,
    pub wav_high_quality_export: bool,
    pub automation: bool,
    pub mixer_nl_edit: bool,
    pub builtin_synths: bool,
}

impl Entitlements {
    pub const fn free() -> Self {
        Self {
            bridge_access: false,
            vst_hosting: false,
            clap_hosting: false,
            wav_high_quality_export: false,
            automation: false,
            mixer_nl_edit: false,
            builtin_synths: true,
        }
    }
    pub const fn premium() -> Self {
        Self {
            bridge_access: true,
            vst_hosting: true,
            clap_hosting: true,
            wav_high_quality_export: true,
            automation: true,
            mixer_nl_edit: true,
            builtin_synths: true,
        }
    }
}

#[derive(Debug, Clone)]
pub struct VerifiedSession {
    pub user_id: String,
    pub tier: String,
    pub entitlements: Entitlements,
    pub expires_at: Instant,
}

/// Default cache TTL. Even if the backend reports a longer ticket
/// validity the Bridge refreshes every 15 minutes to stay in sync
/// with subscription cancellations.
pub const CACHE_TTL: Duration = Duration::from_secs(15 * 60);

/// Payload returned by the backend's `POST /api/bridge/verify-ticket`.
/// Fields use serde(default) so a backend upgrade that adds fields
/// doesn't break older Bridges.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyTicketResponse {
    pub valid: bool,
    #[serde(default)]
    pub user_id: String,
    #[serde(default)]
    pub tier: String,
    #[serde(default)]
    pub reason: Option<String>,
    #[serde(default)]
    pub entitlements: Option<EntitlementsPayload>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntitlementsPayload {
    #[serde(default)]
    pub bridge_access: bool,
    #[serde(default)]
    pub vst_hosting: bool,
    #[serde(default)]
    pub clap_hosting: bool,
    #[serde(default)]
    pub wav_high_quality_export: bool,
    #[serde(default)]
    pub automation: bool,
    #[serde(default)]
    pub mixer_nl_edit: bool,
    #[serde(default)]
    pub builtin_synths: bool,
}

impl From<&EntitlementsPayload> for Entitlements {
    fn from(p: &EntitlementsPayload) -> Self {
        Self {
            bridge_access: p.bridge_access,
            vst_hosting: p.vst_hosting,
            clap_hosting: p.clap_hosting,
            wav_high_quality_export: p.wav_high_quality_export,
            automation: p.automation,
            mixer_nl_edit: p.mixer_nl_edit,
            builtin_synths: p.builtin_synths,
        }
    }
}

/// Thread-safe entitlement cache shared across all WS handlers.
#[derive(Clone)]
pub struct EntitlementCache {
    inner: Arc<Mutex<Inner>>,
}

struct Inner {
    session: Option<VerifiedSession>,
    /// Base URL of the backend for refresh calls. Defaults to the
    /// Cadenza production URL; tests override via
    /// `EntitlementCache::with_backend_url`.
    backend_url: String,
}

impl EntitlementCache {
    pub fn new() -> Self {
        Self::with_backend_url(default_backend_url())
    }

    pub fn with_backend_url(backend_url: impl Into<String>) -> Self {
        Self {
            inner: Arc::new(Mutex::new(Inner {
                session: None,
                backend_url: backend_url.into(),
            })),
        }
    }

    pub fn backend_url(&self) -> String {
        self.inner.lock().expect("entitlement cache poisoned").backend_url.clone()
    }

    /// True if the cached session is still within its TTL and reports
    /// `tier == "premium"`. Used by command handlers to gate features.
    pub fn is_premium(&self) -> bool {
        let g = self.inner.lock().expect("entitlement cache poisoned");
        match &g.session {
            Some(s) => s.tier == "premium" && Instant::now() < s.expires_at,
            None => false,
        }
    }

    /// Return the cached entitlement shape. Falls back to `Entitlements::free()`
    /// when the cache is empty or expired.
    pub fn entitlements(&self) -> Entitlements {
        let g = self.inner.lock().expect("entitlement cache poisoned");
        match &g.session {
            Some(s) if Instant::now() < s.expires_at => s.entitlements,
            _ => Entitlements::free(),
        }
    }

    pub fn snapshot(&self) -> Option<VerifiedSession> {
        let g = self.inner.lock().expect("entitlement cache poisoned");
        g.session.clone()
    }

    /// Store a freshly verified session. Called by the `session.verify`
    /// handler after a successful POST to `/api/bridge/verify-ticket`.
    pub fn store(&self, session: VerifiedSession) {
        let mut g = self.inner.lock().expect("entitlement cache poisoned");
        g.session = Some(session);
    }

    /// Invalidate the cached session. Called on disconnect or explicit
    /// sign-out. After clear(), `is_premium()` returns false and
    /// `entitlements()` returns the free shape.
    pub fn clear(&self) {
        let mut g = self.inner.lock().expect("entitlement cache poisoned");
        g.session = None;
    }

    /// Perform the synchronous HTTP verify-ticket call and update the
    /// cache. Used by the `session.verify` handler. The call is done
    /// via `ureq` in blocking mode; callers wrap in `spawn_blocking`
    /// when running inside a tokio task.
    pub fn refresh_blocking(&self, ticket: &str) -> anyhow::Result<VerifiedSession> {
        let url = format!("{}/api/bridge/verify-ticket", self.backend_url());
        tracing::debug!("entitlement: POST {url}");
        let body = serde_json::json!({ "ticket": ticket });
        let agent = ureq::AgentBuilder::new()
            .timeout(Duration::from_secs(10))
            .build();
        let resp = agent
            .post(&url)
            .set("Content-Type", "application/json")
            .send_string(&body.to_string())
            .map_err(|e| anyhow::anyhow!("verify-ticket request failed: {e}"))?;
        let json: VerifyTicketResponse = resp
            .into_json()
            .map_err(|e| anyhow::anyhow!("verify-ticket decode failed: {e}"))?;
        parse_and_store(self, json)
    }

    /// Directly store a pre-parsed response, used by unit tests where
    /// we don't want a real HTTP hop.
    #[cfg(test)]
    pub fn apply_response(&self, resp: VerifyTicketResponse) -> anyhow::Result<VerifiedSession> {
        parse_and_store(self, resp)
    }
}

fn parse_and_store(
    cache: &EntitlementCache,
    resp: VerifyTicketResponse,
) -> anyhow::Result<VerifiedSession> {
    if !resp.valid {
        cache.clear();
        return Err(anyhow::anyhow!(
            "verify-ticket rejected: {}",
            resp.reason.unwrap_or_else(|| "unknown".into())
        ));
    }
    let entitlements = match &resp.entitlements {
        Some(p) => Entitlements::from(p),
        None => {
            if resp.tier == "premium" {
                Entitlements::premium()
            } else {
                Entitlements::free()
            }
        }
    };
    let session = VerifiedSession {
        user_id: resp.user_id,
        tier: resp.tier,
        entitlements,
        expires_at: Instant::now() + CACHE_TTL,
    };
    cache.store(session.clone());
    Ok(session)
}

impl Default for EntitlementCache {
    fn default() -> Self {
        Self::new()
    }
}

/// Resolve the backend URL from `CADENZA_BACKEND_URL` env var, falling
/// back to the public Cadenza.fm deployment. Kept as a free function so
/// tests can inject an override without touching the env.
pub fn default_backend_url() -> String {
    std::env::var("CADENZA_BACKEND_URL")
        .unwrap_or_else(|_| "https://cadenza.fm".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn free_shape_only_includes_builtin_synths() {
        let e = Entitlements::free();
        assert!(!e.bridge_access);
        assert!(!e.vst_hosting);
        assert!(!e.clap_hosting);
        assert!(!e.wav_high_quality_export);
        assert!(!e.automation);
        assert!(!e.mixer_nl_edit);
        assert!(e.builtin_synths);
    }

    #[test]
    fn premium_shape_includes_all() {
        let e = Entitlements::premium();
        assert!(e.bridge_access);
        assert!(e.vst_hosting);
        assert!(e.clap_hosting);
        assert!(e.wav_high_quality_export);
        assert!(e.automation);
        assert!(e.mixer_nl_edit);
        assert!(e.builtin_synths);
    }

    #[test]
    fn empty_cache_is_free() {
        let c = EntitlementCache::with_backend_url("http://unused");
        assert!(!c.is_premium());
        let e = c.entitlements();
        assert!(!e.vst_hosting);
        assert!(e.builtin_synths);
    }

    #[test]
    fn apply_valid_response_makes_it_premium() {
        let c = EntitlementCache::with_backend_url("http://unused");
        let resp = VerifyTicketResponse {
            valid: true,
            user_id: "u1".into(),
            tier: "premium".into(),
            reason: None,
            entitlements: Some(EntitlementsPayload {
                bridge_access: true,
                vst_hosting: true,
                clap_hosting: true,
                wav_high_quality_export: true,
                automation: true,
                mixer_nl_edit: true,
                builtin_synths: true,
            }),
        };
        c.apply_response(resp).unwrap();
        assert!(c.is_premium());
        assert!(c.entitlements().vst_hosting);
    }

    #[test]
    fn apply_invalid_response_clears_cache() {
        let c = EntitlementCache::with_backend_url("http://unused");
        // Seed a session first.
        let ok = VerifyTicketResponse {
            valid: true,
            user_id: "u1".into(),
            tier: "premium".into(),
            reason: None,
            entitlements: None,
        };
        c.apply_response(ok).unwrap();
        assert!(c.is_premium());

        let bad = VerifyTicketResponse {
            valid: false,
            user_id: String::new(),
            tier: String::new(),
            reason: Some("expired".into()),
            entitlements: None,
        };
        let err = c.apply_response(bad);
        assert!(err.is_err());
        assert!(!c.is_premium());
    }

    #[test]
    fn cache_expiry_reverts_to_free() {
        let c = EntitlementCache::with_backend_url("http://unused");
        // Insert a session that is already expired.
        let stale = VerifiedSession {
            user_id: "u1".into(),
            tier: "premium".into(),
            entitlements: Entitlements::premium(),
            expires_at: Instant::now() - Duration::from_secs(1),
        };
        c.store(stale);
        assert!(!c.is_premium());
        assert!(!c.entitlements().vst_hosting);
    }

    #[test]
    fn tier_defaults_to_free_entitlements_when_payload_missing() {
        let c = EntitlementCache::with_backend_url("http://unused");
        let resp = VerifyTicketResponse {
            valid: true,
            user_id: "u1".into(),
            tier: "free".into(),
            reason: None,
            entitlements: None,
        };
        c.apply_response(resp).unwrap();
        // tier=free ⇒ not premium
        assert!(!c.is_premium());
        let e = c.entitlements();
        assert!(!e.vst_hosting);
        assert!(e.builtin_synths);
    }
}
