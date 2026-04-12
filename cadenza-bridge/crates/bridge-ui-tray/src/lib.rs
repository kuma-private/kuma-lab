use std::sync::Arc;

use anyhow::{Context, Result};
use bridge_core::autostart;
use bridge_core::bridge_state::{BridgeState, Status, StateSnapshot};
use tao::event::Event;
use tao::event_loop::{ControlFlow, EventLoopBuilder};
use tray_icon::menu::{CheckMenuItem, Menu, MenuEvent, MenuId, MenuItem, PredefinedMenuItem};
use tray_icon::{Icon, TrayIconBuilder};
use tracing::{info, warn};

#[cfg(target_os = "macos")]
pub fn set_accessory_activation_policy() {
    use objc2::runtime::AnyClass;
    use objc2::{msg_send, ClassType};
    use objc2_app_kit::{NSApplication, NSApplicationActivationPolicy};

    unsafe {
        let cls: &AnyClass = NSApplication::class();
        let app: *mut NSApplication = msg_send![cls, sharedApplication];
        if !app.is_null() {
            let _: () = msg_send![app, setActivationPolicy: NSApplicationActivationPolicy::Accessory];
        }
    }
}

#[cfg(not(target_os = "macos"))]
pub fn set_accessory_activation_policy() {}

fn build_icon() -> Icon {
    const W: u32 = 16;
    const H: u32 = 16;
    let mut rgba = Vec::with_capacity((W * H * 4) as usize);
    for y in 0..H {
        for x in 0..W {
            let on_edge = x == 0 || y == 0 || x == W - 1 || y == H - 1;
            let (r, g, b, a) = if on_edge {
                (255, 255, 255, 255)
            } else {
                (32, 144, 220, 255)
            };
            rgba.extend_from_slice(&[r, g, b, a]);
        }
    }
    Icon::from_rgba(rgba, W, H).expect("valid rgba icon")
}

/// Render the top status line for the menu. Exposed as a pure function so
/// unit tests can pin the wording.
pub fn status_line(snap: &StateSnapshot) -> String {
    match snap.status {
        Status::Starting => "Cadenza Bridge — Starting…".to_string(),
        Status::Listening => "Cadenza Bridge — Connected".to_string(),
        Status::Error => "Cadenza Bridge — Error".to_string(),
    }
}

/// Render the plugin count line.
pub fn plugin_count_line(snap: &StateSnapshot) -> String {
    format!("Plugins: {} found", snap.plugin_count)
}

/// Host-side glue the tray can invoke on menu clicks. Implemented by
/// `bridge-core` (or tests); the tray itself is platform-only.
pub trait TrayActions: Send + Sync {
    fn watchdog_exe(&self) -> std::path::PathBuf;
    fn on_check_for_update(&self);
}

/// Default implementation that resolves the watchdog as a sibling binary
/// of the current executable. Matches the logic in
/// `bridge-core::session::watchdog_target_exe` but is repeated here so the
/// tray can construct it without depending on session internals.
pub struct DefaultTrayActions;

impl TrayActions for DefaultTrayActions {
    fn watchdog_exe(&self) -> std::path::PathBuf {
        let exe = std::env::current_exe().unwrap_or_default();
        let parent = exe.parent().map(|p| p.to_path_buf()).unwrap_or_default();
        let name = if cfg!(target_os = "windows") {
            "cadenza-watchdog.exe"
        } else {
            "cadenza-watchdog"
        };
        parent.join(name)
    }

    fn on_check_for_update(&self) {
        info!("tray: user clicked 'Check for update'");
        // Actual network call lives in the WS server's tokio context;
        // the tray just logs the request. Phase 9 wiring can route
        // this through an mpsc into a shared state struct.
    }
}

fn autostart_target_from(actions: &dyn TrayActions) -> Result<autostart::Target> {
    autostart::Target::default_for(actions.watchdog_exe())
}

pub fn run_tray_event_loop() -> Result<()> {
    run_tray_event_loop_with(BridgeState::new(), Arc::new(DefaultTrayActions))
}

