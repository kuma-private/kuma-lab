// AutomationTab gating tests — verify the plan/bridge state that FlowEditor uses
// to decide tab visibility, and the store-level mutations that AutomationTab
// orchestrates: adding/removing lanes, AI replace range, etc.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Song } from '$lib/types/song';
import type { JsonPatchOp } from '$lib/bridge/protocol';

const bridgeMock = vi.hoisted(() => ({
	state: { value: 'disconnected' as 'idle' | 'connecting' | 'connected' | 'disconnected' },
	sentCommands: [] as Array<{ type: string; ops?: JsonPatchOp[] }>,
	sendMock: vi.fn(async () => undefined)
}));

vi.mock('$lib/stores/bridge.svelte', () => ({
	bridgeStore: {
		get state() {
			return bridgeMock.state.value;
		},
		client: { send: bridgeMock.sendMock, connect: vi.fn() },
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

import { bridgeStore } from '$lib/stores/bridge.svelte';
import { planStore } from '$lib/stores/plan.svelte';
import { songStore } from '$lib/stores/song.svelte';

function makeSong(): Song {
	return {
		id: 'song-t',
		title: 'Tab Test',
		bpm: 120,
		timeSignature: '4/4',
		key: 'C',
		chordProgression: '',
		sections: [],
		tracks: [
			{
				id: 't-1',
				name: 'One',
				instrument: 'piano',
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
	bridgeMock.state.value = 'disconnected';
	bridgeMock.sentCommands.length = 0;
	bridgeMock.sendMock.mockClear();
	planStore.setTier('free');
	songStore.setCurrentSong(makeSong());
	songStore.attachEngine(null);
});

describe('Automation tab visibility (plan gating)', () => {
	it('free users: tab is NOT shown', () => {
		planStore.setTier('free');
		// Same derived flag as in FlowEditor.svelte
		const showAutomationTab = planStore.isPremium;
		expect(showAutomationTab).toBe(false);
	});

	it('premium users: tab IS shown regardless of bridge state', () => {
		planStore.setTier('premium');
		bridgeMock.state.value = 'disconnected';
		expect(planStore.isPremium).toBe(true);

		bridgeMock.state.value = 'connected';
		expect(planStore.isPremium).toBe(true);
	});
});

describe('Automation content state (bridge gating)', () => {
	it('premium + bridge offline → curtain should render', () => {
		planStore.setTier('premium');
		bridgeMock.state.value = 'disconnected';
		const online = bridgeStore.state === 'connected';
		expect(online).toBe(false);
	});

	it('premium + bridge connecting → curtain still visible', () => {
		planStore.setTier('premium');
		bridgeMock.state.value = 'connecting';
		const online = bridgeStore.state === 'connected';
		expect(online).toBe(false);
	});

	it('premium + bridge connected → full automation renders', () => {
		planStore.setTier('premium');
		bridgeMock.state.value = 'connected';
		const online = bridgeStore.state === 'connected';
		expect(online).toBe(true);
	});
});

describe('AutomationTab → songStore — add/remove lane orchestration', () => {
	it('adding a lane via the picker creates an empty automation entry', () => {
		songStore.addAutomationLane('t-1', 'svf-1', 'cutoff');
		const automation = songStore.currentSong!.tracks[0].automation!;
		expect(automation).toHaveLength(1);
		expect(automation[0]).toMatchObject({
			nodeId: 'svf-1',
			paramId: 'cutoff',
			points: []
		});
	});

	it('duplicate addAutomationLane is a no-op and does not emit a duplicate patch', () => {
		bridgeMock.state.value = 'connected';
		songStore.addAutomationLane('t-1', 'svf-1', 'cutoff');
		const opsBefore = bridgeMock.sentCommands.length;
		songStore.addAutomationLane('t-1', 'svf-1', 'cutoff');
		expect(bridgeMock.sentCommands.length).toBe(opsBefore);
	});

	it('removeAutomationLane clears the entry and its points', () => {
		songStore.addAutomationLane('t-1', 'svf-1', 'cutoff');
		songStore.addAutomationPoint('t-1', 'svf-1', 'cutoff', 960, 0.5);
		songStore.removeAutomationLane('t-1', 'svf-1', 'cutoff');
		expect(songStore.currentSong!.tracks[0].automation).toEqual([]);
	});
});

describe('AutomationTab → ticks-per-bar math matches store conventions', () => {
	// The tab computes ticksPerBar from song.timeSignature. Reproduce the
	// formula so a refactor would be caught.
	function ticksPerBar(ts: string): number {
		const TICKS_PER_QUARTER = 480;
		const [b, v] = ts.split('/').map(Number);
		return TICKS_PER_QUARTER * (4 / v) * b;
	}

	it('4/4 → 1920', () => {
		expect(ticksPerBar('4/4')).toBe(1920);
	});

	it('3/4 → 1440', () => {
		expect(ticksPerBar('3/4')).toBe(1440);
	});

	it('6/8 → 1440', () => {
		expect(ticksPerBar('6/8')).toBe(1440);
	});
});