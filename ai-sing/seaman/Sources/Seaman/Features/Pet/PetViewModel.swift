import SwiftUI
import Combine

@MainActor
class PetViewModel: ObservableObject {
    @Published var currentSpeech: String?
    @Published var isSpeaking = false
    @Published var mouthOpen = false
    @Published var ttsWarmingUp = false

    /// Persona key — "a" by default, "b" when spawned for dual mode.
    /// All per-persona settings live under keys suffixed "_<id>" except for
    /// persona "a" which uses legacy unsuffixed keys for back-compat.
    let personaId: String

    private var timer: Timer?
    private var mouthTimer: Timer?
    private let brain = PetBrain()
    private let speechEngine = SpeechEngine()
    private let audioPlayer = PetAudioPlayer()
    private var recentHistory: [String] = []
    private var isGenerating = false
    private var observers: [NSObjectProtocol] = []

    init(personaId: String = "a") {
        self.personaId = personaId
    }

    // MARK: - Config accessors (persona-scoped with fallback)

    private func key(_ base: String) -> String {
        personaId == "a" ? base : "\(base)_\(personaId)"
    }

    private var topic: String {
        UserDefaults.standard.string(forKey: key("topic"))
            ?? (personaId == "a" ? "雑談" : "聞き手役のシーマン。相手の発言に短く茶々を入れる")
    }
    private var refAudio: String {
        UserDefaults.standard.string(forKey: key("referenceAudioPath")) ?? ""
    }
    private var intervalMinutes: Double {
        let raw = UserDefaults.standard.double(forKey: key("intervalMinutes"))
        return raw > 0 ? raw : 5.0
    }
    private var projectPath: String {
        UserDefaults.standard.string(forKey: "projectPath") ?? ""
    }

    // MARK: - Lifecycle

    func start() {
        observers.append(NotificationCenter.default.addObserver(
            forName: .seamanIntervalChanged, object: nil, queue: .main
        ) { [weak self] n in
            Task { @MainActor in
                // Only respond if change is for this persona (or global on legacy).
                if let changed = n.userInfo?["personaId"] as? String,
                   changed != self?.personaId { return }
                self?.scheduleNextSpeech()
            }
        })

        observers.append(NotificationCenter.default.addObserver(
            forName: .seamanSpeakNow, object: nil, queue: .main
        ) { [weak self] n in
            Task { @MainActor in
                if let target = n.userInfo?["personaId"] as? String,
                   target != self?.personaId { return }
                self?.speakNow()
            }
        })

        // Cross-pet: remember the other pet's last line in our history.
        observers.append(NotificationCenter.default.addObserver(
            forName: .seamanDidSpeak, object: nil, queue: .main
        ) { [weak self] n in
            Task { @MainActor in
                guard let self,
                      let speaker = n.userInfo?["personaId"] as? String,
                      speaker != self.personaId,
                      let text = n.userInfo?["text"] as? String else { return }
                self.recordOtherSpeech(text)
            }
        })

        Task {
            if !refAudio.isEmpty && !projectPath.isEmpty {
                SeamanLogger.log("[\(personaId)] Warming up TTS model...")
                withAnimation { ttsWarmingUp = true }
                await speechEngine.warmup(referenceAudio: refAudio, projectPath: projectPath)
                withAnimation { ttsWarmingUp = false }
            }
            scheduleNextSpeech()
            await speak()
        }
    }

    deinit {
        for o in observers { NotificationCenter.default.removeObserver(o) }
    }

    func poke() {
        guard !isGenerating else { return }
        Task {
            await generateAndSpeak(extra: "ユーザーに突かれた。不機嫌に反応して。")
        }
    }

    func speakNow() {
        guard !isGenerating else { return }
        Task { await speak() }
    }

    private func scheduleNextSpeech() {
        let seconds = max(intervalMinutes, 0.5) * 60
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: seconds, repeats: true) { [weak self] _ in
            Task { @MainActor in await self?.speak() }
        }
        SeamanLogger.log("[\(personaId)] Scheduled next speech in \(seconds)s")
    }

    private func recordOtherSpeech(_ text: String) {
        // Tag the other pet's lines so the LLM prompt can see the dialogue context.
        let tagged = "[相手]: \(text)"
        recentHistory.append(tagged)
        if recentHistory.count > 5 { recentHistory.removeFirst() }

        // If we're idle, schedule an earlier reaction (3–7s) so the pets feel conversational.
        guard !isGenerating else { return }
        let delay = Double.random(in: 3.0...7.0)
        Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(delay))
            guard let self, !self.isGenerating else { return }
            await self.speak()
        }
    }

    private func speak() async {
        await generateAndSpeak(extra: nil)
    }

    private func generateAndSpeak(extra: String?) async {
        guard !isGenerating else { return }
        isGenerating = true
        defer { isGenerating = false }

        let text = await brain.generateSpeech(topic: topic, history: recentHistory, extra: extra)
        guard !text.isEmpty else { return }

        recentHistory.append("[自分]: \(text)")
        if recentHistory.count > 5 { recentHistory.removeFirst() }

        isSpeaking = true
        SeamanLogger.log("[\(personaId)] TTS config: refAudio=\(refAudio), projectPath=\(projectPath)")

        if !refAudio.isEmpty && !projectPath.isEmpty {
            SeamanLogger.log("[\(personaId)] Starting TTS synthesis...")
            if let wavPath = await speechEngine.synthesize(text: text, referenceAudio: refAudio, projectPath: projectPath) {
                SeamanLogger.log("[\(personaId)] Playing audio: \(wavPath)")
                withAnimation { currentSpeech = text }
                startMouthFlap()
                await audioPlayer.play(path: wavPath)
                stopMouthFlap()
                SeamanLogger.log("[\(personaId)] Audio playback done")
            } else {
                SeamanLogger.log("[\(personaId)] TTS synthesis failed")
                withAnimation { currentSpeech = text }
            }
        } else {
            withAnimation { currentSpeech = text }
        }

        isSpeaking = false

        // Let the other pet know we spoke so they can follow up.
        NotificationCenter.default.post(
            name: .seamanDidSpeak,
            object: nil,
            userInfo: ["personaId": personaId, "text": text]
        )

        let capturedText = text
        Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(8))
            if self?.currentSpeech == capturedText {
                withAnimation { self?.currentSpeech = nil }
            }
        }
    }

    private func startMouthFlap() {
        mouthTimer?.invalidate()
        mouthTimer = Timer.scheduledTimer(withTimeInterval: 0.14, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self else { return }
                withAnimation(.easeInOut(duration: 0.08)) { self.mouthOpen.toggle() }
            }
        }
    }

    private func stopMouthFlap() {
        mouthTimer?.invalidate()
        mouthTimer = nil
        withAnimation(.easeOut(duration: 0.1)) { mouthOpen = false }
    }
}

extension Notification.Name {
    static let seamanIntervalChanged = Notification.Name("seamanIntervalChanged")
    static let seamanSpeakNow = Notification.Name("seamanSpeakNow")
    static let seamanDidSpeak = Notification.Name("seamanDidSpeak")
    static let seamanDualModeChanged = Notification.Name("seamanDualModeChanged")
}
