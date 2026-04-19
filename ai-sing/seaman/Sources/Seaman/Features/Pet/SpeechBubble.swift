import SwiftUI

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
