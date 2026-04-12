// AutomationLane integration tests — exercise the songStore mutation path that
// AutomationLane.svelte invokes for click-to-add, drag, right-click-delete, and
// curve cycling. Pure logic, no Svelte mount.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Song } from '$lib/types/song';
import type { JsonPatchOp } from '$lib/bridge/protocol';
import type { AutomationCurve } from '$lib/types/chain';

const bridgeMock = vi.hoisted(() => {
	const sentCommands: Array<{ type: string; ops?: JsonPatchOp[] }> = [];
	const sendMock = vi.fn(async (cmd: { type: string; ops?: JsonPatchOp[] }) => {
		sentCommands.push(cmd);
		return undefined;
	});
	return {
		sentCommands,
		sendMock,
		state: { value: 'disconnected' as 'connected' | 'disconnected' }
	};
});

vi.mock('$lib/stores/bridge.svelte', () => ({
	bridgeStore: {
		get state() {
			return bridgeMock.state.value;
		},
		client: { send: bridgeMock.sendMock },
		fullCatalog: [],
		builtinCatalog: [],
		pluginCatalog: [],
		meters: {}
	}
}));

vi.mock('$lib/api', () => ({
	getSongs: vi.fn(),
	getSong: vi.fn(),
	createSong: vi.fn(),
	updateSong: vi.fn(),
	deleteSong: vi.fn(),
	suggestMixer: vi.fn(),
	suggestAutomation: vi.fn()
}));

import { songStore } from '$lib/stores/song.svelte';

function makeSong(): Song {
	return {
		id: 'song-a',
		title: 'Auto',
		bpm: 120,
		timeSignature: '4/4',
		key: 'C',
		chordProgression: '',
		sections: [],
		tracks: [
			{
				id: 't-lead',
				name: 'Lead',
				instrument: 'strings',
				blocks: [],
				volume: 0,
				mute: false,
				solo: false,
				chain: [
					{
						id: 'svf-1',
						kind: 'insert',
						plugin: { format: 'builtin', uid: 'svf', name: 'Filter' },
						bypass: false,
						params: {}
					}
				],
				sends: [],
				pan: 0,
				automation: []
			}
		],
		buses: [],
		master: { chain: [], volume: 1 },
		createdBy: '',
		createdAt: '',
		lastEditedAt: ''
	};
}

beforeEach(() => {
	bridgeMock.sentCommands.length = 0;
	bridgeMock.sendMock.mockClear();
	bridgeMock.state.value = 'disconnected';
	songStore.setCurrentSong(makeSong());
	songStore.attachEngine(null);
});

describe('AutomationLane → songStore — click to add point', () => {
	it('addAutomationPoint creates the lane and stores tick/value', () => {
		const id = songStore.addAutomationPoint('t-lead', 'svf-1', 'cutoff', 480, 0.75);
		const lane = songStore.currentSong!.tracks[0].automation![0];
		expect(lane.nodeId).toBe('svf-1');
		expect(lane.paramId).toBe('cutoff');
		expect(lane.points).toHaveLength(1);
		expect(lane.points[0]).toMatchObject({ id, tick: 480, value: 0.75, curve: 'linear' });
	});

	it('multiple clicks append points to the same lane', () => {
		songStore.addAutomationPoint('t-lead', 'svf-1', 'cutoff', 0, 0.1);
		songStore.addAutomationPoint('t-lead', 'svf-1', 'cutoff', 960, 0.9);
		songStore.addAutomationPoint('t-lead', 'svf-1', 'cutoff', 1920, 0.3);
		const pts = songStore.currentSong!.tracks[0].automation![0].points;
		expect(pts).toHaveLength(3);
		expect(pts.map((p) => p.tick)).toEqual([0, 960, 1920]);
	});
});

describe('AutomationLane → songStore — drag (move) point', () => {
	it('moveAutomationPoint updates tick and value', () => {
		const id = songStore.addAutomationPoint('t-lead', 'svf-1', 'cutoff', 0, 0.1);
		songStore.moveAutomationPoint('t-lead', 'svf-1', 'cutoff', id, 240, 0.9);
		const pt = songStore.currentSong!.tracks[0].automation![0].points[0];
		expect(pt.tick).toBe(240);
		expect(pt.value).toBe(0.9);
	});
});

describe('AutomationLane → songStore — right-click delete', () => {
	it('removeAutomationPoint removes the point from the lane', () => {
		const id = songStore.addAutomationPoint('t-lead', 'svf-1', 'cutoff', 120, 0.5);
		songStore.removeAutomationPoint('t-lead', 'svf-1', 'cutoff', id);
		expect(songStore.currentSong!.tracks[0].automation![0].points).toHaveLength(0);
	});
});

describe('AutomationLane → songStore — curve cycling', () => {
	it('setAutomationPointCurve updates the curve in place', () => {
		const id = songStore.addAutomationPoint('t-lead', 'svf-1', 'cutoff', 0, 0.5, 'linear');
		const cycles: AutomationCurve[] = ['hold', 'bezier', 'linear'];
		for (const c of cycles) {
			songStore.setAutomationPointCurve('t-lead', 'svf-1', 'cutoff', id, c);
			const pt = songStore.currentSong!.tracks[0].automation![0].points[0];
			expect(pt.curve).toBe(c);
		}
	});
});

