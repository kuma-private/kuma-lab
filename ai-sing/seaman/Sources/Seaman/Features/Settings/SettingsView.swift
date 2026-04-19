import SwiftUI

private struct TopicPreset: Identifiable, Hashable {
    let id: String
    let label: String
    let prompt: String
}

private let topicPresets: [TopicPreset] = [
    .init(id: "sarcastic",  label: "皮肉シーマン（標準）",   prompt: "シーマン風の皮肉で哲学的な雑談"),
    .init(id: "gentle",     label: "優しいシーマン",        prompt: "穏やかで労いの言葉をかけてくるシーマン。ユーザーの健康や休息を気遣う"),
    .init(id: "scholar",    label: "博識シーマン",          prompt: "雑学や歴史、科学の豆知識を断片的に語るシーマン。皮肉は控えめ"),
    .init(id: "motivator",  label: "煽りコーチ",            prompt: "厳しめに発破をかけてくるシーマン。ただし最後は必ず前向きな一言で締める"),
    .init(id: "listener",   label: "聞き手役",              prompt: "聞き手役のシーマン。相手の発言に短く茶々を入れる"),
    .init(id: "custom",     label: "カスタム",              prompt: ""),
]

struct SettingsView: View {
    @AppStorage("topic") private var topic = "シーマン風の皮肉で哲学的な雑談"
    @AppStorage("topicPresetId") private var topicPresetId = "sarcastic"
    @AppStorage("intervalMinutes") private var intervalMinutes = 5.0
    @AppStorage("faceImagePath") private var faceImagePath = ""
    @AppStorage("referenceAudioPath") private var referenceAudioPath = "/Users/kuma/repos/kuma/kuma-lab/ai-sing/input/source/source_clip.wav"
    @AppStorage("projectPath") private var projectPath = "/Users/kuma/repos/kuma/kuma-lab/ai-sing"

    // Dual-mode: persona B
    @AppStorage("dualModeEnabled") private var dualModeEnabled = false
    @AppStorage("topic_b") private var topicB = "聞き手役のシーマン。相手の発言に短く茶々を入れる"
    @AppStorage("topicPresetId_b") private var topicPresetIdB = "listener"
    @AppStorage("intervalMinutes_b") private var intervalB = 5.0
    @AppStorage("referenceAudioPath_b") private var refAudioB = ""

    // LLM (共通)
    @AppStorage("llmModel") private var llmModel = "qwen3.5:122b"
    @AppStorage("ollamaURL") private var ollamaURL = "http://localhost:11434/api/chat"

    var body: some View {
        TabView {
            mainPane
                .tabItem { Label("Seaman A", systemImage: "fish.fill") }
            petBPane
                .tabItem { Label("Seaman B", systemImage: "fish") }
        }
        .frame(width: 520, height: 580)
        .padding()
    }

    private var mainPane: some View {
        Form {
            personaSection(
                title: "キャラクター設定",
                presetId: $topicPresetId,
                topic: $topic
            )

            Section("動作設定") {
                HStack {
                    Slider(value: $intervalMinutes, in: 0.5...30, step: 0.5)
                    Stepper(value: $intervalMinutes, in: 0.5...30, step: 0.5) {
                        Text(formatInterval(intervalMinutes))
                            .monospacedDigit()
                            .frame(minWidth: 80, alignment: .trailing)
                    }
                }
                .onChange(of: intervalMinutes) { _, _ in
                    NotificationCenter.default.post(
                        name: .seamanIntervalChanged, object: nil,
                        userInfo: ["personaId": "a"]
                    )
                }

                HStack {
                    Button("今すぐ喋らせる") {
                        NotificationCenter.default.post(
                            name: .seamanSpeakNow, object: nil,
                            userInfo: ["personaId": "a"]
                        )
                    }
                    Spacer()
                }
            }

            Section("音声設定") {
                HStack {
                    TextField("参考音声 (WAV)", text: $referenceAudioPath)
                    Button("選択") { pickFile(for: $referenceAudioPath) }
                }
                HStack {
                    TextField("顔画像（未使用）", text: $faceImagePath)
                    Button("選択") { pickFile(for: $faceImagePath) }
                }
            }

            Section("パス") {
                HStack {
                    TextField("ai-sing プロジェクトパス", text: $projectPath)
                    Button("選択") { pickFolder(for: $projectPath) }
                }
            }

            Section("LLM (Ollama)") {
                TextField("モデル名", text: $llmModel)
                TextField("Ollama API URL", text: $ollamaURL)
                Text("例: qwen3.5:122b / gpt-oss:20b / llama3.1:8b。`ollama list` で利用可能なモデルを確認できます。")
                    .font(.caption).foregroundColor(.secondary)
            }
        }
        .formStyle(.grouped)
    }

