// BridgeEngine — Phase 1 stub. Phase 2 will implement actual Bridge-backed playback.
// For now, constructing it is safe (no crash) but most controls throw.
// getTrackNotes/getAllTrackNotes can answer from the loaded song since Bridge
// does not own Cadenza note data.

import type { MidiNote, Song } from '$lib/types/song';
import type { EngineState, PlaybackEngine } from './engine';

const NOT_IMPL = 'BridgeEngine not implemented yet';

export class BridgeEngine implements PlaybackEngine {
	readonly kind = 'bridge' as const;

	private song: Song | null = null;
	private notesByTrack = new Map<string, MidiNote[]>();

	onStateChange?: (s: EngineState) => void;
	onProgress?: (currentTime: number, totalDuration: number) => void;
	onBarChange?: (bar: number) => void;
	onChordChange?: (chord: string | null) => void;

	get totalDuration(): number {
		return 0;
	}

	async load(song: Song): Promise<void> {
		this.song = song;
		this.notesByTrack.clear();
		for (const t of song.tracks) {
			const notes: MidiNote[] = [];
			for (const b of t.blocks) {
				if (b.generatedMidi?.notes?.length) notes.push(...b.generatedMidi.notes);
			}
			this.notesByTrack.set(t.id, notes);
		}
	}

	async play(): Promise<void> {
		throw new Error(NOT_IMPL);
	}

	async pause(): Promise<void> {
		throw new Error(NOT_IMPL);
	}

	async stop(): Promise<void> {
		throw new Error(NOT_IMPL);
	}

	async seekTo(_seconds: number): Promise<void> {
		throw new Error(NOT_IMPL);
	}

	setVolume(_db: number): void {
		throw new Error(NOT_IMPL);
	}

	setTrackVolume(_trackId: string, _db: number): void {
		throw new Error(NOT_IMPL);
	}

	setTrackMute(_trackId: string, _muted: boolean): void {
		throw new Error(NOT_IMPL);
	}

	setTrackSolo(_trackId: string, _solo: boolean): void {
		throw new Error(NOT_IMPL);
	}

	getTrackNotes(trackId: string): MidiNote[] {
		return this.notesByTrack.get(trackId) ?? [];
	}

	getAllTrackNotes(): Map<string, MidiNote[]> {
		return new Map(this.notesByTrack);
	}

	dispose(): void {
		this.song = null;
		this.notesByTrack.clear();
	}
}