/// Full entry point: construct the tray icon and pump its event loop
/// until the user picks Quit. `state` is read by the menu refresh and
/// `actions` handles the imperative side-effects.
pub fn run_tray_event_loop_with(
    state: BridgeState,
    actions: Arc<dyn TrayActions>,
) -> Result<()> {
    set_accessory_activation_policy();

    let event_loop = EventLoopBuilder::new().build();

    let snap = state.snapshot();
    let menu = Menu::new();

    let status_item = MenuItem::new(status_line(&snap), false, None);
    menu.append(&status_item).context("append status item")?;

    let plugins_item = MenuItem::new(plugin_count_line(&snap), false, None);
    menu.append(&plugins_item).context("append plugins item")?;

    menu.append(&PredefinedMenuItem::separator())
        .context("append sep")?;

    // Figure out current autostart value from disk so the checkmark is
    // correct on first open.
    let autostart_on = autostart_target_from(actions.as_ref())
        .ok()
        .map(|t| autostart::is_autostart_enabled(&t))
        .unwrap_or(false);
    state.set_autostart_enabled(autostart_on);
    let autostart_item = CheckMenuItem::new("Open at login", true, autostart_on, None);
    menu.append(&autostart_item).context("append autostart")?;

    let update_item = MenuItem::new("Check for update", true, None);
    menu.append(&update_item).context("append update")?;

    menu.append(&PredefinedMenuItem::separator())
        .context("append sep2")?;

    let quit_item = MenuItem::new("Quit Cadenza Bridge", true, None);
    menu.append(&quit_item).context("append quit item")?;

    let _tray = TrayIconBuilder::new()
        .with_menu(Box::new(menu))
        .with_tooltip("Cadenza Bridge")
        .with_icon(build_icon())
        .build()
        .context("build tray icon")?;

    let menu_channel = MenuEvent::receiver();
    let quit_id: MenuId = quit_item.id().clone();
    let autostart_id: MenuId = autostart_item.id().clone();
    let update_id: MenuId = update_item.id().clone();
    let actions_evt = actions.clone();
    let state_evt = state.clone();

    info!("tray event loop running");

    event_loop.run(move |_event, _target, control_flow| {
        *control_flow = ControlFlow::Wait;

        if let Ok(event) = menu_channel.try_recv() {
            if event.id == quit_id {
                info!("quit selected from tray menu");
                std::process::exit(0);
            } else if event.id == autostart_id {
                let currently_on = state_evt.autostart_enabled();
                let desired = !currently_on;
                match autostart_target_from(actions_evt.as_ref()) {
                    Ok(target) => {
                        let result = if desired {
                            autostart::enable_autostart(&target)
                        } else {
                            autostart::disable_autostart(&target)
                        };
                        match result {
                            Ok(()) => {
                                state_evt.set_autostart_enabled(desired);
                                autostart_item.set_checked(desired);
                                info!(
                                    "tray: autostart {}",
                                    if desired { "enabled" } else { "disabled" }
                                );
                            }
                            Err(e) => warn!("tray: autostart toggle failed: {e:#}"),
                        }
                    }
                    Err(e) => warn!("tray: cannot resolve autostart target: {e:#}"),
                }
            } else if event.id == update_id {
                actions_evt.on_check_for_update();
            }
        }

        if let Event::LoopDestroyed = _event {
            // nothing
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use bridge_core::bridge_state::{BridgeState, Status};

    #[test]
    fn status_line_reflects_state() {
        let s = BridgeState::new();
        assert!(status_line(&s.snapshot()).contains("Starting"));
        s.set_status(Status::Listening);
        assert!(status_line(&s.snapshot()).contains("Connected"));
        s.set_status(Status::Error);
        assert!(status_line(&s.snapshot()).contains("Error"));
    }

    #[test]
    fn plugin_count_line_formats_number() {
        let s = BridgeState::new();
        assert_eq!(plugin_count_line(&s.snapshot()), "Plugins: 0 found");
        s.set_plugin_count(12);
        assert_eq!(plugin_count_line(&s.snapshot()), "Plugins: 12 found");
    }

    #[test]
    fn default_tray_actions_exposes_watchdog_name() {
        let actions = DefaultTrayActions;
        let path = actions.watchdog_exe();
        let file = path.file_name().unwrap().to_string_lossy().into_owned();
        if cfg!(target_os = "windows") {
            assert!(file.ends_with("cadenza-watchdog.exe"));
        } else {
            assert!(file.ends_with("cadenza-watchdog"));
        }
    }
}
