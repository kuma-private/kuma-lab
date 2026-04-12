import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BridgeEvent } from '$lib/bridge/protocol';
import type { MidiNote, Song } from '$lib/types/song';

// ── Mock bridge store ──────────────────────────────────

type EvHandler = (ev: BridgeEvent) => void;

const mocks = vi.hoisted(() => {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const sentCommands: any[] = [];
	const eventHandlers = new Map<string, Set<(ev: unknown) => void>>();
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const sendMock = vi.fn(async (cmd: any) => {
		sentCommands.push(cmd);
		return undefined;
	});
	const FAKE_NOTES_PIANO = [
		{ midi: 60, startTick: 0, durationTicks: 480, velocity: 90, channel: 0 },
		{ midi: 64, startTick: 480, durationTicks: 480, velocity: 80, channel: 0 }
	];
	const FAKE_NOTES_BASS = [
		{ midi: 36, startTick: 0, durationTicks: 1920, velocity: 100, channel: 1 }
	];
	const playerLoadMock = vi.fn();
	const playerDisposeMock = vi.fn();
	return {
		sentCommands,
		eventHandlers,
		sendMock,
		FAKE_NOTES_PIANO,
		FAKE_NOTES_BASS,
		playerLoadMock,
		playerDisposeMock
	};
});

vi.mock('$lib/stores/bridge.svelte', () => {
	return {
		bridgeStore: {
			client: {
				send: mocks.sendMock,
				on: (type: string, handler: (ev: unknown) => void) => {
					let set = mocks.eventHandlers.get(type);
					if (!set) {
						set = new Set();
						mocks.eventHandlers.set(type, set);
					}
					set.add(handler);
					return () => set!.delete(handler);
				}
			}
		}
	};
});

vi.mock('$lib/multi-track-player', () => {
	return {
		MultiTrackPlayer: class {
			load = mocks.playerLoadMock;
			dispose = mocks.playerDisposeMock;
			getAllTrackNotes() {
				const m = new Map();
				m.set('track-piano', mocks.FAKE_NOTES_PIANO);
				m.set('track-bass', mocks.FAKE_NOTES_BASS);
				return m;
			}
		}
	};
});

const { sentCommands, eventHandlers, sendMock, playerLoadMock, playerDisposeMock } = mocks;
const FAKE_NOTES_PIANO = mocks.FAKE_NOTES_PIANO as MidiNote[];
const FAKE_NOTES_BASS = mocks.FAKE_NOTES_BASS as MidiNote[];

import { BridgeEngine } from '../bridge-engine';

const FAKE_SONG: Song = {
	id: 'song-1',
	title: 'Test',
	bpm: 120,
	timeSignature: '4/4',
	key: 'C',
	chordProgression: '',
	sections: [],
	tracks: [
		{
			id: 'track-piano',
			name: 'Piano',
			instrument: 'piano',
			blocks: [],
			volume: 0,
			mute: false,
			solo: false
		},
		{
			id: 'track-bass',
			name: 'Bass',
			instrument: 'bass',
			blocks: [],
			volume: 0,
			mute: false,
			solo: false
		}
	],
	createdBy: '',
	createdAt: '',
	lastEditedAt: ''
};

function emit(type: string, ev: BridgeEvent) {
	const set = eventHandlers.get(type);
	if (!set) return;
	for (const h of set) h(ev);
}

beforeEach(() => {
	sentCommands.length = 0;
	sendMock.mockClear();
	playerLoadMock.mockClear();
	playerDisposeMock.mockClear();
});

