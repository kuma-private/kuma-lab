// ToneEngine — 1:1 adapter wrapping MultiTrackPlayer for the PlaybackEngine interface.
// Keeps MultiTrackPlayer untouched.

import { MultiTrackPlayer } from '$lib/multi-track-player';
import type { MidiNote, Song } from '$lib/types/song';
import type { EngineState, PlaybackEngine } from './engine';

export class ToneEngine implements PlaybackEngine {
	readonly kind = 'tone' as const;

	private player: MultiTrackPlayer;

	onStateChange?: (s: EngineState) => void;
	onProgress?: (currentTime: number, totalDuration: number) => void;
	onBarChange?: (bar: number) => void;
	onChordChange?: (chord: string | null) => void;

	constructor() {
		this.player = new MultiTrackPlayer({
			onStateChange: (s) => this.onStateChange?.(s),
			onProgress: (ct, td) => this.onProgress?.(ct, td),
			onBarChange: (b) => this.onBarChange?.(b),
			onChordChange: (c) => this.onChordChange?.(c)
		});
	}

	get totalDuration(): number {
		return this.player.totalDuration;
	}

	async load(song: Song): Promise<void> {
		this.player.load(song);
	}

	async play(): Promise<void> {
		await this.player.play();
	}

	async pause(): Promise<void> {
		this.player.pause();
	}

	async stop(): Promise<void> {
		this.player.stop();
	}

	async seekTo(seconds: number): Promise<void> {
		this.player.seekTo(seconds);
	}

	setVolume(db: number): void {
		this.player.setVolume(db);
	}

	setTrackVolume(trackId: string, db: number): void {
		this.player.setTrackVolume(trackId, db);
	}

	setTrackMute(trackId: string, muted: boolean): void {
		this.player.setTrackMute(trackId, muted);
	}

	setTrackSolo(trackId: string, solo: boolean): void {
		this.player.setTrackSolo(trackId, solo);
	}

	getTrackNotes(trackId: string): MidiNote[] {
		return this.player.getTrackNotes(trackId);
	}

	getAllTrackNotes(): Map<string, MidiNote[]> {
		return this.player.getAllTrackNotes();
	}

	dispose(): void {
		this.player.dispose();
	}
}
