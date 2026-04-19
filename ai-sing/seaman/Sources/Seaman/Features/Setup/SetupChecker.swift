import Foundation

/// A single requirement Seaman needs to run end-to-end (LLM + TTS + Song).
struct SetupItem: Identifiable {
    enum Status {
        case ok
        case missing(String)      // short reason
        case unknown
    }
    let id: String
    let title: String
    let detail: String
    let status: Status
    /// Action hint the UI can show (commands the user can paste into Terminal).
    let fixHint: String?
}

/// Diagnoses whether the local environment has everything Seaman needs.
/// Phase 1 scaffold: reports status only. Phase 2 may run installers.
@MainActor
final class SetupChecker: ObservableObject {
    @Published var items: [SetupItem] = []
    @Published var isChecking = false

    func check(projectPath: String) {
        guard !isChecking else { return }
        isChecking = true
        Task.detached { [weak self] in
            let results = Self.runChecks(projectPath: projectPath)
            await MainActor.run { [weak self] in
                self?.items = results
                self?.isChecking = false
            }
        }
    }

    // MARK: - Individual checks

    internal nonisolated static func runChecks(projectPath: String) -> [SetupItem] {
        [
            checkProjectPath(projectPath),
            checkTTSVenv(projectPath),
            checkSeedVCVenv(projectPath),
            checkReferenceAudio(projectPath),
            checkFFmpeg(),
            checkOllama(),
        ]
    }

    internal nonisolated static func checkProjectPath(_ path: String) -> SetupItem {
        let fm = FileManager.default
        var isDir: ObjCBool = false
        let exists = fm.fileExists(atPath: path, isDirectory: &isDir) && isDir.boolValue
        let hasMakefile = fm.fileExists(atPath: "\(path)/Makefile")
        if exists && hasMakefile {
            return SetupItem(
                id: "project",
                title: "ai-sing プロジェクトパス",
                detail: path,
                status: .ok,
                fixHint: nil
            )
        }
        return SetupItem(
            id: "project",
            title: "ai-sing プロジェクトパス",
            detail: exists ? "Makefile が見つかりません: \(path)" : "パスが存在しません: \(path)",
            status: .missing("Makefile が無い、またはパス未設定"),
            fixHint: "設定画面で ai-sing リポジトリのルートを選択してください。"
        )
    }

    internal nonisolated static func checkTTSVenv(_ path: String) -> SetupItem {
        let python = "\(path)/.venv-tts/bin/python"
        if FileManager.default.isExecutableFile(atPath: python) {
            return SetupItem(
                id: "tts-venv",
                title: "TTS 仮想環境 (.venv-tts)",
                detail: python,
                status: .ok,
                fixHint: nil
            )
        }
        return SetupItem(
            id: "tts-venv",
                title: "TTS 仮想環境 (.venv-tts)",
            detail: "python が見つかりません: \(python)",
            status: .missing("未インストール"),
            fixHint: """
            cd \(path)
            uv venv .venv-tts --python 3.11
            source .venv-tts/bin/activate
            uv pip install -r requirements-tts.txt
            """
        )
    }

    internal nonisolated static func checkSeedVCVenv(_ path: String) -> SetupItem {
        let python = "\(path)/seed-vc/.venv/bin/python"
        if FileManager.default.isExecutableFile(atPath: python) {
            return SetupItem(
                id: "seedvc-venv",
                title: "Seed-VC 仮想環境 (seed-vc/.venv)",
                detail: python,
                status: .ok,
                fixHint: nil
            )
        }
        return SetupItem(
            id: "seedvc-venv",
            title: "Seed-VC 仮想環境 (seed-vc/.venv)",
            detail: "python が見つかりません: \(python)",
            status: .missing("未インストール"),
            fixHint: """
            cd \(path)/seed-vc
            uv venv .venv --python 3.11
            source .venv/bin/activate
            uv pip install -r requirements-mac.txt
            """
        )
    }

    internal nonisolated static func checkReferenceAudio(_ path: String) -> SetupItem {
        let ref = UserDefaults.standard.string(forKey: "referenceAudioPath") ?? ""
        let fm = FileManager.default
        if !ref.isEmpty, fm.fileExists(atPath: ref) {
            let size = (try? fm.attributesOfItem(atPath: ref)[.size] as? Int) ?? 0
            return SetupItem(
                id: "ref-audio",
                title: "参考音声 (WAV)",
                detail: "\(ref) (\(size / 1024) KB)",
                status: .ok,
                fixHint: nil
            )
        }
        return SetupItem(
            id: "ref-audio",
            title: "参考音声 (WAV)",
            detail: ref.isEmpty ? "未設定" : "ファイルが存在しません: \(ref)",
            status: .missing("未設定"),
            fixHint: "設定画面の「音声設定」から 5〜15 秒のクリアな WAV を選択してください。"
        )
    }

    internal nonisolated static func checkFFmpeg() -> SetupItem {
        for candidate in ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/usr/bin/ffmpeg"] {
            if FileManager.default.isExecutableFile(atPath: candidate) {
                return SetupItem(
                    id: "ffmpeg",
                    title: "ffmpeg",
                    detail: candidate,
                    status: .ok,
                    fixHint: nil
                )
            }
        }
        return SetupItem(
            id: "ffmpeg",
            title: "ffmpeg",
            detail: "見つかりません",
            status: .missing("未インストール"),
            fixHint: "brew install ffmpeg"
        )
    }

    internal nonisolated static func checkOllama() -> SetupItem {
        // Probe localhost:11434/api/tags synchronously with a short timeout.
        let url = URL(string: "http://127.0.0.1:11434/api/tags")!
        var req = URLRequest(url: url)
        req.timeoutInterval = 1.5

        let sem = DispatchSemaphore(value: 0)
        var resultOK = false
        var bodySnippet = ""
        let task = URLSession.shared.dataTask(with: req) { data, resp, _ in
            defer { sem.signal() }
            guard let http = resp as? HTTPURLResponse, http.statusCode == 200 else { return }
            resultOK = true
            if let d = data, let s = String(data: d, encoding: .utf8) {
                bodySnippet = String(s.prefix(120))
            }
        }
        task.resume()
        _ = sem.wait(timeout: .now() + 2)
        task.cancel()

        if resultOK {
            return SetupItem(
                id: "ollama",
                title: "Ollama (LLM)",
                detail: "http://127.0.0.1:11434 応答あり",
                status: .ok,
                fixHint: bodySnippet.isEmpty ? nil : "models: \(bodySnippet)"
            )
        }
        return SetupItem(
            id: "ollama",
            title: "Ollama (LLM)",
            detail: "http://127.0.0.1:11434 に接続できません",
            status: .missing("Ollama 未起動"),
            fixHint: """
            brew install ollama
            ollama serve &
            ollama pull qwen2.5:7b
            """
        )
    }
}