    private var petBPane: some View {
        Form {
            Section {
                Toggle("2体モードを有効化", isOn: $dualModeEnabled)
                    .onChange(of: dualModeEnabled) { _, _ in
                        NotificationCenter.default.post(name: .seamanDualModeChanged, object: nil)
                    }
                Text("有効にすると 2 匹目のシーマンが画面右側に現れ、A の発言に応答する会話モードになります。")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            personaSection(
                title: "キャラクター設定",
                presetId: $topicPresetIdB,
                topic: $topicB
            )
            .disabled(!dualModeEnabled)

            Section("動作設定") {
                HStack {
                    Slider(value: $intervalB, in: 0.5...30, step: 0.5)
                    Stepper(value: $intervalB, in: 0.5...30, step: 0.5) {
                        Text(formatInterval(intervalB))
                            .monospacedDigit()
                            .frame(minWidth: 80, alignment: .trailing)
                    }
                }
                .onChange(of: intervalB) { _, _ in
                    NotificationCenter.default.post(
                        name: .seamanIntervalChanged, object: nil,
                        userInfo: ["personaId": "b"]
                    )
                }

                Button("今すぐ喋らせる") {
                    NotificationCenter.default.post(
                        name: .seamanSpeakNow, object: nil,
                        userInfo: ["personaId": "b"]
                    )
                }
            }
            .disabled(!dualModeEnabled)

            Section("音声設定") {
                HStack {
                    TextField("参考音声 B (WAV)", text: $refAudioB)
                    Button("選択") { pickFile(for: $refAudioB) }
                }
                Text("空なら A と同じ参考音声を使います。別の WAV を指定すると B は別の声で喋ります。")
                    .font(.caption).foregroundColor(.secondary)
            }
            .disabled(!dualModeEnabled)
        }
        .formStyle(.grouped)
    }

    // MARK: - Shared persona section

    @ViewBuilder
    private func personaSection(title: String, presetId: Binding<String>, topic: Binding<String>) -> some View {
        Section(title) {
            Picker("プリセット", selection: presetId) {
                ForEach(topicPresets) { preset in
                    Text(preset.label).tag(preset.id)
                }
            }
            .onChange(of: presetId.wrappedValue) { _, newValue in
                if let preset = topicPresets.first(where: { $0.id == newValue }), !preset.prompt.isEmpty {
                    topic.wrappedValue = preset.prompt
                }
            }

            TextField("トピック / 性格", text: topic, axis: .vertical)
                .lineLimit(3...6)
                .onChange(of: topic.wrappedValue) { _, newValue in
                    if !topicPresets.contains(where: { $0.prompt == newValue }) {
                        presetId.wrappedValue = "custom"
                    }
                }
        }
    }

    private func formatInterval(_ v: Double) -> String {
        if v < 1 { return "\(Int(v * 60))秒" }
        return v.truncatingRemainder(dividingBy: 1) == 0
            ? "\(Int(v))分"
            : String(format: "%.1f分", v)
    }

    private func pickFile(for binding: Binding<String>) {
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        if panel.runModal() == .OK {
            binding.wrappedValue = panel.url?.path ?? ""
        }
    }

    private func pickFolder(for binding: Binding<String>) {
        let panel = NSOpenPanel()
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        if panel.runModal() == .OK {
            binding.wrappedValue = panel.url?.path ?? ""
        }
    }
}