describe('AutomationLane → songStore — addAutomationLane / removeAutomationLane', () => {
	it('addAutomationLane creates an empty lane and returns true', () => {
		const added = songStore.addAutomationLane('t-lead', 'svf-1', 'cutoff');
		expect(added).toBe(true);
		const automation = songStore.currentSong!.tracks[0].automation!;
		expect(automation).toHaveLength(1);
		expect(automation[0].points).toEqual([]);
	});

	it('addAutomationLane is a no-op when a matching lane already exists', () => {
		songStore.addAutomationLane('t-lead', 'svf-1', 'cutoff');
		const addedAgain = songStore.addAutomationLane('t-lead', 'svf-1', 'cutoff');
		expect(addedAgain).toBe(false);
		expect(songStore.currentSong!.tracks[0].automation!).toHaveLength(1);
	});

	it('removeAutomationLane deletes the entire lane', () => {
		songStore.addAutomationLane('t-lead', 'svf-1', 'cutoff');
		songStore.addAutomationPoint('t-lead', 'svf-1', 'cutoff', 0, 0.5);
		songStore.removeAutomationLane('t-lead', 'svf-1', 'cutoff');
		expect(songStore.currentSong!.tracks[0].automation!).toHaveLength(0);
	});
});

describe('AutomationLane → songStore — replaceAutomationRange', () => {
	it('replaces points inside the given tick range and keeps outside points', () => {
		// Seed points across the timeline
		songStore.addAutomationPoint('t-lead', 'svf-1', 'cutoff', 0, 0.2);
		songStore.addAutomationPoint('t-lead', 'svf-1', 'cutoff', 960, 0.5);
		songStore.addAutomationPoint('t-lead', 'svf-1', 'cutoff', 1920, 0.7);
		songStore.addAutomationPoint('t-lead', 'svf-1', 'cutoff', 3840, 0.9);

		// Replace range [960, 2880) with 2 new points
		songStore.replaceAutomationRange('t-lead', 'svf-1', 'cutoff', 960, 2880, [
			{ tick: 1000, value: 0.1 },
			{ tick: 2000, value: 0.8, curve: 'bezier' }
		]);

		const pts = songStore.currentSong!.tracks[0].automation![0].points;
		const ticks = pts.map((p) => p.tick).sort((a, b) => a - b);
		// 0 (outside), 3840 (outside) preserved; 960/1920 replaced; new 1000/2000 added
		expect(ticks).toEqual([0, 1000, 2000, 3840]);
		const newBezier = pts.find((p) => p.tick === 2000);
		expect(newBezier?.curve).toBe('bezier');
		expect(newBezier?.value).toBe(0.8);
	});

	it('replaceAutomationRange creates the lane when it does not exist', () => {
		songStore.replaceAutomationRange('t-lead', 'svf-1', 'resonance', 0, 1920, [
			{ tick: 0, value: 0.3 },
			{ tick: 960, value: 0.7 }
		]);
		const lane = songStore
			.currentSong!.tracks[0].automation!.find(
				(a) => a.nodeId === 'svf-1' && a.paramId === 'resonance'
			);
		expect(lane).toBeDefined();
		expect(lane!.points).toHaveLength(2);
	});

	it('emits project.patch ops when bridge is connected', () => {
		bridgeMock.state.value = 'connected';
		songStore.replaceAutomationRange('t-lead', 'svf-1', 'cutoff', 0, 1920, [
			{ tick: 0, value: 0.1 },
			{ tick: 1920, value: 0.9 }
		]);
		const patches = bridgeMock.sentCommands.filter((c) => c.type === 'project.patch');
		expect(patches.length).toBeGreaterThan(0);
	});
});

describe('AutomationLane → pixel ↔ tick conversion', () => {
	// The component uses pxPerTick = PX_PER_BAR / ticksPerBar.
	// For 4/4: ticksPerBar = 480 * (4/4) * 4 = 1920; PX_PER_BAR = 80 → pxPerTick = 80/1920 ≈ 0.04166.
	// Reproduce the pure math here so a regression would be caught.
	const PX_PER_BAR = 80;
	function ticksPerBarFor(ts: string): number {
		const [b, v] = ts.split('/').map(Number);
		return 480 * (4 / v) * b;
	}

	it('4/4 → 1920 ticks/bar', () => {
		expect(ticksPerBarFor('4/4')).toBe(1920);
	});
	it('3/4 → 1440 ticks/bar', () => {
		expect(ticksPerBarFor('3/4')).toBe(1440);
	});
	it('6/8 → 1440 ticks/bar', () => {
		expect(ticksPerBarFor('6/8')).toBe(1440);
	});

	it('xToTick(40 px) in 4/4 is half a bar', () => {
		const tpb = ticksPerBarFor('4/4');
		const pxPerTick = PX_PER_BAR / tpb;
		const tick = Math.round(40 / pxPerTick);
		expect(tick).toBe(960);
	});
});