import AppKit
import SwiftUI

class AppDelegate: NSObject, NSApplicationDelegate {
    private var statusItem: NSStatusItem?

    func applicationWillFinishLaunching(_ notification: Notification) {
        // Accessory policy: no Dock icon, no app switcher entry
        NSApp.setActivationPolicy(.accessory)
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        setupStatusItem()

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
            self?.stylePetWindows()
            self?.spawnPetBIfNeeded()
        }

        NotificationCenter.default.addObserver(
            forName: .seamanDualModeChanged, object: nil, queue: .main
        ) { [weak self] _ in
            self?.spawnPetBIfNeeded()
        }
    }

    private func stylePetWindows() {
        for window in NSApplication.shared.windows {
            guard window.title == "Seaman"
                || window.identifier?.rawValue.contains("pet") == true
                || window.identifier?.rawValue == "pet-b" else { continue }
            applyPetWindowStyle(window)
        }
    }

    private func applyPetWindowStyle(_ window: NSWindow) {
        window.backgroundColor = .clear
        window.isOpaque = false
        window.hasShadow = false
        window.level = .floating
        window.collectionBehavior = [.canJoinAllSpaces, .stationary]
        window.isMovableByWindowBackground = true
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        window.styleMask.insert(.borderless)
        window.standardWindowButton(.closeButton)?.isHidden = true
        window.standardWindowButton(.miniaturizeButton)?.isHidden = true
        window.standardWindowButton(.zoomButton)?.isHidden = true

        if let contentView = window.contentView {
            removeVisualEffectViews(from: contentView)
            contentView.wantsLayer = true
            contentView.layer?.backgroundColor = .clear
        }
        window.orderFrontRegardless()
    }

    private var petBWindow: NSWindow?

    private func spawnPetBIfNeeded() {
        let enabled = UserDefaults.standard.bool(forKey: "dualModeEnabled")
        if enabled {
            if petBWindow == nil {
                let host = NSHostingController(rootView: PetView(personaId: "b"))
                let win = BorderlessKeyWindow(
                    contentRect: NSRect(x: 0, y: 0, width: 300, height: 350),
                    styleMask: [.borderless],
                    backing: .buffered,
                    defer: false
                )
                win.contentViewController = host
                win.title = "Seaman B"
                win.identifier = NSUserInterfaceItemIdentifier("pet-b")
                win.isReleasedWhenClosed = false
                win.setFrameOrigin(clampedPetBOrigin(size: NSSize(width: 300, height: 350)))
                petBWindow = win
                applyPetWindowStyle(win)
                win.makeKeyAndOrderFront(nil)
            } else {
                petBWindow?.orderFrontRegardless()
            }
        } else {
            petBWindow?.orderOut(nil)
        }
    }

    /// Pick a sensible origin for Seaman B: 340 px to the right of Pet A,
    /// clamped within the visible frame of the main screen so B never spawns
    /// off-screen (e.g. when Pet A is flush with the right edge).
    private func clampedPetBOrigin(size: NSSize) -> NSPoint {
        let visible = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        var x: CGFloat
        var y: CGFloat
        if let primary = NSApplication.shared.windows.first(where: { $0.title == "Seaman" }) {
            x = primary.frame.origin.x + 340
            y = primary.frame.origin.y
        } else {
            x = visible.origin.x + visible.width / 2 + 20
            y = visible.origin.y + visible.height / 2 - size.height / 2
        }
        // Clamp so the window stays on-screen even when Pet A is near the right edge.
        x = min(max(x, visible.origin.x), visible.origin.x + visible.width - size.width)
        y = min(max(y, visible.origin.y), visible.origin.y + visible.height - size.height)
        return NSPoint(x: x, y: y)
    }

    private func setupStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let button = statusItem?.button {
            if let img = NSImage(systemSymbolName: "fish.fill", accessibilityDescription: "Seaman") {
                button.image = img
            } else {
                button.title = "🐟"
            }
        }

        let menu = NSMenu()
        menu.addItem(NSMenuItem(title: "設定...", action: #selector(openSettings), keyEquivalent: ","))
        menu.addItem(NSMenuItem(title: "🎤 歌わせる...", action: #selector(openSongWindow), keyEquivalent: "s"))
        menu.addItem(NSMenuItem(title: "🛠 セットアップ診断...", action: #selector(openSetupWindow), keyEquivalent: ""))
        menu.addItem(.separator())
        menu.addItem(NSMenuItem(title: "終了", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))
        statusItem?.menu = menu
    }

    private var settingsWindow: NSWindow?

    @objc private func openSettings() {
        if settingsWindow == nil {
            let host = NSHostingController(rootView: SettingsView())
            let win = NSWindow(contentViewController: host)
            win.title = "Seaman 設定"
            win.styleMask = [.titled, .closable, .miniaturizable, .resizable]
            win.setContentSize(NSSize(width: 480, height: 520))
            win.isReleasedWhenClosed = false
            win.center()
            settingsWindow = win
        }
        settingsWindow?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    private var setupWindow: NSWindow?

    @objc private func openSetupWindow() {
        if setupWindow == nil {
            let host = NSHostingController(rootView: SetupView())
            let win = NSWindow(contentViewController: host)
            win.title = "Seaman セットアップ"
            win.styleMask = [.titled, .closable, .miniaturizable, .resizable]
            win.setContentSize(NSSize(width: 640, height: 560))
            win.isReleasedWhenClosed = false
            win.center()
            setupWindow = win
        }
        setupWindow?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    private var songWindow: NSWindow?

    @objc private func openSongWindow() {
        if songWindow == nil {
            let host = NSHostingController(rootView: SongView())
            let win = NSWindow(contentViewController: host)
            win.title = "歌わせる"
            win.styleMask = [.titled, .closable, .miniaturizable, .resizable]
            win.setContentSize(NSSize(width: 560, height: 620))
            win.isReleasedWhenClosed = false
            win.center()
            songWindow = win
        }
        songWindow?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    private func removeVisualEffectViews(from view: NSView) {
        for subview in view.subviews {
            if subview is NSVisualEffectView {
                subview.isHidden = true
            }
            removeVisualEffectViews(from: subview)
        }
    }
}
