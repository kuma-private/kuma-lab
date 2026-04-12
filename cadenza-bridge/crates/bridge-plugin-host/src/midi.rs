#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MidiEventKind {
    NoteOn { pitch: u8, velocity: u8 },
    NoteOff { pitch: u8 },
    AllOff,
}

#[derive(Debug, Clone, Copy)]
pub struct MidiEvent {
    /// Sample offset within the current process block.
    pub sample_offset: u32,
    pub kind: MidiEventKind,
}

impl MidiEvent {
    pub fn note_on(sample_offset: u32, pitch: u8, velocity: u8) -> Self {
        Self {
            sample_offset,
            kind: MidiEventKind::NoteOn { pitch, velocity },
        }
    }

    pub fn note_off(sample_offset: u32, pitch: u8) -> Self {
        Self {
            sample_offset,
            kind: MidiEventKind::NoteOff { pitch },
        }
    }

    pub fn all_off(sample_offset: u32) -> Self {
        Self {
            sample_offset,
            kind: MidiEventKind::AllOff,
        }
    }
}
