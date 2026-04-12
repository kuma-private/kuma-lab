//! Audio worker thread + cpal stream management.
//!
//! Phase 0 shipped a sine-wave debug stream. Phase 2 layers the real engine
//! on top: a `Graph` + `Transport` rendered inside the same cpal callback,
//! with lock-free communication from the network thread via `rtrb` SPSC
//! ring buffers.

use std::f32::consts::TAU;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{channel, Sender};
use std::sync::Arc;
use std::thread;

use anyhow::{anyhow, Context, Result};
use bridge_plugin_host::{Graph, MidiEvent, MidiEventKind, Transport};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Sample, SampleFormat, Stream};
use rtrb::{Consumer, Producer, RingBuffer};
use tracing::{info, warn};

const SINE_FREQ_HZ: f32 = 440.0;
const RT_CMD_CAPACITY: usize = 256;
const TELEMETRY_CAPACITY: usize = 256;
const POSITION_REPORT_INTERVAL: u64 = 1024; // samples

// ── Public RT command + telemetry types ───────────────────

pub enum RtCommand {
    SetGraph(Box<Graph>),
    Play { from_tick: Option<i64> },
    Stop,
    Seek { tick: i64 },
    LiveNoteOn {
        track_idx: usize,
        pitch: u8,
        velocity: u8,
    },
    LiveNoteOff {
        track_idx: usize,
        pitch: u8,
    },
    SineDebug(bool),
}

#[derive(Debug, Clone, Copy)]
pub enum TelemetryEvent {
    Position { tick: i64, seconds: f64 },
    StateChange { playing: bool },
    Xrun,
}

// ── AudioHandle ───────────────────────────────────────────

enum AudioCmd {
    Start(Sender<Result<()>>),
    Shutdown,
}

/// Handle to the audio worker thread. `Send + Sync` so it can live inside
/// an async task without wrapping the non-`Send` `cpal::Stream`.
#[derive(Clone)]
pub struct AudioHandle {
    tx: Sender<AudioCmd>,
    active: Arc<AtomicBool>,
    telemetry: Arc<TelemetryReceiver>,
    rt_producer: Arc<std::sync::Mutex<Producer<RtCommand>>>,
}

/// Cross-thread receiver wrapper around the rtrb consumer (which is !Sync).
pub struct TelemetryReceiver {
    inner: std::sync::Mutex<Option<Consumer<TelemetryEvent>>>,
}

impl TelemetryReceiver {
    pub fn try_recv_batch(&self, max: usize, out: &mut Vec<TelemetryEvent>) {
        let mut guard = self.inner.lock().expect("telemetry mutex");
        let Some(rx) = guard.as_mut() else { return };
        for _ in 0..max {
            match rx.pop() {
                Ok(ev) => out.push(ev),
                Err(_) => break,
            }
        }
    }
}

impl AudioHandle {
    pub fn spawn() -> Self {
        let (tx, rx) = channel::<AudioCmd>();
        let active = Arc::new(AtomicBool::new(false));
        let active_worker = active.clone();

        // Build the rtrb rings up front so the network thread can grab the
        // producer/consumer halves before the worker spins up its stream.
        let (rt_prod, rt_cons) = RingBuffer::<RtCommand>::new(RT_CMD_CAPACITY);
        let (tel_prod, tel_cons) = RingBuffer::<TelemetryEvent>::new(TELEMETRY_CAPACITY);

        let telemetry = Arc::new(TelemetryReceiver {
            inner: std::sync::Mutex::new(Some(tel_cons)),
        });

        thread::Builder::new()
            .name("bridge-audio".into())
            .spawn(move || {
                let mut state = WorkerState {
                    active: active_worker,
                    stream: None,
                    rt_cons: Some(rt_cons),
                    tel_prod: Some(tel_prod),
                };
                while let Ok(cmd) = rx.recv() {
                    match cmd {
                        AudioCmd::Start(ack) => {
                            let res = state.start_engine();
                            let _ = ack.send(res);
                        }
                        AudioCmd::Shutdown => break,
                    }
                }
            })
            .expect("spawn bridge-audio thread");

        Self {
            tx,
            active,
            telemetry,
            rt_producer: Arc::new(std::sync::Mutex::new(rt_prod)),
        }
    }

    pub fn telemetry(&self) -> Arc<TelemetryReceiver> {
        self.telemetry.clone()
    }

    pub fn is_playing(&self) -> bool {
        self.active.load(Ordering::Relaxed)
    }

