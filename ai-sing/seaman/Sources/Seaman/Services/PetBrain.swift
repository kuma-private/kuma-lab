import Foundation

actor PetBrain {
    private let ollamaURL = "http://localhost:11434/api/chat"
    private let modelName = "qwen3.5:122b"

    func generateSpeech(topic: String, history: [String], extra: String?) async -> String {
        let historyText = history.suffix(3).joined(separator: "\n")
        let extraPrompt = extra.map { "\n追加指示: \($0)" } ?? ""

        let systemPrompt = """
        あなたはシーマンです。水槽の中に住む人面魚で、皮肉屋で哲学的な性格です。
        ユーザーのデスクトップに常駐しています。
        1〜2文で短く独り言を呟いてください。毒を含みつつもユーモアのある発言をしてください。
        """

        let userPrompt = """
        トピック: \(topic)
        \(historyText.isEmpty ? "" : "最近の発言:\n\(historyText)")
        \(extraPrompt)
        """

        let body: [String: Any] = [
            "model": modelName,
            "messages": [
                ["role": "system", "content": systemPrompt],
                ["role": "user", "content": userPrompt],
            ],
            "stream": false,
            "think": false,
            "options": ["num_predict": 100],
        ]

        guard let jsonData = try? JSONSerialization.data(withJSONObject: body) else {
            SeamanLogger.log("Failed to serialize JSON")
            return "…水槽の中は今日も退屈だ。"
        }

        var request = URLRequest(url: URL(string: ollamaURL)!)
        request.httpMethod = "POST"
        request.httpBody = jsonData
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 30

        var result = ""
        do {
            let (data, _) = try await URLSession.shared.data(for: request)
            if let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
               let message = json["message"] as? [String: Any],
               let content = message["content"] as? String {
                result = content.trimmingCharacters(in: .whitespacesAndNewlines)
                SeamanLogger.log("LLM response: \(result)")
            } else if let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                      let error = json["error"] as? String {
                SeamanLogger.log("Ollama API error: \(error)")
            }
        } catch {
            SeamanLogger.log("Ollama error: \(error)")
            return "…水槽の中は今日も退屈だ。"
        }

        return Self.postprocess(result)
    }
}

extension PetBrain {
    static func postprocess(_ raw: String) -> String {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return "…水槽の中は今日も退屈だ。" }
        let sentences = trimmed.components(separatedBy: CharacterSet(charactersIn: "。！？"))
            .filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
        if sentences.count > 2 {
            return sentences.prefix(2).joined(separator: "。") + "。"
        }
        return trimmed
    }
}
