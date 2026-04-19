import Foundation

actor PetBrain {
    private let ollamaURL = "http://localhost:11434/api/chat"
    private let modelName = "qwen3.5:122b"

    func generateSpeech(topic: String, history: [String], extra: String?) -> String {
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

        let semaphore = DispatchSemaphore(value: 0)
        var result = ""

        let task = URLSession.shared.dataTask(with: request) { data, response, error in
            defer { semaphore.signal() }

            if let error = error {
                SeamanLogger.log("Ollama error: \(error)")
                return
            }
            guard let data = data else { return }

            do {
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
                SeamanLogger.log("JSON parse error: \(error)")
            }
        }
        task.resume()
        semaphore.wait()

        if result.isEmpty {
            return "…水槽の中は今日も退屈だ。"
        }

        // Limit to 2 sentences
        let sentences = result.components(separatedBy: CharacterSet(charactersIn: "。！？"))
            .filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
        if sentences.count > 2 {
            result = sentences.prefix(2).joined(separator: "。") + "。"
        }
        return result
    }
}
