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
                // Speech / status bubble — warmup takes precedence so the
                // first 20s of model loading isn't silent.
                if pet.ttsWarmingUp {
                    SpeechBubble(text: "🐟 起動中…")
                        .transition(.opacity)
                        .padding(.bottom, 4)
                } else if let text = pet.currentSpeech {
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
