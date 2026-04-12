use anyhow::{Context, Result};
use tao::event::Event;
use tao::event_loop::{ControlFlow, EventLoopBuilder};
use tray_icon::menu::{Menu, MenuEvent, MenuItem};
use tray_icon::{Icon, TrayIconBuilder};
use tracing::info;

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

pub fn run_tray_event_loop() -> Result<()> {
    set_accessory_activation_policy();

    let event_loop = EventLoopBuilder::new().build();

    let menu = Menu::new();
    let quit_item = MenuItem::new("Quit Cadenza Bridge", true, None);
    menu.append(&quit_item).context("append quit item")?;

    let _tray = TrayIconBuilder::new()
        .with_menu(Box::new(menu))
        .with_tooltip("Cadenza Bridge")
        .with_icon(build_icon())
        .build()
        .context("build tray icon")?;

    let menu_channel = MenuEvent::receiver();
    let quit_id = quit_item.id().clone();

    info!("tray event loop running");

    event_loop.run(move |_event, _target, control_flow| {
        *control_flow = ControlFlow::Wait;

        if let Ok(event) = menu_channel.try_recv() {
            if event.id == quit_id {
                info!("quit selected from tray menu");
                std::process::exit(0);
            }
        }

        if let Event::LoopDestroyed = _event {
            // nothing
        }
    });
}