    /// Start the cpal output stream (idempotent). Required before any
    /// `RtCommand` will actually be observed by the audio callback.
    pub fn start(&self) -> Result<()> {
        let (ack_tx, ack_rx) = channel();
        self.tx
            .send(AudioCmd::Start(ack_tx))
            .map_err(|_| anyhow!("audio thread dropped"))?;
        ack_rx.recv().map_err(|_| anyhow!("audio thread dropped"))?
    }

    /// Push a real-time command. Returns Err if the ring is full
    /// (back-pressure on a healthy bridge should never happen, but we
    /// surface it instead of dropping).
    pub fn send_rt(&self, cmd: RtCommand) -> Result<()> {
        // Make sure the engine stream is running so the callback drains
        // the ring. Calling start() repeatedly is cheap and idempotent.
        self.start()?;
        let mut guard = self
            .rt_producer
            .lock()
            .map_err(|_| anyhow!("rt producer poisoned"))?;
        guard
            .push(cmd)
            .map_err(|_| anyhow!("rt command queue full"))
    }

    /// Convenience for the legacy debug.sine path.
    pub fn set_sine(&self, on: bool) -> Result<()> {
        self.send_rt(RtCommand::SineDebug(on))?;
        self.active.store(on, Ordering::Relaxed);
        Ok(())
    }

    pub fn shutdown(&self) {
        let _ = self.tx.send(AudioCmd::Shutdown);
    }
}

// ── Worker state ──────────────────────────────────────────

struct WorkerState {
    active: Arc<AtomicBool>,
    stream: Option<Stream>,
    rt_cons: Option<Consumer<RtCommand>>,
    tel_prod: Option<Producer<TelemetryEvent>>,
}

impl WorkerState {
    fn start_engine(&mut self) -> Result<()> {
        if self.stream.is_some() {
            return Ok(());
        }
        let rt_cons = self.rt_cons.take().ok_or_else(|| anyhow!("rt cons taken"))?;
        let tel_prod = self
            .tel_prod
            .take()
            .ok_or_else(|| anyhow!("tel prod taken"))?;
        let stream = build_engine_stream(self.active.clone(), rt_cons, tel_prod)?;
        stream.play().context("play stream")?;
        self.stream = Some(stream);
        info!("engine stream started");
        Ok(())
    }

}

// ── cpal stream factory ───────────────────────────────────

struct EngineState {
    transport: Transport,
    graph: Option<Graph>,
    sine_phase: f32,
    sine_phase_inc: f32,
    sine_on: bool,
    channels: usize,
    samples_since_report: u64,
    last_playing: bool,
}

fn build_engine_stream(
    active: Arc<AtomicBool>,
    mut rt_cons: Consumer<RtCommand>,
    mut tel_prod: Producer<TelemetryEvent>,
) -> Result<Stream> {
    let host = cpal::default_host();
    let device = host
        .default_output_device()
        .ok_or_else(|| anyhow!("no default output device"))?;
    let config = device
        .default_output_config()
        .context("default output config")?;
    let sample_format = config.sample_format();
    let stream_config: cpal::StreamConfig = config.into();

    let sample_rate = stream_config.sample_rate.0;
    let channels = stream_config.channels as usize;
    let phase_inc = TAU * SINE_FREQ_HZ / sample_rate as f32;

    let mut state = EngineState {
        transport: Transport::new(120.0, sample_rate),
        graph: None,
        sine_phase: 0.0,
        sine_phase_inc: phase_inc,
        sine_on: false,
        channels,
        samples_since_report: 0,
        last_playing: false,
    };

    let err_fn = |e| warn!("cpal stream error: {e}");

    let stream = match sample_format {
        SampleFormat::F32 => device.build_output_stream(
            &stream_config,
            move |data: &mut [f32], _| {
                run_callback::<f32>(
                    data,
                    &mut state,
                    &mut rt_cons,
                    &mut tel_prod,
                    &active,
                );
            },
            err_fn,
            None,
        ),
        SampleFormat::I16 => device.build_output_stream(
            &stream_config,
            move |data: &mut [i16], _| {
                run_callback::<i16>(
                    data,
                    &mut state,
                    &mut rt_cons,
                    &mut tel_prod,
                    &active,
                );
            },
            err_fn,
            None,
        ),
        SampleFormat::U16 => device.build_output_stream(
            &stream_config,
            move |data: &mut [u16], _| {
                run_callback::<u16>(
                    data,
                    &mut state,
                    &mut rt_cons,
                    &mut tel_prod,
                    &active,
                );
            },
            err_fn,
            None,
        ),
        other => return Err(anyhow!("unsupported sample format: {other:?}")),
    }
    .context("build output stream")?;

    Ok(stream)
}

