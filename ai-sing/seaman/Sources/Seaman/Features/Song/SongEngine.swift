import Foundation

enum SongStep: String {
    case separating = "ボーカル分離中..."
    case converting = "声質変換中..."
    case mixing     = "ミックス中..."
    case done       = "完了"
    case failed     = "失敗"
}

/// Runs the 3-stage sing pipeline (Demucs → Seed-VC → ffmpeg mix) by
/// directly spawning each tool. No `make` dependency required.
@MainActor
final class SongEngine: ObservableObject {
    @Published var step: SongStep?
    @Published var log: [String] = []
    @Published var outputPath: String?
    @Published var isRunning = false

    private var currentProcess: Process?
    private var cancelled = false

    // MARK: - Public API

    func run(projectPath: String,
             source: String,            // input/song/... wav (relative to projectPath, or absolute)
             target: String,            // reference voice wav (relative, or absolute)
             name: String,
             semiTone: Int) {
        guard !isRunning else { return }
        isRunning = true
        cancelled = false
        step = .separating
        log = []
        outputPath = nil

        let srcAbs = absolutePath(source, relativeTo: projectPath)
        let tgtAbs = absolutePath(target, relativeTo: projectPath)
        let songBase = (srcAbs as NSString).lastPathComponent
            .replacingOccurrences(of: ".wav", with: "")

        Task { [weak self] in
            guard let self else { return }
            do {
                try await self.stepSeparate(projectPath: projectPath, source: srcAbs)
                if self.cancelled { throw CancellationError() }

                try await self.stepConvert(projectPath: projectPath,
                                           songBase: songBase,
                                           target: tgtAbs,
                                           semiTone: semiTone)
                if self.cancelled { throw CancellationError() }

                let outPath = try await self.stepMix(projectPath: projectPath,
                                                     songBase: songBase,
                                                     name: name)
                await MainActor.run {
                    self.step = .done
                    self.outputPath = outPath
                    self.isRunning = false
                }
            } catch {
                await MainActor.run {
                    if !(error is CancellationError) {
                        self.log.append("[error] \(error.localizedDescription)")
                    }
                    self.step = .failed
                    self.isRunning = false
                }
            }
        }
    }

    func cancel() {
        cancelled = true
        currentProcess?.terminate()
    }

    // MARK: - Pipeline steps

    private func stepSeparate(projectPath: String, source: String) async throws {
        await MainActor.run {
            self.step = .separating
            self.log.append("========== [1/3] ボーカル分離 (Demucs) ==========")
        }
        let python = "\(projectPath)/seed-vc/.venv/bin/python"
        try FileManager.default.createDirectory(
            atPath: "\(projectPath)/tmp/separated",
            withIntermediateDirectories: true
        )
        try await runProcess(
            executable: python,
            args: ["-m", "demucs", "--two-stems=vocals", "-o", "tmp/separated", source],
            cwd: projectPath
        )
    }

    private func stepConvert(projectPath: String,
                             songBase: String,
                             target: String,
                             semiTone: Int) async throws {
        await MainActor.run {
            self.step = .converting
            self.log.append("========== [2/3] 歌声変換 (Seed-VC) ==========")
        }
        let python = "\(projectPath)/seed-vc/.venv/bin/python"
        let stemDir = "\(projectPath)/tmp/separated/htdemucs/\(songBase)"
        let vocalsWav = "\(stemDir)/vocals.wav"
        try FileManager.default.createDirectory(
            atPath: "\(projectPath)/tmp/converted",
            withIntermediateDirectories: true
        )
        try await runProcess(
            executable: python,
            args: [
                "inference.py",
                "--source", vocalsWav,
                "--target", target,
                "--output", "\(projectPath)/tmp/converted",
                "--diffusion-steps", "30",
                "--f0-condition", "True",
                "--semi-tone-shift", "\(semiTone)",
            ],
            cwd: "\(projectPath)/seed-vc"
        )
    }

    private func stepMix(projectPath: String,
                         songBase: String,
                         name: String) async throws -> String {
        await MainActor.run {
            self.step = .mixing
            self.log.append("========== [3/3] ミックス ==========")
        }
        let convertedDir = "\(projectPath)/tmp/converted"
        let stemDir = "\(projectPath)/tmp/separated/htdemucs/\(songBase)"
        let noVocals = "\(stemDir)/no_vocals.wav"

        // Pick newest vc_vocals_* file in tmp/converted
        let vcVocals = try latestVCVocals(in: convertedDir)

        let outputDir = "\(projectPath)/output/sing"
        try FileManager.default.createDirectory(
            atPath: outputDir, withIntermediateDirectories: true
        )
        let outPath = "\(outputDir)/\(name).wav"

        let ffmpeg = resolveFFmpeg()
        try await runProcess(
            executable: ffmpeg,
            args: [
                "-i", vcVocals,
                "-i", noVocals,
                "-filter_complex",
                "[0:a]volume=2.5[v];[1:a]apad[i];[v][i]amix=inputs=2:duration=longest:weights=1 1:normalize=0[out]",
                "-map", "[out]",
                outPath,
                "-y",
            ],
            cwd: projectPath
        )
        return outPath
    }

