import SwiftUI

@main
struct SeamanApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    init() {
        UserDefaults.standard.register(defaults: [
            "topic": "シーマン風の皮肉で哲学的な雑談",
            "intervalMinutes": 5.0,
            "referenceAudioPath": "/Users/kuma/repos/kuma/kuma-lab/ai-sing/input/source/source_clip.wav",
            "faceImagePath": "/Users/kuma/repos/kuma/kuma-lab/ai-sing/input/source/face.png",
            "projectPath": "/Users/kuma/repos/kuma/kuma-lab/ai-sing",
            "dualModeEnabled": false,
            "topic_b": "聞き手役のシーマン。相手の発言に短く茶々を入れる",
            "intervalMinutes_b": 5.0,
            "referenceAudioPath_b": "/Users/kuma/repos/kuma/kuma-lab/ai-sing/input/source/source_clip.wav",
            "llmModel": "qwen3.5:122b",
            "ollamaURL": "http://localhost:11434/api/chat",
        ])
    }

    var body: some Scene {
        Window("Seaman", id: "pet") {
            PetView()
        }
        .windowStyle(.hiddenTitleBar)
        .defaultSize(width: 300, height: 350)
    }
}
