import AppKit
import SwiftUI

struct SeamanImageView: View {
    let mouthOpen: Bool

    var body: some View {
        if let closed = Self.loadImage(named: "seaman"),
           let open = Self.loadImage(named: "seaman_open") {
            Image(nsImage: mouthOpen ? open : closed)
                .resizable()
                .scaledToFit()
                .frame(width: 200, height: 200)
                .animation(.easeInOut(duration: 0.08), value: mouthOpen)
        } else {
            Text("🐟")
                .font(.system(size: 120))
        }
    }

    /// Resolve a Seaman PNG, preferring the .app bundle (release) and falling
    /// back to the repo checkout (dev / `swift run`). The previous implementation
    /// only consulted UserDefaults.projectPath, which is not configured when the
    /// built .app is launched standalone — that caused the 🐟 emoji fallback to
    /// render and the mouth-sync toggle to have no visible effect.
    private static func loadImage(named name: String) -> NSImage? {
        // 1. Release path: images ship with the .app via Package.swift resources.
        if let url = Bundle.main.url(forResource: name, withExtension: "png"),
           let img = NSImage(contentsOf: url) {
            return img
        }
        // 2. Dev path: `swift run` from the repo with projectPath set.
        if let projectPath = UserDefaults.standard.string(forKey: "projectPath"),
           !projectPath.isEmpty {
            let devPath = "\(projectPath)/seaman/Sources/Seaman/Resources/\(name).png"
            if let img = NSImage(contentsOfFile: devPath) {
                return img
            }
        }
        return nil
    }
}
