// BridgeEngine — Phase 2 implementation. Sends WebSocket commands to the
// Cadenza Bridge for playback. Note generation is reused from MultiTrackPlayer
// (Option B) — we instantiate one briefly to run the voicing/rhythm pipeline,
// then dispose it. Phase 3 will plumb a real plugin instrument; for now tracks
// have instrument=null and the Bridge treats them as silent.

import { bridgeStore } from '$lib/stores/bridge.svelte';
import { secondsToTick, songToBridgeProject } from '$lib/bridge/project-adapter';
import type { BridgeEvent } from '$lib/bridge/protocol';
import type { MidiNote, Song } from '$lib/types/song';
import type { EngineState, PlaybackEngine } from './engine';

export class BridgeEngine implements PlaybackEngine {
	readonly kind = 'bridge' as const;
	totalDuration = 0;

	onStateChange?: (s: EngineState) => void;
	onProgress?: (currentTime: number, totalDuration: number) => void;
	onBarChange?: (bar: number) => void;
	onChordChange?: (chord: string | null) => void;

	private client = bridgeStore.client;
	private song: Song | null = null;
	private trackNotes = new Map<string, MidiNote[]>();
	private unsubs: Array<() => void> = [];

	constructor() {
		this.unsubs.push(
			this.client.on('transport.position', (e: BridgeEvent) => {
				if (e.type !== 'transport.position') return;
				this.onProgress?.(e.seconds, this.totalDuration);
			}),
			this.client.on('transport.state', (e: BridgeEvent) => {
				if (e.type !== 'transport.state') return;
				const s: EngineState =
					e.state === 'playing' ? 'playing' : e.state === 'paused' ? 'paused' : 'stopped';
				this.onStateChange?.(s);
			})
		);
	}

	async load(song: Song): Promise<void> {
		this.song = song;
		this.trackNotes = await generateNotesViaMultiTrackPlayer(song);

		const project = songToBridgeProject(song, this.trackNotes);
		this.totalDuration = computeTotalDuration(this.trackNotes, song.bpm || 120);

		try {
			await this.client.send({ type: 'project.load', project });
		} catch (e) {
			// Bridge unavailable in tests / disconnected — keep notes for visualizer
			// regardless so callers can still inspect them.
			console.warn('[bridge-engine] project.load failed', e);
		}
	}

	async play(): Promise<void> {
		await this.client.send({ type: 'transport.play' });
	}

	async pause(): Promise<void> {
		// Phase 2: Bridge has no pause; treat as stop.
		await this.client.send({ type: 'transport.stop' });
	}

	async stop(): Promise<void> {
		await this.client.send({ type: 'transport.stop' });
	}

	async seekTo(seconds: number): Promise<void> {
		const tick = secondsToTick(seconds, this.song?.bpm ?? 120);
		await this.client.send({ type: 'transport.seek', tick });
	}

	setVolume(_db: number): void {
		// Phase 2: master volume not yet exposed in protocol.
	}

	setTrackVolume(trackId: string, db: number): void {
		void this.client
			.send({
				type: 'project.patch',
				ops: [
					{
						op: 'replace',
						path: `/tracks/${escapePathSegment(trackId)}/volumeDb`,
						value: db
					}
				]
			})
			.catch((e) => console.warn('[bridge-engine] setTrackVolume failed', e));
	}

	setTrackMute(trackId: string, muted: boolean): void {
		void this.client
			.send({
				type: 'project.patch',
				ops: [
					{
						op: 'replace',
						path: `/tracks/${escapePathSegment(trackId)}/mute`,
						value: muted
					}
				]
			})
			.catch((e) => console.warn('[bridge-engine] setTrackMute failed', e));
	}

	setTrackSolo(trackId: string, solo: boolean): void {
		void this.client
			.send({
				type: 'project.patch',
				ops: [
					{
						op: 'replace',
						path: `/tracks/${escapePathSegment(trackId)}/solo`,
						value: solo
					}
				]
			})
			.catch((e) => console.warn('[bridge-engine] setTrackSolo failed', e));
	}

	getTrackNotes(trackId: string): MidiNote[] {
		return this.trackNotes.get(trackId) ?? [];
	}

	getAllTrackNotes(): Map<string, MidiNote[]> {
		return new Map(this.trackNotes);
	}

	dispose(): void {
		for (const u of this.unsubs) u();
		this.unsubs = [];
		this.client.send({ type: 'transport.stop' }).catch(() => {});
		this.song = null;
		this.trackNotes.clear();
	}
}

// ── Helpers ───────────────────────────────────────────

function computeTotalDuration(trackNotes: Map<string, MidiNote[]>, bpm: number): number {
	let maxTick = 0;
	for (const notes of trackNotes.values()) {
		for (const n of notes) {
			const end = n.startTick + n.durationTicks;
			if (end > maxTick) maxTick = end;
		}
	}
	return (maxTick / 480) * (60 / bpm);
}

function escapePathSegment(s: string): string {
	// JSON Pointer escaping per RFC 6901: ~ → ~0, / → ~1
	return s.replace(/~/g, '~0').replace(/\//g, '~1');
}

/**
 * Generate notes by running MultiTrackPlayer.load() and reading
 * getAllTrackNotes(). Disposes the player immediately after.
 *
 * This is the Option B reuse strategy: zero-touch on multi-track-player.ts.
 * Tradeoff: spins up Tone.Transport / Volume nodes briefly. Acceptable in
 * Phase 2 because BridgeEngine is only used when bridge is connected, which
 * already implies a browser context.
 */
async function generateNotesViaMultiTrackPlayer(
	song: Song
): Promise<Map<string, MidiNote[]>> {
	const { MultiTrackPlayer } = await import('$lib/multi-track-player');
	const player = new MultiTrackPlayer({});
	try {
		player.load(song);
		const notes = player.getAllTrackNotes();
		// Defensive copy — player.dispose() will clear its internals.
		const copy = new Map<string, MidiNote[]>();
		for (const [k, v] of notes) copy.set(k, [...v]);
		return copy;
	} finally {
		try {
			player.dispose();
		} catch {
			/* ignore */
		}
	}
}

// ── Dev hook ──────────────────────────────────────────

if (typeof window !== 'undefined' && import.meta.env.DEV) {
	(window as unknown as Record<string, unknown>).__bridgeDebug = {
		loadProjectAndPlay: async (song: Song) => {
			const engine = new BridgeEngine();
			await engine.load(song);
			await engine.play();
			return engine;
		}
	};
}
