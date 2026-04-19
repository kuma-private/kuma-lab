import AVFoundation

@MainActor
class PetAudioPlayer: NSObject, AVAudioPlayerDelegate {
    private var player: AVAudioPlayer?
    private var continuation: CheckedContinuation<Void, Never>?

    func play(path: String) async {
        await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
            self.continuation = cont
            let url = URL(fileURLWithPath: path)
            do {
                player = try AVAudioPlayer(contentsOf: url)
                player?.delegate = self
                if player?.play() != true {
                    SeamanLogger.log("PetAudioPlayer: play() returned false for \(path)")
                    self.continuation = nil
                    cont.resume()
                }
            } catch {
                SeamanLogger.log("PetAudioPlayer: load failed for \(path): \(error)")
                self.continuation = nil
                cont.resume()
            }
        }
    }

    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in
            guard let cont = continuation else { return }
            continuation = nil
            cont.resume()
        }
    }
}
