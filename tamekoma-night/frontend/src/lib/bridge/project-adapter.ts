// Adapter — Cadenza Song → BridgeProject for Phase 2.
// Note generation reuse strategy: Option B — caller passes generated notes
// (typically obtained from MultiTrackPlayer) so we don't duplicate the
// voicing/rhythm/drum pipeline. BridgeEngine handles the wiring.

import type { MidiNote, Song } from '$lib/types/song';
import type {
	BridgeMidiClip,
	BridgeMidiNote,
	BridgeProject,
	BridgeTrackState
} from './protocol';

export const PPQ = 480;
export const BRIDGE_PROJECT_VERSION = '0.1';
export const DEFAULT_SAMPLE_RATE = 48_000;

/** RFC 6901 escape: ~ → ~0, / → ~1. Used as a single JSON Pointer segment. */
export function escapeJsonPointer(s: string): string {
	return s.replace(/~/g, '~0').replace(/\//g, '~1');
}

function parseTimeSignature(ts: string): [number, number] {
	const parts = ts.split('/');
	if (parts.length === 2) {
		const beats = Number(parts[0]);
		const beatValue = Number(parts[1]);
		if (Number.isFinite(beats) && Number.isFinite(beatValue) && beats > 0 && beatValue > 0) {
			return [beats, beatValue];
		}
	}
	return [4, 4];
}

function toBridgeNote(n: MidiNote): BridgeMidiNote {
	return {
		pitch: n.midi,
		velocity: n.velocity,
		startTick: n.startTick,
		lengthTicks: n.durationTicks
	};
}

function totalLengthTicks(notes: MidiNote[]): number {
	let max = 0;
	for (const n of notes) {
		const end = n.startTick + n.durationTicks;
		if (end > max) max = end;
	}
	return max;
}

/**
 * Convert a Cadenza Song + already-generated MIDI notes (per track) into a
 * BridgeProject payload that the Bridge can load. Each track is bundled into
 * a single MidiClip starting at tick 0.
 *
 * If a track has `instrumentPlugin` set, the Bridge will route MIDI through
 * that plugin (built-in synth or third-party CLAP/VST3). Otherwise the
 * instrument is `null` and the Bridge plays silence.
 */
export function songToBridgeProject(
	song: Song,
	generatedTrackNotes: Map<string, MidiNote[]>
): BridgeProject {
	const tracks: BridgeTrackState[] = song.tracks.map((t) => {
		const notes = generatedTrackNotes.get(t.id) ?? [];
		const bridgeNotes = notes.map(toBridgeNote);
		const lengthTicks = totalLengthTicks(notes);
		const clip: BridgeMidiClip = {
			id: `${t.id}:clip0`,
			startTick: 0,
			lengthTicks,
			notes: bridgeNotes
		};
		return {
			id: t.id,
			name: t.name,
			instrument: t.instrumentPlugin
				? {
						pluginFormat: t.instrumentPlugin.format,
						pluginId: t.instrumentPlugin.uid
				  }
				: null,
			clips: [clip],
			volumeDb: t.volume ?? 0,
			pan: t.pan ?? 0,
			mute: t.mute ?? false,
			solo: t.solo ?? false
		};
	});

	return {
		version: BRIDGE_PROJECT_VERSION,
		bpm: song.bpm || 120,
		timeSignature: parseTimeSignature(song.timeSignature),
		sampleRate: DEFAULT_SAMPLE_RATE,
		tracks
	};
}

/** Convert a tick offset to seconds at a given BPM (PPQ = 480). */
export function tickToSeconds(tick: number, bpm: number): number {
	return (tick / PPQ) * (60 / bpm);
}

/** Convert seconds to tick offset at a given BPM (PPQ = 480). */
export function secondsToTick(seconds: number, bpm: number): number {
	return Math.round((seconds * bpm) / 60 * PPQ);
}
