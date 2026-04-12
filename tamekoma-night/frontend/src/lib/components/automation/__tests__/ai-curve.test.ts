// AiCurveButton / AutomationTab AI flow — mock suggestAutomation and verify
// the preview → apply path writes points via replaceAutomationRange and
// preserves outside-of-range points.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Song } from '$lib/types/song';
import type { JsonPatchOp } from '$lib/bridge/protocol';
import type { AutomationSuggestResponse } from '$lib/api';

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

const apiMock = vi.hoisted(() => {
	return {
		suggestAutomation: vi.fn<
			(req: {
				trackId: string;
				nodeId: string;
				paramId: string;
				startTick: number;
				endTick: number;
				prompt: string;
				bpmBpb: [number, number];
			}) => Promise<AutomationSuggestResponse>
		>()
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
	suggestAutomation: apiMock.suggestAutomation
}));

import { songStore } from '$lib/stores/song.svelte';
import { suggestAutomation } from '$lib/api';

function makeSong(): Song {
	return {
		id: 'song-ai',
		title: 'AI Curve Test',
		bpm: 128,
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
	apiMock.suggestAutomation.mockReset();
	songStore.setCurrentSong(makeSong());
	songStore.attachEngine(null);
});

describe('AI curve — suggestAutomation request shape', () => {
	it('sends trackId / nodeId / paramId / tick range / prompt / bpmBpb', async () => {
		apiMock.suggestAutomation.mockResolvedValue({
			explanation: 'noop',
			points: []
		});
		await suggestAutomation({
			trackId: 't-lead',
			nodeId: 'svf-1',
			paramId: 'cutoff',
			startTick: 0,
			endTick: 3840,
			prompt: 'Drop 前のスイープ',
			bpmBpb: [128, 4]
		});
		expect(apiMock.suggestAutomation).toHaveBeenCalledWith(
			expect.objectContaining({
				trackId: 't-lead',
				nodeId: 'svf-1',
				paramId: 'cutoff',
				startTick: 0,
				endTick: 3840,
				prompt: 'Drop 前のスイープ',
				bpmBpb: [128, 4]
			})
		);
	});
});

describe('AI curve — preview → apply writes points via replaceAutomationRange', () => {
	it('apply replaces [startTick, endTick) and preserves outside points', async () => {
		// Seed existing points at tick 0 (outside range) and 960 (inside range)
		songStore.addAutomationPoint('t-lead', 'svf-1', 'cutoff', 0, 0.2);
		songStore.addAutomationPoint('t-lead', 'svf-1', 'cutoff', 960, 0.5);
		songStore.addAutomationPoint('t-lead', 'svf-1', 'cutoff', 4000, 0.9); // outside

		apiMock.suggestAutomation.mockResolvedValue({
			explanation: 'sweep up',
			points: [
				{ tick: 500, value: 0.1, curve: 'linear' },
				{ tick: 1500, value: 0.8, curve: 'bezier' },
				{ tick: 2500, value: 0.95, curve: 'hold' }
			]
		});

		// Simulate the AutomationTab flow: fetch suggestion → replace range
		const res = await suggestAutomation({
			trackId: 't-lead',
			nodeId: 'svf-1',
			paramId: 'cutoff',
			startTick: 480,
			endTick: 2880,
			prompt: 'sweep',
			bpmBpb: [128, 4]
		});
		songStore.replaceAutomationRange(
			't-lead',
			'svf-1',
			'cutoff',
			480,
			2880,
			res.points.map((p) => ({ tick: p.tick, value: p.value, curve: p.curve }))
		);

		const pts = songStore.currentSong!.tracks[0].automation![0].points;
		const ticks = pts.map((p) => p.tick).sort((a, b) => a - b);
		// 0 (outside), 4000 (outside) kept; 960 replaced; 500/1500/2500 added
		expect(ticks).toEqual([0, 500, 1500, 2500, 4000]);
		const bezPoint = pts.find((p) => p.tick === 1500);
		expect(bezPoint?.curve).toBe('bezier');
	});

	it('cancel flow leaves existing points untouched', async () => {
		songStore.addAutomationPoint('t-lead', 'svf-1', 'cutoff', 960, 0.5);

		apiMock.suggestAutomation.mockResolvedValue({
			explanation: 'test',
			points: [{ tick: 1000, value: 0.9, curve: 'linear' }]
		});

		// Fetch the suggestion but do NOT apply it — AutomationTab drops the preview.
		await suggestAutomation({
			trackId: 't-lead',
			nodeId: 'svf-1',
			paramId: 'cutoff',
			startTick: 0,
			endTick: 3840,
			prompt: 'cancel test',
			bpmBpb: [128, 4]
		});

		const pts = songStore.currentSong!.tracks[0].automation![0].points;
		expect(pts).toHaveLength(1);
		expect(pts[0].tick).toBe(960);
		expect(pts[0].value).toBe(0.5);
	});
});

describe('AI curve — error propagation', () => {
	it('API error surfaces to caller for UI to render', async () => {
		apiMock.suggestAutomation.mockRejectedValue(new Error('Rate limited'));
		await expect(
			suggestAutomation({
				trackId: 't-lead',
				nodeId: 'svf-1',
				paramId: 'cutoff',
				startTick: 0,
				endTick: 3840,
				prompt: 'x',
				bpmBpb: [128, 4]
			})
		).rejects.toThrow('Rate limited');
	});
});

describe('AI curve — tick range math', () => {
	// The AiCurveButton computes:
	//   startTick = (fromBar - 1) * ticksPerBar
	//   endTick   = toBar * ticksPerBar
	// where ticksPerBar depends on time signature.
	const TPB_4_4 = 480 * (4 / 4) * 4; // 1920

	it('fromBar=1 toBar=4 in 4/4 → [0, 7680)', () => {
		const startTick = (1 - 1) * TPB_4_4;
		const endTick = 4 * TPB_4_4;
		expect(startTick).toBe(0);
		expect(endTick).toBe(7680);
	});

	it('fromBar=5 toBar=8 in 4/4 → [7680, 15360)', () => {
		const startTick = (5 - 1) * TPB_4_4;
		const endTick = 8 * TPB_4_4;
		expect(startTick).toBe(7680);
		expect(endTick).toBe(15360);
	});

	it('fromBar=4 toBar=8 in 4/4 → covers bars 4..8 inclusive (5 bars)', () => {
		const startTick = (4 - 1) * TPB_4_4;
		const endTick = 8 * TPB_4_4;
		// (fromBar-1) → start; toBar → end gives toBar - (fromBar-1) = 5 bars.
		expect(endTick - startTick).toBe((8 - (4 - 1)) * TPB_4_4);
		expect((endTick - startTick) / TPB_4_4).toBe(5);
	});
});