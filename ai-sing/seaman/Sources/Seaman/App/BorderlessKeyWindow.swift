import AppKit

/// NSWindow subclass that allows borderless windows to accept key/main
/// status. Required for Seaman B's dual-mode pet window since the default
/// NSWindow returns canBecomeKey = false when styleMask contains .borderless,
/// which can leave the window invisible to AppKit's window list and
/// unresponsive to user interaction.
final class BorderlessKeyWindow: NSWindow {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }
}
