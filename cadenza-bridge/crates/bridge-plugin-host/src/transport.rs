use crate::{samples_per_tick, ticks_to_seconds};

#[derive(Debug, Clone)]
pub struct Transport {
    pub bpm: f64,
    pub sample_rate: u32,
    pub position_samples: u64,
    pub playing: bool,
    samples_per_tick: f64,
}

impl Transport {
    pub fn new(bpm: f64, sample_rate: u32) -> Self {
        Self {
            bpm,
            sample_rate,
            position_samples: 0,
            playing: false,
            samples_per_tick: samples_per_tick(bpm, sample_rate),
        }
    }

    pub fn set_bpm(&mut self, bpm: f64) {
        self.bpm = bpm;
        self.samples_per_tick = samples_per_tick(bpm, self.sample_rate);
    }

    pub fn samples_per_tick(&self) -> f64 {
        self.samples_per_tick
    }

    pub fn play(&mut self) {
        self.playing = true;
    }

    pub fn stop(&mut self) {
        self.playing = false;
        self.position_samples = 0;
    }

    pub fn pause(&mut self) {
        self.playing = false;
    }

    pub fn seek_tick(&mut self, tick: i64) {
        let s = (tick.max(0) as f64 * self.samples_per_tick) as u64;
        self.position_samples = s;
    }

    pub fn advance(&mut self, n_frames: u32) {
        if self.playing {
            self.position_samples += n_frames as u64;
        }
    }

    pub fn position_tick(&self) -> i64 {
        (self.position_samples as f64 / self.samples_per_tick) as i64
    }

    pub fn position_seconds(&self) -> f64 {
        ticks_to_seconds(self.position_tick(), self.bpm)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn advance_when_playing_only() {
        let mut t = Transport::new(120.0, 48000);
        t.advance(48000);
        assert_eq!(t.position_samples, 0);
        t.play();
        t.advance(48000);
        assert_eq!(t.position_samples, 48000);
    }

    #[test]
    fn seek_tick_round_trip() {
        let mut t = Transport::new(120.0, 48000);
        t.seek_tick(960);
        // 960 ticks at 120bpm/PPQ480/48k → 960*50 = 48000 samples
        assert_eq!(t.position_samples, 48000);
        assert_eq!(t.position_tick(), 960);
    }
}
