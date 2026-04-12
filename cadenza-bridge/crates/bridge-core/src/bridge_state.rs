//! Shared read/write state that multiple subsystems (tray, ws server,
//! updater poll loop, autostart UI) need to observe at once.
//!
//! Kept deliberately small: everything in here is Arc<RwLock<T>> so a
//! stale read is fine and writers don't block each other for long. The
//! Session keeps its own `Arc<Mutex<Project>>` separately; `BridgeState`
//! is only the cross-subsystem glue.

use std::sync::{Arc, RwLock};

use bridge_protocol::UpdateInfoSnapshot;

#[derive(Clone)]
pub struct BridgeState {
    inner: Arc<RwLock<Inner>>,
}

#[derive(Default)]
struct Inner {
    update_available: Option<UpdateInfoSnapshot>,
    plugin_count: u32,
    status: Status,
    autostart_enabled: bool,
}

#[derive(Default, Clone, Copy, Debug, PartialEq, Eq)]
pub enum Status {
    #[default]
    Starting,
    Listening,
    Error,
}

impl BridgeState {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(RwLock::new(Inner::default())),
        }
    }

    pub fn snapshot(&self) -> StateSnapshot {
        let g = self.inner.read().expect("bridge state poisoned");
        StateSnapshot {
            update_available: g.update_available.clone(),
            plugin_count: g.plugin_count,
            status: g.status,
            autostart_enabled: g.autostart_enabled,
        }
    }

    pub fn update_info(&self) -> Option<UpdateInfoSnapshot> {
        self.inner
            .read()
            .expect("bridge state poisoned")
            .update_available
            .clone()
    }

    pub fn set_update_info(&self, info: Option<UpdateInfoSnapshot>) {
        self.inner
            .write()
            .expect("bridge state poisoned")
            .update_available = info;
    }

    pub fn set_plugin_count(&self, n: u32) {
        self.inner
            .write()
            .expect("bridge state poisoned")
            .plugin_count = n;
    }

    pub fn plugin_count(&self) -> u32 {
        self.inner
            .read()
            .expect("bridge state poisoned")
            .plugin_count
    }

    pub fn set_status(&self, s: Status) {
        self.inner.write().expect("bridge state poisoned").status = s;
    }

    pub fn status(&self) -> Status {
        self.inner.read().expect("bridge state poisoned").status
    }

    pub fn set_autostart_enabled(&self, enabled: bool) {
        self.inner
            .write()
            .expect("bridge state poisoned")
            .autostart_enabled = enabled;
    }

    pub fn autostart_enabled(&self) -> bool {
        self.inner
            .read()
            .expect("bridge state poisoned")
            .autostart_enabled
    }
}

impl Default for BridgeState {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone)]
pub struct StateSnapshot {
    pub update_available: Option<UpdateInfoSnapshot>,
    pub plugin_count: u32,
    pub status: Status,
    pub autostart_enabled: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn set_and_get_update_info() {
        let s = BridgeState::new();
        assert!(s.update_info().is_none());
        let info = UpdateInfoSnapshot {
            current_version: "0.1.0".into(),
            latest_version: "0.2.0".into(),
            release_url: "https://example.test".into(),
            release_notes: "notes".into(),
            download_url: "https://example.test/d.zip".into(),
        };
        s.set_update_info(Some(info.clone()));
        assert_eq!(s.update_info().unwrap().latest_version, "0.2.0");
        s.set_update_info(None);
        assert!(s.update_info().is_none());
    }

    #[test]
    fn set_and_get_counts_and_status() {
        let s = BridgeState::new();
        assert_eq!(s.plugin_count(), 0);
        assert_eq!(s.status(), Status::Starting);
        s.set_plugin_count(12);
        s.set_status(Status::Listening);
        s.set_autostart_enabled(true);
        let snap = s.snapshot();
        assert_eq!(snap.plugin_count, 12);
        assert_eq!(snap.status, Status::Listening);
        assert!(snap.autostart_enabled);
    }
}
