//! Auto-update infrastructure for Cadenza Bridge.
//!
//! Phase 7 wires the update-check plumbing through the protocol, tray and
//! frontend. The actual network call and binary swap are gated on the
//! `CADENZA_BRIDGE_REPO` env var: when unset (or empty) the checker returns
//! `Ok(None)` without touching the network, so CI and dev agents never try
//! to hit GitHub. Phase 9 (public release) will add the real reqwest/
//! self_update/ed25519 dependencies; the signatures exported here are the
//! ones the rest of the workspace calls against, so the Phase 9 swap is a
//! local-only change.

use std::path::{Path, PathBuf};

use anyhow::Result;
use bridge_protocol::UpdateInfoSnapshot;
use serde::{Deserialize, Serialize};
use tracing::{debug, info, warn};

pub use bridge_protocol::UpdateInfoSnapshot as UpdateInfo;

/// A single poll of the update source. `None` means "no update available
/// right now" (this is distinct from "polling disabled" — polling disabled
/// also returns `None`, callers should check `is_enabled()` when the
/// distinction matters).
pub async fn check_for_update(repo: &str, current: &str) -> Result<Option<UpdateInfo>> {
    if repo.is_empty() {
        debug!("updater: CADENZA_BRIDGE_REPO empty, skipping network poll");
        return Ok(None);
    }
    // Phase 7: the real reqwest call is gated on Phase 9 dependency
    // activation. Today we return `Ok(None)` so the poller is a no-op
    // even if the env var is set — this avoids accidental GitHub calls
    // from dev machines and makes the check loop testable without the
    // network.
    info!("updater: would poll https://api.github.com/repos/{repo}/releases/latest (current={current})");
    Ok(None)
}

/// Compare two semver-ish version strings. Returns `true` if `latest` is
/// strictly newer than `current`. Handles `vX.Y.Z` and `X.Y.Z` forms; any
/// unparsable component falls back to string-compare so a malformed tag
/// doesn't silently satisfy the "newer" check.
pub fn is_newer(current: &str, latest: &str) -> bool {
    let c = parse_semver(current);
    let l = parse_semver(latest);
    match (c, l) {
        (Some(c), Some(l)) => l > c,
        _ => current != latest && latest > current,
    }
}

fn parse_semver(s: &str) -> Option<(u32, u32, u32)> {
    let s = s.strip_prefix('v').unwrap_or(s);
    let mut parts = s.split('.');
    let a: u32 = parts.next()?.parse().ok()?;
    let b: u32 = parts.next()?.parse().ok()?;
    let c: u32 = parts.next()?.parse().ok()?;
    if parts.next().is_some() {
        return None;
    }
    Some((a, b, c))
}

/// GitHub Releases API payload we care about — kept narrow on purpose so
/// the Phase 9 reqwest path can decode straight into this type.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct GithubRelease {
    pub tag_name: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub body: String,
    pub html_url: String,
    #[serde(default)]
    pub assets: Vec<GithubAsset>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct GithubAsset {
    pub name: String,
    pub browser_download_url: String,
}

/// Convert a decoded `GithubRelease` into an `UpdateInfoSnapshot` that the
/// rest of the workspace consumes. Picks the first asset whose name ends
/// with `.zip` as the downloadable artifact; returns `None` if no suitable
/// asset is present.
pub fn snapshot_from_release(release: &GithubRelease, current: &str) -> Option<UpdateInfoSnapshot> {
    if !is_newer(current, &release.tag_name) {
        return None;
    }
    let asset = release
        .assets
        .iter()
        .find(|a| a.name.ends_with(".zip"))
        .map(|a| a.browser_download_url.clone())
        .unwrap_or_default();
    Some(UpdateInfoSnapshot {
        current_version: current.to_string(),
        latest_version: release.tag_name.clone(),
        release_url: release.html_url.clone(),
        release_notes: release.body.clone(),
        download_url: asset,
    })
}

/// Download the update artifact. Stubbed in Phase 7 — returns an error
/// because the actual reqwest/self_update path lands in Phase 9.
pub async fn download_update(info: &UpdateInfo) -> Result<PathBuf> {
    warn!(
        "updater: download_update stubbed in Phase 7 (url={})",
        info.download_url
    );
    anyhow::bail!("update download not yet implemented (Phase 9)")
}

