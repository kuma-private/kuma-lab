import Foundation

enum SeamanLogger {
    private static let logFile: URL = {
        let projectPath = UserDefaults.standard.string(forKey: "projectPath")
            ?? "/Users/kuma/repos/kuma/kuma-lab/ai-sing"
        let dir = URL(fileURLWithPath: projectPath).appendingPathComponent("tmp")
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("seaman.log")
    }()

    static func log(_ message: String) {
        let timestamp = ISO8601DateFormatter().string(from: Date())
        let line = "[\(timestamp)] \(message)\n"
        print(line, terminator: "")
        if let data = line.data(using: .utf8) {
            if FileManager.default.fileExists(atPath: logFile.path) {
                if let handle = try? FileHandle(forWritingTo: logFile) {
                    handle.seekToEndOfFile()
                    handle.write(data)
                    handle.closeFile()
                }
            } else {
                try? data.write(to: logFile)
            }
        }
    }
}
