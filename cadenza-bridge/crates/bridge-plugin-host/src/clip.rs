use crate::midi::MidiEvent;
use bridge_protocol::{MidiClipSpec, MidiNoteSpec};

#[derive(Debug, Clone)]
pub struct MidiNote {
    pub pitch: u8,
    pub velocity: u8,
    pub start_tick: i64,
    pub length_ticks: i64,
}

impl From<&MidiNoteSpec> for MidiNote {
    fn from(s: &MidiNoteSpec) -> Self {
        Self {
            pitch: s.pitch,
            velocity: s.velocity,
            start_tick: s.start_tick,
            length_ticks: s.length_ticks,
        }
    }
}

#[derive(Debug, Clone)]
pub struct MidiClip {
    pub id: String,
    pub start_tick: i64,
    pub length_ticks: i64,
    pub notes: Vec<MidiNote>,
}

impl From<&MidiClipSpec> for MidiClip {
    fn from(s: &MidiClipSpec) -> Self {
        Self {
            id: s.id.clone(),
            start_tick: s.start_tick,
            length_ticks: s.length_ticks,
            notes: s.notes.iter().map(MidiNote::from).collect(),
        }
    }
}

impl MidiClip {
    /// Generate MIDI events that fall within the absolute tick range
    /// `[range_start_tick, range_end_tick)` where `samples_per_tick` is the
    /// active rate. The returned `MidiEvent::sample_offset` is relative to
    /// `range_start_tick`.
    pub fn events_in_range(
        &self,
        range_start_tick: i64,
        range_end_tick: i64,
        samples_per_tick: f64,
        out: &mut Vec<MidiEvent>,
    ) {
        if range_end_tick <= self.start_tick {
            return;
        }
        let clip_end = self.start_tick + self.length_ticks;
        if range_start_tick >= clip_end {
            return;
        }
        for n in &self.notes {
            let abs_on = self.start_tick + n.start_tick;
            let abs_off = abs_on + n.length_ticks;

            if abs_on >= range_start_tick && abs_on < range_end_tick {
                let off = ((abs_on - range_start_tick) as f64 * samples_per_tick) as u32;
                out.push(MidiEvent::note_on(off, n.pitch, n.velocity));
            }
            if abs_off >= range_start_tick && abs_off < range_end_tick {
                let off = ((abs_off - range_start_tick) as f64 * samples_per_tick) as u32;
                out.push(MidiEvent::note_off(off, n.pitch));
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_clip() -> MidiClip {
        MidiClip {
            id: "c".into(),
            start_tick: 0,
            length_ticks: 1920,
            notes: vec![
                MidiNote {
                    pitch: 60,
                    velocity: 100,
                    start_tick: 0,
                    length_ticks: 480,
                },
                MidiNote {
                    pitch: 62,
                    velocity: 100,
                    start_tick: 960,
                    length_ticks: 480,
                },
            ],
        }
    }

    #[test]
    fn emits_on_off_in_range() {
        let c = make_clip();
        let mut out = vec![];
        c.events_in_range(0, 1000, 50.0, &mut out);
        // expect: noteOn(60), noteOff(60), noteOn(62)
        assert_eq!(out.len(), 3);
    }

    #[test]
    fn skips_out_of_range() {
        let c = make_clip();
        let mut out = vec![];
        c.events_in_range(2000, 3000, 50.0, &mut out);
        assert!(out.is_empty());
    }
}
