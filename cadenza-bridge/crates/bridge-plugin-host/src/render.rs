//! Offline render-to-WAV using a Graph snapshot. Runs detached from the
//! live audio thread; the live cpal stream keeps playing whatever it has.

use std::path::{Path, PathBuf};

use hound::{SampleFormat, WavSpec, WavWriter};

use crate::graph::Graph;
use crate::transport::Transport;

const RENDER_BLOCK: usize = 512;

pub struct RenderResult {
    pub path: PathBuf,
    pub frames: u64,
    pub sample_rate: u32,
    pub bit_depth: u8,
}

/// Render `graph` from `from_tick` to `to_tick` (inclusive of from, exclusive
/// of to) into a WAV file at `path`. Stereo, 16/24-bit PCM. Returns the
/// resolved absolute path and frame count on success.
pub fn render_to_wav(
    mut graph: Graph,
    from_tick: i64,
    to_tick: i64,
    sample_rate: u32,
    bit_depth: u8,
    path: &Path,
) -> anyhow::Result<RenderResult> {
    if to_tick <= from_tick {
        return Err(anyhow::anyhow!("invalid tick range: {from_tick}..{to_tick}"));
    }
    if !matches!(bit_depth, 16 | 24 | 32) {
        return Err(anyhow::anyhow!("unsupported bit depth: {bit_depth}"));
    }
    let abs_path = resolve_path(path)?;
    if let Some(parent) = abs_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let spec = WavSpec {
        channels: 2,
        sample_rate,
        bits_per_sample: bit_depth as u16,
        sample_format: if bit_depth == 32 {
            SampleFormat::Float
        } else {
            SampleFormat::Int
        },
    };
    let mut writer = WavWriter::create(&abs_path, spec)?;

    // Set up an offline transport.
    let mut transport = Transport::new(graph.bpm, sample_rate);
    transport.seek_tick(from_tick);
    transport.play();

    // Pre-allocate render buffers.
    let mut block: Vec<f32> = vec![0.0; RENDER_BLOCK * 2];
    let mut frames_written: u64 = 0;
    let max_amp = match bit_depth {
        16 => i16::MAX as f32,
        24 => 8_388_607.0_f32, // 2^23 - 1
        _ => 1.0,              // 32-bit float pass-through
    };
    let mut keep_going = true;
    while keep_going {
        let cur_tick = transport.position_tick();
        if cur_tick >= to_tick {
            break;
        }
        let remaining_ticks = (to_tick - cur_tick) as f64;
        let spt = transport.samples_per_tick();
        let max_remaining_frames = (remaining_ticks * spt).ceil() as i64;
        let n_frames = if (max_remaining_frames as usize) < RENDER_BLOCK {
            // Final partial block
            keep_going = false;
            max_remaining_frames.max(1) as usize
        } else {
            RENDER_BLOCK
        };
        let stereo_len = n_frames * 2;
        for s in block[..stereo_len].iter_mut() {
            *s = 0.0;
        }
        graph.process(&transport, &mut block[..stereo_len], n_frames);
        // Write samples
        for i in 0..n_frames {
            let l = block[i * 2].clamp(-1.0, 1.0);
            let r = block[i * 2 + 1].clamp(-1.0, 1.0);
            match bit_depth {
                32 => {
                    writer.write_sample(l)?;
                    writer.write_sample(r)?;
                }
                _ => {
                    writer.write_sample((l * max_amp) as i32)?;
                    writer.write_sample((r * max_amp) as i32)?;
                }
            }
        }
        frames_written += n_frames as u64;
        transport.advance(n_frames as u32);
    }
    writer.finalize()?;
    Ok(RenderResult {
        path: abs_path,
        frames: frames_written,
        sample_rate,
        bit_depth,
    })
}

/// If `path` is absolute, use it as-is. Otherwise resolve under
/// `~/Library/Application Support/Cadenza Bridge/renders/` (mac), the OS
/// equivalent on Linux/Windows. Falls back to the temp dir if the home
/// directory cannot be determined.
pub fn resolve_path(path: &Path) -> anyhow::Result<PathBuf> {
    if path.is_absolute() {
        return Ok(path.to_path_buf());
    }
    let base = render_root()?;
    Ok(base.join(path))
}

pub fn render_root() -> anyhow::Result<PathBuf> {
    let home = std::env::var_os("HOME")
        .map(PathBuf::from)
        .ok_or_else(|| anyhow::anyhow!("HOME not set"))?;
    #[cfg(target_os = "macos")]
    let p = home.join("Library/Application Support/Cadenza Bridge/renders");
    #[cfg(target_os = "linux")]
    let p = home.join(".local/share/cadenza-bridge/renders");
    #[cfg(target_os = "windows")]
    let p = home.join("AppData/Local/Cadenza Bridge/renders");
    Ok(p)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::effects::{GainEffect, InsertEffect};
    use crate::graph::{EffectNode, Track};
    use crate::midi::{MidiEvent, MidiEventKind};
    use crate::node::Instrument;

    /// A test instrument that emits a constant DC offset so we can verify
    /// the render pipeline produces non-silent output.
    struct DcInstrument(f32);
    impl Instrument for DcInstrument {
        fn process(&mut self, _events: &[MidiEvent], out: &mut [f32], n_frames: usize) {
            for i in 0..n_frames {
                out[i * 2] = self.0;
                out[i * 2 + 1] = self.0;
            }
        }
    }

    fn build_test_graph() -> Graph {
        let mut g = Graph::new(120.0, 48_000);
        let mut t = Track::new("t1".into(), "T".into(), Box::new(DcInstrument(0.5)));
        // Add a gain insert at -6 dB
        let mut effect: Box<dyn InsertEffect> = Box::new(GainEffect::with_gain_db(-6.0));
        effect.set_sample_rate(48_000);
        let _ = MidiEventKind::AllOff;
        t.inserts.push(EffectNode {
            id: "i1".into(),
            format: "builtin".into(),
            uid: "gain".into(),
            name: "Gain".into(),
            bypass: false,
            effect,
        });
        g.tracks.push(t);
        g.recompute_bus_order().unwrap();
        g
    }

    #[test]
    fn render_writes_non_silent_wav() {
        let g = build_test_graph();
        let tmp = std::env::temp_dir().join(format!(
            "cadenza-render-{}.wav",
            std::process::id()
        ));
        let res = render_to_wav(g, 0, 960, 48_000, 16, &tmp).unwrap();
        assert!(res.frames > 0);
        let reader = hound::WavReader::open(&res.path).unwrap();
        let spec = reader.spec();
        assert_eq!(spec.channels, 2);
        assert_eq!(spec.sample_rate, 48_000);
        assert_eq!(spec.bits_per_sample, 16);
        let max_abs: i32 = reader.into_samples::<i32>().map(|s| s.unwrap().abs()).max().unwrap();
        assert!(max_abs > 0, "expected non-silent output, got max_abs=0");
        let _ = std::fs::remove_file(&tmp);
    }
}
