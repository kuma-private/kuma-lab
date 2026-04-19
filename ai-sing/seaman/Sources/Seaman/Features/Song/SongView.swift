import SwiftUI
import AppKit

struct SongView: View {
    @StateObject private var engine = SongEngine()
    @AppStorage("projectPath") private var projectPath = "/Users/kuma/repos/kuma/kuma-lab/ai-sing"
    @AppStorage("referenceAudioPath") private var referenceAudioPath = ""
    @AppStorage("songSourcePath") private var sourcePath = ""
    @AppStorage("songName") private var outName = "seaman_sing"
    @AppStorage("songSemiTone") private var semiTone = 0

    var body: some View {
        Form {
            Section("入力") {
                HStack {
                    TextField("歌ファイル (WAV)", text: $sourcePath)
                    Button("選択") { pickFile($sourcePath) }
                }
                HStack {
                    TextField("参考音声 (声質ターゲット)", text: $referenceAudioPath)
                    Button("選択") { pickFile($referenceAudioPath) }
                }
            }

            Section("パラメータ") {
                TextField("出力ファイル名（拡張子なし）", text: $outName)
                Stepper(value: $semiTone, in: -12...12) {
                    Text("半音シフト: \(semiTone)")
                }
            }

            Section("実行") {
                HStack {
                    Button(engine.isRunning ? "実行中..." : "歌わせる") { runSong() }
                        .disabled(engine.isRunning || sourcePath.isEmpty || referenceAudioPath.isEmpty || outName.isEmpty)
                    if engine.isRunning {
                        Button("キャンセル") { engine.cancel() }
                    }
                    Spacer()
                    if let step = engine.step {
                        Text(step.rawValue).foregroundColor(step == .failed ? .red : .secondary)
                    }
                }

                if let path = engine.outputPath {
                    HStack {
                        Text("出力: ").foregroundColor(.secondary)
                        Text(path).font(.caption).lineLimit(1).truncationMode(.middle)
                        Spacer()
                        Button("Finderで開く") {
                            NSWorkspace.shared.selectFile(path, inFileViewerRootedAtPath: "")
                        }
                        Button("再生") { play(path) }
                    }
                }
            }

            Section("ログ") {
                ScrollView {
                    VStack(alignment: .leading, spacing: 2) {
                        ForEach(engine.log.suffix(50).indices, id: \.self) { i in
                            Text(engine.log.suffix(50)[i])
                                .font(.system(size: 11, design: .monospaced))
                                .textSelection(.enabled)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .frame(minHeight: 140)
            }
        }
        .formStyle(.grouped)
        .frame(width: 560, height: 620)
        .padding()
    }

    private func runSong() {
        // Normalize source to relative path if under projectPath (make expects relative paths).
        let src: String
        if sourcePath.hasPrefix(projectPath + "/") {
            src = String(sourcePath.dropFirst(projectPath.count + 1))
        } else {
            src = sourcePath
        }
        let tgt: String
        if referenceAudioPath.hasPrefix(projectPath + "/") {
            tgt = String(referenceAudioPath.dropFirst(projectPath.count + 1))
        } else {
            tgt = referenceAudioPath
        }
        engine.run(projectPath: projectPath, source: src, target: tgt, name: outName, semiTone: semiTone)
    }

    private func pickFile(_ binding: Binding<String>) {
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowedContentTypes = [.audio, .wav]
        if panel.runModal() == .OK, let p = panel.url?.path {
            binding.wrappedValue = p
        }
    }

    private func play(_ path: String) {
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/usr/bin/afplay")
        p.arguments = [path]
        try? p.run()
    }
}
