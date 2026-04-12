// PlaybackEngine — abstract interface with Tone.js (free) and Bridge (premium) impls.

import type { MidiNote, Song } from '$lib/types/song';

export type EngineState = 'idle' | 'playing' | 'paused' | 'stopped';

export interface PlaybackEngineCallbacks {
	onStateChange?: (s: EngineState) => void;
	onProgress?: (currentTime: number, totalDuration: number) => void;
	onBarChange?: (bar: number) => void;
	onChordChange?: (chord: string | null) => void;
}

export interface PlaybackEngine extends PlaybackEngineCallbacks {
	readonly kind: 'tone' | 'bridge';
	readonly totalDuration: number;

	load(song: Song): Promise<void>;
	play(): Promise<void>;
	pause(): Promise<void>;
	stop(): Promise<void>;
	seekTo(seconds: number): Promise<void>;
	setVolume(db: number): void;
	setTrackVolume(trackId: string, db: number): void;
	setTrackMute(trackId: string, muted: boolean): void;
	setTrackSolo(trackId: string, solo: boolean): void;
	getTrackNotes(trackId: string): MidiNote[];
	getAllTrackNotes(): Map<string, MidiNote[]>;
	dispose(): void;
}

export interface EnginePlan {
	plan: 'free' | 'premium';
	bridgeConnected: boolean;
}

export function chooseEngineKind(opts: EnginePlan): 'tone' | 'bridge' {
	return opts.plan === 'premium' && opts.bridgeConnected ? 'bridge' : 'tone';
}

export async function createEngine(opts: EnginePlan): Promise<PlaybackEngine> {
	if (chooseEngineKind(opts) === 'bridge') {
		const { BridgeEngine } = await import('./bridge-engine');
		return new BridgeEngine();
	}
	const { ToneEngine } = await import('./tone-engine');
	return new ToneEngine();
}
