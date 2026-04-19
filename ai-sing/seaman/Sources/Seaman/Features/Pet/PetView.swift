import SwiftUI

struct PetView: View {
    @StateObject private var pet: PetViewModel

    init(personaId: String = "a") {
        _pet = StateObject(wrappedValue: PetViewModel(personaId: personaId))
    }

    var body: some View {
        ZStack {
            Color.clear

            VStack(spacing: 0) {
                // Speech bubble
                if let text = pet.currentSpeech {
                    SpeechBubble(text: text)
                        .transition(.opacity.combined(with: .move(edge: .bottom)))
                        .padding(.bottom, 4)
                }

                // Seaman composite image
                SeamanImageView(mouthOpen: pet.mouthOpen)
                    .frame(width: 200, height: 200)
                    .onTapGesture {
                        pet.poke()
                    }
            }
            .padding()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.clear)
        .onAppear {
            pet.start()
        }
    }
}

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

struct SpeechBubble: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.system(size: 13))
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(.white)
                    .shadow(color: .black.opacity(0.15), radius: 4, y: 2)
            )
            .foregroundColor(.black)
            .frame(maxWidth: 250)
            .multilineTextAlignment(.center)
    }
}