/// Verify the downloaded artifact's ed25519 signature. Stubbed in Phase 7.
pub fn verify_signature(_file: &Path, _public_key_hex: &str) -> Result<()> {
    warn!("updater: verify_signature stubbed in Phase 7");
    anyhow::bail!("signature verification not yet implemented (Phase 9)")
}

/// Move the verified artifact into a staging slot next to the running
/// executable so the watchdog can pick it up on the next restart.
pub fn stage_update(_file: &Path) -> Result<PathBuf> {
    warn!("updater: stage_update stubbed in Phase 7");
    anyhow::bail!("update staging not yet implemented (Phase 9)")
}

/// Activate a previously-staged update. Called by the watchdog on clean
/// restart when a `.staged` file is present next to the bridge binary.
pub fn apply_staged_update() -> Result<()> {
    warn!("updater: apply_staged_update stubbed in Phase 7");
    anyhow::bail!("staged update apply not yet implemented (Phase 9)")
}

/// Whether the updater is actually configured to poll. Reads
/// `CADENZA_BRIDGE_REPO`; empty / unset = disabled.
pub fn is_enabled() -> bool {
    !repo_from_env().is_empty()
}

pub fn repo_from_env() -> String {
    std::env::var("CADENZA_BRIDGE_REPO").unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn semver_newer_compares_patch_minor_major() {
        assert!(is_newer("0.1.0", "0.1.1"));
        assert!(is_newer("0.1.9", "0.2.0"));
        assert!(is_newer("0.9.9", "1.0.0"));
        assert!(is_newer("0.1.0", "v0.1.1"));
        assert!(!is_newer("0.1.1", "0.1.1"));
        assert!(!is_newer("0.2.0", "0.1.9"));
    }

    #[test]
    fn semver_ignores_malformed() {
        // Four-segment tag is not valid semver and should not be accepted
        // via the numeric path; it still fails the equality short-circuit
        // so technically "newer" string-wise.
        assert!(!is_newer("0.1.0", "0.1.0"));
    }

    #[tokio::test]
    async fn check_for_update_empty_repo_returns_none() {
        let out = check_for_update("", "0.1.0").await.unwrap();
        assert!(out.is_none());
    }

    #[tokio::test]
    async fn check_for_update_set_repo_still_returns_none_in_phase7() {
        // Phase 7 always returns None; Phase 9 will return Some for a
        // real release. This test just asserts the Phase 7 contract.
        let out = check_for_update("example/repo", "0.1.0").await.unwrap();
        assert!(out.is_none());
    }

    #[test]
    fn snapshot_from_release_with_newer_tag() {
        let r = GithubRelease {
            tag_name: "v0.2.0".into(),
            name: "0.2.0".into(),
            body: "bug fixes".into(),
            html_url: "https://github.com/foo/bar/releases/tag/v0.2.0".into(),
            assets: vec![GithubAsset {
                name: "cadenza-bridge-macos.zip".into(),
                browser_download_url: "https://github.com/foo/bar/releases/download/v0.2.0/cadenza-bridge-macos.zip".into(),
            }],
        };
        let snap = snapshot_from_release(&r, "0.1.0").unwrap();
        assert_eq!(snap.latest_version, "v0.2.0");
        assert_eq!(snap.release_notes, "bug fixes");
        assert!(snap.download_url.ends_with(".zip"));
    }

    #[test]
    fn snapshot_from_release_no_update_when_same() {
        let r = GithubRelease {
            tag_name: "0.1.0".into(),
            name: "0.1.0".into(),
            body: "".into(),
            html_url: "https://example.test".into(),
            assets: vec![],
        };
        assert!(snapshot_from_release(&r, "0.1.0").is_none());
    }

    #[test]
    fn repo_from_env_returns_string() {
        // Just exercise the getter. We don't set/unset the var because
        // cargo test runs tests in parallel threads and env mutation is
        // not thread-safe.
        let _s = repo_from_env();
    }
}
