use bridge_audio::AudioHandle;

#[derive(Clone)]
pub struct SessionState {
    audio: AudioHandle,
}

impl SessionState {
    pub fn new() -> Self {
        Self {
            audio: AudioHandle::spawn(),
        }
    }

    pub fn set_sine(&self, on: bool) -> anyhow::Result<()> {
        self.audio.set_sine(on)
    }
}

impl Default for SessionState {
    fn default() -> Self {
        Self::new()
    }
}