describe('BridgeEngine', () => {
	it('reports kind=bridge', () => {
		const e = new BridgeEngine();
		expect(e.kind).toBe('bridge');
		e.dispose();
	});

	it('load() runs MultiTrackPlayer pipeline and sends project.load', async () => {
		const e = new BridgeEngine();
		await e.load(FAKE_SONG);

		expect(playerLoadMock).toHaveBeenCalledWith(FAKE_SONG);
		expect(playerDisposeMock).toHaveBeenCalled();

		const projectLoad = sentCommands.find((c) => c.type === 'project.load');
		expect(projectLoad).toBeDefined();
		if (projectLoad?.type !== 'project.load') throw new Error('unreachable');
		expect(projectLoad.project.bpm).toBe(120);
		expect(projectLoad.project.tracks).toHaveLength(2);
		expect(projectLoad.project.tracks[0].id).toBe('track-piano');
		expect(projectLoad.project.tracks[0].clips[0].notes).toHaveLength(2);

		// totalDuration across all tracks: bass note ends at 1920 ticks
		// = 4 quarters @ 120 bpm => 2.0s
		expect(e.totalDuration).toBeCloseTo(2.0, 6);

		e.dispose();
	});

	it('exposes generated notes via getTrackNotes / getAllTrackNotes', async () => {
		const e = new BridgeEngine();
		await e.load(FAKE_SONG);

		expect(e.getTrackNotes('track-piano')).toEqual(FAKE_NOTES_PIANO);
		expect(e.getTrackNotes('track-bass')).toEqual(FAKE_NOTES_BASS);

		const all = e.getAllTrackNotes();
		expect(all.size).toBe(2);
		expect(all.get('track-piano')).toEqual(FAKE_NOTES_PIANO);

		e.dispose();
	});

	it('play / pause / stop send the right transport commands', async () => {
		const e = new BridgeEngine();
		await e.load(FAKE_SONG);
		sentCommands.length = 0;

		await e.play();
		expect(sentCommands[0]).toEqual({ type: 'transport.play' });

		await e.pause();
		expect(sentCommands[1]).toEqual({ type: 'transport.stop' });

		await e.stop();
		expect(sentCommands[2]).toEqual({ type: 'transport.stop' });

		e.dispose();
	});

	it('seekTo converts seconds → tick at the song bpm', async () => {
		const e = new BridgeEngine();
		await e.load(FAKE_SONG);
		sentCommands.length = 0;

		await e.seekTo(0.5);
		const seek = sentCommands[0];
		expect(seek.type).toBe('transport.seek');
		if (seek.type !== 'transport.seek') throw new Error('unreachable');
		// 0.5s @ 120 bpm = 1 quarter = 480 ticks
		expect(seek.tick).toBe(480);

		e.dispose();
	});

	it('setTrackVolume / setTrackMute / setTrackSolo are no-ops (songStore owns patches in Phase 3)', async () => {
		const e = new BridgeEngine();
		await e.load(FAKE_SONG);
		sentCommands.length = 0;

		e.setTrackVolume('track-piano', -6);
		e.setTrackMute('track-bass', true);
		e.setTrackSolo('track-piano', true);

		// fire-and-forget — wait one microtask tick
		await Promise.resolve();

		const patches = sentCommands.filter((c) => c.type === 'project.patch');
		expect(patches.length).toBe(0);

		e.dispose();
	});

	it('transport.position event invokes onProgress with seconds and totalDuration', async () => {
		const e = new BridgeEngine();
		await e.load(FAKE_SONG);

		const onProgress = vi.fn();
		e.onProgress = onProgress;

		emit('transport.position', { type: 'transport.position', tick: 240, seconds: 0.25 });
		expect(onProgress).toHaveBeenCalledWith(0.25, e.totalDuration);

		e.dispose();
	});

	it('transport.state event maps to EngineState callback', async () => {
		const e = new BridgeEngine();
		const onState = vi.fn();
		e.onStateChange = onState;

		emit('transport.state', { type: 'transport.state', state: 'playing' });
		emit('transport.state', { type: 'transport.state', state: 'paused' });
		emit('transport.state', { type: 'transport.state', state: 'stopped' });

		expect(onState).toHaveBeenNthCalledWith(1, 'playing');
		expect(onState).toHaveBeenNthCalledWith(2, 'paused');
		expect(onState).toHaveBeenNthCalledWith(3, 'stopped');

		e.dispose();
	});

	it('dispose() unsubscribes event handlers and sends a final stop', async () => {
		const e = new BridgeEngine();
		const onState = vi.fn();
		e.onStateChange = onState;
		e.dispose();

		// After dispose, events should no longer reach the engine.
		emit('transport.state', { type: 'transport.state', state: 'playing' });
		expect(onState).not.toHaveBeenCalled();

		// And a stop should have been issued.
		expect(sentCommands.some((c) => c.type === 'transport.stop')).toBe(true);
	});
});
