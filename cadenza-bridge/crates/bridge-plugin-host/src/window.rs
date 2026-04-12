//! Plugin GUI fly-over window abstraction.
//!
//! Phase 7 ships a platform-neutral `PluginEditor` trait plus three
//! implementations:
//!
//! - `window_mac` — cocoa NSWindow (floating, non-activating)
//! - `window_win` — Win32 top-most tool window
//! - `PlaceholderEditor` — headless stub used on every platform until
//!   Phase 8 lands real CLAP/VST3 hosting. The headless stub is what we
//!   actually return today because `ClapInstrument::process` is silent —
//!   there is no real plugin view to embed yet. The stub records its
//!   visibility and position so unit tests and the tray flow can still
//!   exercise the chain.showEditor / chain.hideEditor plumbing end-to-end.

use anyhow::Result;

pub trait PluginEditor: Send {
    fn show(&mut self) -> Result<()>;
    fn hide(&mut self) -> Result<()>;
    fn set_position(&mut self, x: i32, y: i32) -> Result<()>;
    fn close(&mut self) -> Result<()>;
    fn is_visible(&self) -> bool;
    /// Plugin display name shown in the window title bar.
    fn title(&self) -> &str;
}

/// Headless placeholder editor. Tracks visibility state in memory only; does
/// not open a real window. Used on CI, in unit tests, and in Phase 7 where
/// plugin hosting is still stubbed. Phase 8 will replace this with
/// `window_mac::MacEditor` / `window_win::WinEditor` when the plugin actually
/// provides a view pointer.
pub struct PlaceholderEditor {
    title: String,
    visible: bool,
    x: i32,
    y: i32,
}

impl PlaceholderEditor {
    pub fn new(title: impl Into<String>) -> Self {
        Self {
            title: title.into(),
            visible: false,
            x: 0,
            y: 0,
        }
    }

    pub fn position(&self) -> (i32, i32) {
        (self.x, self.y)
    }
}

impl PluginEditor for PlaceholderEditor {
    fn show(&mut self) -> Result<()> {
        self.visible = true;
        tracing::debug!("PlaceholderEditor::show title={}", self.title);
        Ok(())
    }

    fn hide(&mut self) -> Result<()> {
        self.visible = false;
        tracing::debug!("PlaceholderEditor::hide title={}", self.title);
        Ok(())
    }

    fn set_position(&mut self, x: i32, y: i32) -> Result<()> {
        self.x = x;
        self.y = y;
        Ok(())
    }

    fn close(&mut self) -> Result<()> {
        self.visible = false;
        Ok(())
    }

    fn is_visible(&self) -> bool {
        self.visible
    }

    fn title(&self) -> &str {
        &self.title
    }
}

/// Factory helper: returns a boxed placeholder editor for the given plugin
/// display name. Phase 8 swaps this out for the real macOS / Windows
/// constructors that take the plugin's native view handle.
pub fn make_placeholder_editor(title: impl Into<String>) -> Box<dyn PluginEditor> {
    Box::new(PlaceholderEditor::new(title))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn placeholder_show_hide_cycles() {
        let mut ed = PlaceholderEditor::new("Gain");
        assert!(!ed.is_visible());
        ed.show().unwrap();
        assert!(ed.is_visible());
        ed.hide().unwrap();
        assert!(!ed.is_visible());
        ed.show().unwrap();
        ed.close().unwrap();
        assert!(!ed.is_visible());
    }

    #[test]
    fn placeholder_position_is_stored() {
        let mut ed = PlaceholderEditor::new("SVF");
        ed.set_position(120, 80).unwrap();
        assert_eq!(ed.position(), (120, 80));
    }

    #[test]
    fn factory_returns_named_editor() {
        let ed = make_placeholder_editor("Compressor");
        assert_eq!(ed.title(), "Compressor");
        assert!(!ed.is_visible());
    }
}
