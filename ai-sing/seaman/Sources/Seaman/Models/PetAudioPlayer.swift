import AVFoundation

@MainActor
class PetAudioPlayer: NSObject, AVAudioPlayerDelegate {
    private var player: AVAudioPlayer?
    private var continuation: CheckedContinuation<Void, Never>?

    func play(path: String) async {
        let url = URL(fileURLWithPath: path)
        do {
            player = try AVAudioPlayer(contentsOf: url)
            player?.delegate = self
            player?.play()
            await withCheckedContinuation { continuation in
                self.continuation = continuation
            }
        } catch {
            print("Audio playback error: \(error)")
        }
    }

    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in
            continuation?.resume()
            continuation = nil
        }
    }
}