    // MARK: - Helpers

    func latestVCVocals(in dir: String) throws -> String {
        let fm = FileManager.default
        let items = (try? fm.contentsOfDirectory(atPath: dir)) ?? []
        let candidates = items.filter { $0.hasPrefix("vc_vocals_") }
        guard !candidates.isEmpty else {
            throw NSError(domain: "SongEngine", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "vc_vocals_* file not found in \(dir)"
            ])
        }
        let pairs: [(String, Date)] = candidates.compactMap { name in
            let path = "\(dir)/\(name)"
            let attrs = try? fm.attributesOfItem(atPath: path)
            let date = (attrs?[.modificationDate] as? Date) ?? .distantPast
            return (path, date)
        }
        return pairs.max(by: { $0.1 < $1.1 })!.0
    }

    private func resolveFFmpeg() -> String {
        // Prefer system paths; fall back to "ffmpeg" and let PATH resolve.
        for candidate in ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/usr/bin/ffmpeg"] {
            if FileManager.default.isExecutableFile(atPath: candidate) {
                return candidate
            }
        }
        return "/usr/bin/env"
    }

    func absolutePath(_ p: String, relativeTo base: String) -> String {
        if p.hasPrefix("/") { return p }
        return "\(base)/\(p)"
    }

    /// Spawns a process, streams its stdout/stderr into `log`, and awaits completion.
    /// Throws on non-zero exit or cancellation.
    private func runProcess(executable: String, args: [String], cwd: String) async throws {
        let proc = Process()
        if executable == "/usr/bin/env" {
            proc.executableURL = URL(fileURLWithPath: "/usr/bin/env")
            proc.arguments = ["ffmpeg"] + args
        } else {
            proc.executableURL = URL(fileURLWithPath: executable)
            proc.arguments = args
        }
        proc.currentDirectoryURL = URL(fileURLWithPath: cwd)

        // Inherit PATH so demucs/ffmpeg can find ancillary tools
        var env = ProcessInfo.processInfo.environment
        if env["PATH"] == nil || !(env["PATH"]!.contains("/opt/homebrew/bin")) {
            env["PATH"] = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
        }
        proc.environment = env

        let outPipe = Pipe()
        let errPipe = Pipe()
        proc.standardOutput = outPipe
        proc.standardError = errPipe

        outPipe.fileHandleForReading.readabilityHandler = { [weak self] h in
            guard let self else { return }
            let data = h.availableData
            guard !data.isEmpty, let s = String(data: data, encoding: .utf8) else { return }
            for line in s.split(separator: "\n") {
                let str = String(line)
                Task { @MainActor in self.log.append(str) }
            }
        }
        errPipe.fileHandleForReading.readabilityHandler = { [weak self] h in
            guard let self else { return }
            let data = h.availableData
            guard !data.isEmpty, let s = String(data: data, encoding: .utf8) else { return }
            for line in s.split(separator: "\n") {
                let str = String(line)
                Task { @MainActor in self.log.append("[err] " + str) }
            }
        }

        SeamanLogger.log("SongEngine spawn: \(executable) \(args.joined(separator: " "))")

        let wasCancelledSnapshot: () -> Bool = { [weak self] in self?.cancelled ?? false }

        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            proc.terminationHandler = { p in
                outPipe.fileHandleForReading.readabilityHandler = nil
                errPipe.fileHandleForReading.readabilityHandler = nil
                if p.terminationStatus == 0 {
                    cont.resume()
                } else if wasCancelledSnapshot() {
                    cont.resume(throwing: CancellationError())
                } else {
                    cont.resume(throwing: NSError(
                        domain: "SongEngine", code: Int(p.terminationStatus),
                        userInfo: [NSLocalizedDescriptionKey:
                            "\(executable) exited \(p.terminationStatus)"]
                    ))
                }
            }
            do {
                try proc.run()
                self.currentProcess = proc
            } catch {
                cont.resume(throwing: error)
            }
        }
    }
}
