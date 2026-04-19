import Foundation

actor SpeechEngine {
    private var process: Process?
    private var stdinPipe: Pipe?
    private var outputDir: String = ""

    private var modelLoaded = false
    private var modelWaiters: [CheckedContinuation<Void, Never>] = []
    private var synthWaiters: [String: CheckedContinuation<String?, Never>] = [:]
    private var stdoutBuffer = ""

    func warmup(referenceAudio: String, projectPath: String) async {
        guard process == nil else { return }
        outputDir = "\(projectPath)/output/speak"
        launchProcess(referenceAudio: referenceAudio, projectPath: projectPath)
        await waitForModel()
        SeamanLogger.log("SpeechEngine: model ready")
    }

    func synthesize(text: String, referenceAudio: String, projectPath: String) async -> String? {
        if process == nil || process?.isRunning == false {
            outputDir = "\(projectPath)/output/speak"
            launchProcess(referenceAudio: referenceAudio, projectPath: projectPath)
        }
        await waitForModel()

        guard let stdin = stdinPipe else { return nil }
        try? FileManager.default.createDirectory(atPath: outputDir, withIntermediateDirectories: true)

        let name = "seaman_\(Int(Date().timeIntervalSince1970))"
        let cmd = "\(name).wav \(text)\n"
        guard let data = cmd.data(using: .utf8) else { return nil }

        return await withCheckedContinuation { (cont: CheckedContinuation<String?, Never>) in
            synthWaiters[name] = cont
            stdin.fileHandleForWriting.write(data)
            SeamanLogger.log("SpeechEngine: sent '\(name)'")

            // Safety timeout: 2 minutes
            Task {
                try? await Task.sleep(for: .seconds(120))
                if synthWaiters.removeValue(forKey: name) != nil {
                    SeamanLogger.log("SpeechEngine: synthesis timeout '\(name)'")
                    cont.resume(returning: nil)
                }
            }
        }
    }

    private func waitForModel() async {
        guard !modelLoaded else { return }
        await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
            modelWaiters.append(cont)
        }
    }

    private func ingestStdout(_ chunk: String) {
        stdoutBuffer += chunk
        while let idx = stdoutBuffer.firstIndex(of: "\n") {
            let line = String(stdoutBuffer[..<idx])
            stdoutBuffer = String(stdoutBuffer[stdoutBuffer.index(after: idx)...])
            if !line.isEmpty { SeamanLogger.log("speak.py: \(line)") }
            handleStdoutLine(line)
        }
    }

    private func handleStdoutLine(_ line: String) {
        if !modelLoaded && line.contains("Model loaded") {
            modelLoaded = true
            let waiters = modelWaiters
            modelWaiters.removeAll()
            for w in waiters { w.resume() }
            return
        }
        // Synthesis completion: "=> /path/seaman_XXX.wav (1.2s)"
        if line.hasPrefix("=>") {
            for key in synthWaiters.keys where line.contains("\(key).wav") {
                let cont = synthWaiters.removeValue(forKey: key)
                cont?.resume(returning: "\(outputDir)/\(key).wav")
                return
            }
        }
    }

    private func launchProcess(referenceAudio: String, projectPath: String) {
        let venvPython = "\(projectPath)/.venv-tts/bin/python"
        let scriptPath = "\(projectPath)/cli/speak.py"

        let p = Process()
        p.executableURL = URL(fileURLWithPath: venvPython)
        let refTextCache = "\(projectPath)/tmp/ref_text.txt"
        p.arguments = ["-u", scriptPath, "--interactive",
                       "--target", referenceAudio, "--output-dir", outputDir,
                       "--ref-text-cache", refTextCache]

        let stdinPipe = Pipe()
        let stdoutPipe = Pipe()
        let stderrPipe = Pipe()
        p.standardInput = stdinPipe
        p.standardOutput = stdoutPipe
        p.standardError = stderrPipe

        do { try p.run() } catch {
            SeamanLogger.log("SpeechEngine: launch failed: \(error)")
            return
        }
        process = p
        self.stdinPipe = stdinPipe

        // Capture stderr for visibility
        stderrPipe.fileHandleForReading.readabilityHandler = { handle in
            let data = handle.availableData
            guard !data.isEmpty, let str = String(data: data, encoding: .utf8) else { return }
            let trimmed = str.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty { SeamanLogger.log("speak.py stderr: \(trimmed)") }
        }

        // Monitor stdout continuously: detects "Model loaded" and "=> name.wav" signals.
        // Line accumulation lives on the actor (stdoutBuffer) so the handler closure
        // stays Sendable under the Swift 6 concurrency model.
        stdoutPipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            guard let self else { return }
            let data = handle.availableData
            guard !data.isEmpty, let str = String(data: data, encoding: .utf8) else { return }
            Task { await self.ingestStdout(str) }
        }
    }
}