fn run_callback<T>(
    data: &mut [T],
    state: &mut EngineState,
    rt_cons: &mut Consumer<RtCommand>,
    tel_prod: &mut Producer<TelemetryEvent>,
    active: &AtomicBool,
) where
    T: Sample + cpal::FromSample<f32>,
{
    // 1. Drain RT commands.
    while let Ok(cmd) = rt_cons.pop() {
        apply_rt(cmd, state, active);
    }

    let n_frames = data.len() / state.channels;

    // 2. Render either the engine graph or the debug sine.
    let mut stereo_buf: [f32; 2048] = [0.0; 2048];
    let stereo_len = (n_frames * 2).min(stereo_buf.len());
    let frames_used = stereo_len / 2;

    if state.sine_on {
        for i in 0..frames_used {
            let s = state.sine_phase.sin() * 0.25;
            state.sine_phase += state.sine_phase_inc;
            if state.sine_phase >= TAU {
                state.sine_phase -= TAU;
            }
            stereo_buf[i * 2] = s;
            stereo_buf[i * 2 + 1] = s;
        }
    } else if let Some(graph) = state.graph.as_mut() {
        graph.process(&state.transport, &mut stereo_buf[..stereo_len], frames_used);
    }

    // 3. Copy into cpal output, downmixing/duplicating to channel count.
    for (frame_idx, frame) in data.chunks_mut(state.channels).enumerate() {
        if frame_idx >= frames_used {
            for o in frame.iter_mut() {
                *o = T::from_sample(0.0);
            }
            continue;
        }
        let l = stereo_buf[frame_idx * 2];
        let r = stereo_buf[frame_idx * 2 + 1];
        for (ch, o) in frame.iter_mut().enumerate() {
            let v = if ch == 0 {
                l
            } else if ch == 1 {
                r
            } else {
                0.5 * (l + r)
            };
            *o = T::from_sample(v);
        }
    }

    // 4. Advance transport + emit telemetry.
    if state.transport.playing {
        state.transport.advance(frames_used as u32);
        state.samples_since_report += frames_used as u64;
        if state.samples_since_report >= POSITION_REPORT_INTERVAL {
            state.samples_since_report = 0;
            let _ = tel_prod.push(TelemetryEvent::Position {
                tick: state.transport.position_tick(),
                seconds: state.transport.position_seconds(),
            });
        }
    }
    if state.transport.playing != state.last_playing {
        state.last_playing = state.transport.playing;
        let _ = tel_prod.push(TelemetryEvent::StateChange {
            playing: state.last_playing,
        });
    }
}

fn apply_rt(cmd: RtCommand, state: &mut EngineState, active: &AtomicBool) {
    match cmd {
        RtCommand::SetGraph(g) => {
            let g = *g;
            state.transport.set_bpm(g.bpm);
            state.graph = Some(g);
        }
        RtCommand::Play { from_tick } => {
            if let Some(t) = from_tick {
                state.transport.seek_tick(t);
            }
            state.transport.play();
            state.sine_on = false;
        }
        RtCommand::Stop => {
            if let Some(g) = state.graph.as_mut() {
                g.all_notes_off();
            }
            state.transport.stop();
        }
        RtCommand::Seek { tick } => {
            state.transport.seek_tick(tick);
        }
        RtCommand::LiveNoteOn {
            track_idx,
            pitch,
            velocity,
        } => {
            if let Some(g) = state.graph.as_mut() {
                g.push_live(track_idx, MidiEvent {
                    sample_offset: 0,
                    kind: MidiEventKind::NoteOn { pitch, velocity },
                });
            }
        }
        RtCommand::LiveNoteOff { track_idx, pitch } => {
            if let Some(g) = state.graph.as_mut() {
                g.push_live(track_idx, MidiEvent {
                    sample_offset: 0,
                    kind: MidiEventKind::NoteOff { pitch },
                });
            }
        }
        RtCommand::SineDebug(on) => {
            state.sine_on = on;
            active.store(on, Ordering::Relaxed);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn handle_is_not_playing_initially() {
        let h = AudioHandle::spawn();
        assert!(!h.is_playing());
        h.shutdown();
    }
}
