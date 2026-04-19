import SwiftUI

struct SeamanImageView: View {
    let mouthOpen: Bool

    var body: some View {
        let projectPath = UserDefaults.standard.string(forKey: "projectPath") ?? ""
        let basePath = "\(projectPath)/seaman/Sources/Seaman/Resources"
        let closedPath = "\(basePath)/seaman.png"
        let openPath = "\(basePath)/seaman_open.png"

        if !projectPath.isEmpty,
           let closed = NSImage(contentsOfFile: closedPath),
           let open = NSImage(contentsOfFile: openPath) {
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
}
