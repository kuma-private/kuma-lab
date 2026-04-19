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
