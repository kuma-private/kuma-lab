use std::f32::consts::TAU;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{channel, Sender};
use std::sync::Arc;
use std::thread;

use anyhow::{anyhow, Context, Result};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Sample, SampleFormat, Stream};
use tracing::{info, warn};

const SINE_FREQ_HZ: f32 = 440.0;

enum AudioCmd {
    SetSine(bool, Sender<Result<()>>),
    Shutdown,
}

/// Handle to the audio worker thread. `Send + Sync` so it can live inside
/// an async task without wrapping the non-`Send` `cpal::Stream`.
#[derive(Clone)]
pub struct AudioHandle {
    tx: Sender<AudioCmd>,
    active: Arc<AtomicBool>,
}

impl AudioHandle {
    pub fn spawn() -> Self {
        let (tx, rx) = channel::<AudioCmd>();
        let active = Arc::new(AtomicBool::new(false));
        let active_worker = active.clone();

        thread::Builder::new()
            .name("bridge-audio".into())
            .spawn(move || {
                let mut state = WorkerState {
                    active: active_worker,
                    stream: None,
                };
                while let Ok(cmd) = rx.recv() {
                    match cmd {
                        AudioCmd::SetSine(on, ack) => {
                            let res = state.set_enabled(on);
                            let _ = ack.send(res);
                        }
                        AudioCmd::Shutdown => break,
                    }
                }
            })
            .expect("spawn bridge-audio thread");

        Self { tx, active }
    }

    pub fn is_playing(&self) -> bool {
        self.active.load(Ordering::Relaxed)
    }

    pub fn set_sine(&self, on: bool) -> Result<()> {
        let (ack_tx, ack_rx) = channel();
        self.tx
            .send(AudioCmd::SetSine(on, ack_tx))
            .map_err(|_| anyhow!("audio thread dropped"))?;
        ack_rx.recv().map_err(|_| anyhow!("audio thread dropped"))?
    }

    pub fn shutdown(&self) {
        let _ = self.tx.send(AudioCmd::Shutdown);
    }
}

struct WorkerState {
    active: Arc<AtomicBool>,
    stream: Option<Stream>,
}

impl WorkerState {
    fn set_enabled(&mut self, on: bool) -> Result<()> {
        if on {
            if self.stream.is_some() {
                self.active.store(true, Ordering::Relaxed);
                return Ok(());
            }
            let stream = build_sine_stream(self.active.clone())?;
            stream.play().context("play stream")?;
            self.stream = Some(stream);
            self.active.store(true, Ordering::Relaxed);
            info!("sine engine started");
        } else {
            self.active.store(false, Ordering::Relaxed);
            if let Some(s) = self.stream.take() {
                drop(s);
                info!("sine engine stopped");
            }
        }
        Ok(())
    }
}

fn build_sine_stream(active: Arc<AtomicBool>) -> Result<Stream> {
    let host = cpal::default_host();
    let device = host
        .default_output_device()
        .ok_or_else(|| anyhow!("no default output device"))?;
    let config = device
        .default_output_config()
        .context("default output config")?;
    let sample_format = config.sample_format();
    let stream_config: cpal::StreamConfig = config.into();

    let sample_rate = stream_config.sample_rate.0 as f32;
    let channels = stream_config.channels as usize;
    let phase_inc = TAU * SINE_FREQ_HZ / sample_rate;
    let mut phase: f32 = 0.0;

    let err_fn = |e| warn!("cpal stream error: {e}");

    let stream = match sample_format {
        SampleFormat::F32 => device.build_output_stream(
            &stream_config,
            move |data: &mut [f32], _| {
                write_sine::<f32>(data, channels, &active, &mut phase, phase_inc);
            },
            err_fn,
            None,
        ),
        SampleFormat::I16 => device.build_output_stream(
            &stream_config,
            move |data: &mut [i16], _| {
                write_sine::<i16>(data, channels, &active, &mut phase, phase_inc);
            },
            err_fn,
            None,
        ),
        SampleFormat::U16 => device.build_output_stream(
            &stream_config,
            move |data: &mut [u16], _| {
                write_sine::<u16>(data, channels, &active, &mut phase, phase_inc);
            },
            err_fn,
            None,
        ),
        other => return Err(anyhow!("unsupported sample format: {other:?}")),
    }
    .context("build output stream")?;

    Ok(stream)
}

fn write_sine<T>(
    data: &mut [T],
    channels: usize,
    active: &AtomicBool,
    phase: &mut f32,
    phase_inc: f32,
) where
    T: Sample + cpal::FromSample<f32>,
{
    let on = active.load(Ordering::Relaxed);
    for frame in data.chunks_mut(channels) {
        let v = if on {
            let s = phase.sin() * 0.25;
            *phase += phase_inc;
            if *phase >= TAU {
                *phase -= TAU;
            }
            s
        } else {
            0.0
        };
        let sample: T = T::from_sample(v);
        for out in frame.iter_mut() {
            *out = sample;
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
