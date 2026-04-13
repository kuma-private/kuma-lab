import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Song } from '$lib/types/song';
import type { JsonPatchOp } from '$lib/bridge/protocol';

// ── Bridge mock state ──────────────────────────────────

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

vi.mock('$lib/stores/bridge.svelte', () => {
	return {
		bridgeStore: {
			get state() {
				return bridgeMock.state.value;
			},
			client: { send: bridgeMock.sendMock }
		}
	};
});

vi.mock('$lib/api', () => ({
	getSongs: vi.fn(),
	getSong: vi.fn(),
	createSong: vi.fn(),
	updateSong: vi.fn(),
	deleteSong: vi.fn()
}));

// Import after mocks
import { songStore } from '../song.svelte';

// ── Helpers ─────────────────────────────────────────────

function makeSong(): Song {
	return {
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
				solo: false,
				chain: [],
				sends: [],
				pan: 0,
				automation: []
			},
			{
				id: 'track-bass',
				name: 'Bass',
				instrument: 'bass',
				blocks: [],
				volume: 0,
				mute: false,
				solo: false,
				chain: [],
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

function lastPatchOps(): JsonPatchOp[] {
	const last = [...bridgeMock.sentCommands].reverse().find((c) => c.type === 'project.patch');
	return last?.ops ?? [];
}

beforeEach(() => {
	bridgeMock.sentCommands.length = 0;
	bridgeMock.sendMock.mockClear();
	bridgeMock.state.value = 'disconnected';
	songStore.setCurrentSong(makeSong());
	songStore.attachEngine(null);
});

// ── Track mutations ────────────────────────────────────

describe('songStore — track-level mutations', () => {
	it('setTrackVolume updates state and emits replace op when bridge connected', () => {
		bridgeMock.state.value = 'connected';
		songStore.setTrackVolume('track-piano', -6);

		expect(songStore.currentSong?.tracks[0].volume).toBe(-6);
		expect(bridgeMock.sendMock).toHaveBeenCalledTimes(1);
		expect(lastPatchOps()).toEqual([
			{ op: 'replace', path: '/tracks/track-piano/volumeDb', value: -6 }
		]);
	});

	it('setTrackVolume updates state but does not emit when disconnected', () => {
		songStore.setTrackVolume('track-piano', -3);
		expect(songStore.currentSong?.tracks[0].volume).toBe(-3);
		expect(bridgeMock.sendMock).not.toHaveBeenCalled();
	});

	it('setTrackMute / setTrackSolo / setTrackPan update state and emit ops', () => {
		bridgeMock.state.value = 'connected';
		songStore.setTrackMute('track-bass', true);
		songStore.setTrackSolo('track-piano', true);
		songStore.setTrackPan('track-piano', -0.5);

		const piano = songStore.currentSong!.tracks[0];
		const bass = songStore.currentSong!.tracks[1];
		expect(bass.mute).toBe(true);
		expect(piano.solo).toBe(true);
		expect(piano.pan).toBe(-0.5);

		const allOps = bridgeMock.sentCommands.flatMap((c) => c.ops ?? []);
		expect(allOps).toContainEqual({
			op: 'replace',
			path: '/tracks/track-bass/mute',
			value: true
		});
		expect(allOps).toContainEqual({
			op: 'replace',
			path: '/tracks/track-piano/solo',
			value: true
		});
		expect(allOps).toContainEqual({
			op: 'replace',
			path: '/tracks/track-piano/pan',
			value: -0.5
		});
	});

	it('setTrackVolume forwards to attached engine for real-time feedback', () => {
		const engineMock = {
			kind: 'tone' as const,
			totalDuration: 0,
			load: vi.fn(),
			play: vi.fn(),
			pause: vi.fn(),
			stop: vi.fn(),
			seekTo: vi.fn(),
			setVolume: vi.fn(),
			setTrackVolume: vi.fn(),
			setTrackMute: vi.fn(),
			setTrackSolo: vi.fn(),
			getTrackNotes: vi.fn(() => []),
			getAllTrackNotes: vi.fn(() => new Map()),
			dispose: vi.fn()
		};
		songStore.attachEngine(engineMock);
		songStore.setTrackVolume('track-piano', -8);
		expect(engineMock.setTrackVolume).toHaveBeenCalledWith('track-piano', -8);
	});
});

// ── Chain mutations ────────────────────────────────────

describe('songStore — chain mutations', () => {
	it('addChainNode creates a node, appends to chain, returns id, emits add-op with append (-) syntax', () => {
		bridgeMock.state.value = 'connected';
		const id = songStore.addChainNode('track-piano', 0, {
			format: 'clap',
			uid: 'com.x/foo',
			name: 'Foo'
		});

		expect(typeof id).toBe('string');
		const piano = songStore.currentSong!.tracks[0];
		expect(piano.chain).toHaveLength(1);
		expect(piano.chain![0].id).toBe(id);
		expect(piano.chain![0].plugin.uid).toBe('com.x/foo');

		const ops = lastPatchOps();
		expect(ops).toHaveLength(1);
		expect(ops[0].op).toBe('add');
		expect(ops[0].path).toBe('/tracks/track-piano/chain/-');
		expect((ops[0] as Extract<JsonPatchOp, { op: 'add' }>).value).toMatchObject({
			id,
			kind: 'insert',
			plugin: { format: 'clap', uid: 'com.x/foo', name: 'Foo' },
			bypass: false,
			params: {}
		});
	});

	it('removeChainNode removes by id and emits remove-op with id-based path', () => {
		bridgeMock.state.value = 'connected';
		const id = songStore.addChainNode('track-piano', 0, {
			format: 'vst3',
			uid: 'plug',
			name: 'P'
		});
		bridgeMock.sendMock.mockClear();
		bridgeMock.sentCommands.length = 0;

		songStore.removeChainNode('track-piano', id);

		expect(songStore.currentSong!.tracks[0].chain).toHaveLength(0);
		expect(lastPatchOps()).toEqual([
			{ op: 'remove', path: `/tracks/track-piano/chain/${id}` }
		]);
	});

	it('setChainBypass updates bypass and emits replace-op', () => {
		bridgeMock.state.value = 'connected';
		const id = songStore.addChainNode('track-piano', 0, {
			format: 'clap',
			uid: 'a',
			name: 'A'
		});
		bridgeMock.sendMock.mockClear();
		bridgeMock.sentCommands.length = 0;

		songStore.setChainBypass('track-piano', id, true);
		expect(songStore.currentSong!.tracks[0].chain![0].bypass).toBe(true);
		expect(lastPatchOps()).toEqual([
			{ op: 'replace', path: `/tracks/track-piano/chain/${id}/bypass`, value: true }
		]);
	});

	it('setChainParam updates params dict and emits escaped replace-op', () => {
		bridgeMock.state.value = 'connected';
		const id = songStore.addChainNode('track-piano', 0, {
			format: 'clap',
			uid: 'a',
			name: 'A'
		});
		bridgeMock.sendMock.mockClear();
		bridgeMock.sentCommands.length = 0;

		songStore.setChainParam('track-piano', id, 'gain/db', 0.7);

		expect(songStore.currentSong!.tracks[0].chain![0].params['gain/db']).toBe(0.7);
		// '/' in paramId must be escaped to ~1
		expect(lastPatchOps()).toEqual([
			{
				op: 'replace',
				path: `/tracks/track-piano/chain/${id}/params/gain~1db`,
				value: 0.7
			}
		]);
	});
});

// ── Send mutations ─────────────────────────────────────

describe('songStore — send mutations', () => {
	it('addSend appends to sends, returns id, emits add-op', () => {
		bridgeMock.state.value = 'connected';
		const sendId = songStore.addSend('track-piano', 'bus-rev', 0.4, false);
		const piano = songStore.currentSong!.tracks[0];
		expect(piano.sends).toHaveLength(1);
		expect(piano.sends![0]).toEqual({
			id: sendId,
			destBusId: 'bus-rev',
			level: 0.4,
			pre: false
		});
		expect(lastPatchOps()[0]).toMatchObject({
			op: 'add',
			path: '/tracks/track-piano/sends/-'
		});
	});

	it('setSendLevel updates level and emits replace-op', () => {
		bridgeMock.state.value = 'connected';
		const sendId = songStore.addSend('track-piano', 'bus-rev', 0.2);
		bridgeMock.sentCommands.length = 0;

		songStore.setSendLevel('track-piano', sendId, 0.8);

		expect(songStore.currentSong!.tracks[0].sends![0].level).toBe(0.8);
		expect(lastPatchOps()).toEqual([
			{
				op: 'replace',
				path: `/tracks/track-piano/sends/${sendId}/level`,
				value: 0.8
			}
		]);
	});

	it('removeSend deletes the send and emits remove-op', () => {
		bridgeMock.state.value = 'connected';
		const sendId = songStore.addSend('track-piano', 'bus-rev', 0.2);
		bridgeMock.sentCommands.length = 0;

		songStore.removeSend('track-piano', sendId);

		expect(songStore.currentSong!.tracks[0].sends).toHaveLength(0);
		expect(lastPatchOps()).toEqual([
			{ op: 'remove', path: `/tracks/track-piano/sends/${sendId}` }
		]);
	});
});

// ── Automation mutations ───────────────────────────────

describe('songStore — automation mutations', () => {
	it('addAutomationPoint creates lane on demand and appends a point with id', () => {
		bridgeMock.state.value = 'connected';
		const pointId = songStore.addAutomationPoint(
			'track-piano',
			'node-1',
			'cutoff',
			480,
			0.55,
			'linear'
		);

		const piano = songStore.currentSong!.tracks[0];
		expect(piano.automation).toHaveLength(1);
		const lane = piano.automation![0];
		expect(lane.nodeId).toBe('node-1');
		expect(lane.paramId).toBe('cutoff');
		expect(lane.points).toHaveLength(1);
		expect(lane.points[0]).toEqual({
			id: pointId,
			tick: 480,
			value: 0.55,
			curve: 'linear'
		});

		expect(lastPatchOps()).toEqual([
			{
				op: 'add',
				path: '/tracks/track-piano/automation/node-1/cutoff/points/-',
				value: { id: pointId, tick: 480, value: 0.55, curve: 'linear' }
			}
		]);
	});

	it('moveAutomationPoint updates tick/value and emits replace-op', () => {
		bridgeMock.state.value = 'connected';
		const pointId = songStore.addAutomationPoint('track-piano', 'n', 'p', 0, 0);
		bridgeMock.sentCommands.length = 0;

		songStore.moveAutomationPoint('track-piano', 'n', 'p', pointId, 240, 0.9);

		const point = songStore.currentSong!.tracks[0].automation![0].points[0];
		expect(point.tick).toBe(240);
		expect(point.value).toBe(0.9);
		expect(lastPatchOps()).toEqual([
			{
				op: 'replace',
				path: `/tracks/track-piano/automation/n/p/points/${pointId}`,
				value: { id: pointId, tick: 240, value: 0.9 }
			}
		]);
	});

	it('removeAutomationPoint removes the point and emits remove-op', () => {
		bridgeMock.state.value = 'connected';
		const pointId = songStore.addAutomationPoint('track-piano', 'n', 'p', 0, 0);
		bridgeMock.sentCommands.length = 0;

		songStore.removeAutomationPoint('track-piano', 'n', 'p', pointId);

		expect(songStore.currentSong!.tracks[0].automation![0].points).toHaveLength(0);
		expect(lastPatchOps()).toEqual([
			{
				op: 'remove',
				path: `/tracks/track-piano/automation/n/p/points/${pointId}`
			}
		]);
	});
});

// ── Bus mutations ──────────────────────────────────────

describe('songStore — bus mutations', () => {
	it('addBus pushes a bus and emits add-op with append syntax', () => {
		bridgeMock.state.value = 'connected';
		const busId = songStore.addBus('Reverb');
		expect(songStore.currentSong!.buses).toHaveLength(1);
		expect(songStore.currentSong!.buses![0].id).toBe(busId);
		expect(lastPatchOps()[0]).toMatchObject({ op: 'add', path: '/buses/-' });
	});

	it('setBusVolume updates and emits replace-op', () => {
		bridgeMock.state.value = 'connected';
		const busId = songStore.addBus('Reverb');
		bridgeMock.sentCommands.length = 0;

		songStore.setBusVolume(busId, -3);

		expect(songStore.currentSong!.buses![0].volume).toBe(-3);
		expect(lastPatchOps()).toEqual([
			{ op: 'replace', path: `/buses/${busId}/volumeDb`, value: -3 }
		]);
	});

	it('removeBus deletes the bus and emits remove-op', () => {
		bridgeMock.state.value = 'connected';
		const busId = songStore.addBus('Reverb');
		bridgeMock.sentCommands.length = 0;

		songStore.removeBus(busId);

		expect(songStore.currentSong!.buses).toHaveLength(0);
		expect(lastPatchOps()).toEqual([{ op: 'remove', path: `/buses/${busId}` }]);
	});
});

// ── Bridge forwarding behavior ─────────────────────────

describe('songStore — bridge forwarding', () => {
	it('does not call bridge.send when disconnected', () => {
		bridgeMock.state.value = 'disconnected';
		songStore.setTrackVolume('track-piano', -2);
		songStore.addChainNode('track-piano', 0, { format: 'clap', uid: 'x', name: 'X' });
		expect(bridgeMock.sendMock).not.toHaveBeenCalled();
	});

	it('calls bridge.send only for ops emitted by mutations', () => {
		bridgeMock.state.value = 'connected';
		songStore.setTrackVolume('track-piano', -2);
		expect(bridgeMock.sendMock).toHaveBeenCalledTimes(1);
		const cmd = bridgeMock.sentCommands[0];
		expect(cmd.type).toBe('project.patch');
		expect(cmd.ops?.length).toBe(1);
	});
});

// ── applyPatch (batch entry) ───────────────────────────

describe('songStore — applyPatch', () => {
	it('applies replace ops for track fields locally and forwards to bridge', () => {
		bridgeMock.state.value = 'connected';
		const ops: JsonPatchOp[] = [
			{ op: 'replace', path: '/tracks/track-piano/volumeDb', value: -10 },
			{ op: 'replace', path: '/tracks/track-piano/mute', value: true }
		];
		songStore.applyPatch(ops);

		// volumeDb is the wire field; the local Track field is 'volume'. The
		// local applier aliases volumeDb → volume so both sides stay in sync.
		expect(songStore.currentSong!.tracks[0].volume).toBe(-10);
		expect(songStore.currentSong!.tracks[0].mute).toBe(true);
		expect(bridgeMock.sentCommands[0]).toEqual({ type: 'project.patch', ops });
	});

	it('applies add op for chain via append syntax', () => {
		bridgeMock.state.value = 'connected';
		const ops: JsonPatchOp[] = [
			{
				op: 'add',
				path: '/tracks/track-piano/chain/-',
				value: {
					id: 'node-x',
					kind: 'insert',
					plugin: { format: 'clap', uid: 'a', name: 'A' },
					bypass: false,
					params: {}
				}
			}
		];
		songStore.applyPatch(ops);
		expect(songStore.currentSong!.tracks[0].chain).toHaveLength(1);
		expect(songStore.currentSong!.tracks[0].chain![0].id).toBe('node-x');
	});

	it('applies an automation point append via two-segment lane addressing', () => {
		// First seed a lane via the explicit mutation
		bridgeMock.state.value = 'disconnected';
		songStore.addAutomationPoint('track-piano', 'node-1', 'cutoff', 0, 0);
		bridgeMock.state.value = 'connected';
		bridgeMock.sentCommands.length = 0;

		const newPoint = { id: 'p2', tick: 480, value: 0.5, curve: 'linear' };
		songStore.applyPatch([
			{
				op: 'add',
				path: '/tracks/track-piano/automation/node-1/cutoff/points/-',
				value: newPoint
			}
		]);

		const lane = songStore.currentSong!.tracks[0].automation![0];
		expect(lane.points).toHaveLength(2);
		expect(lane.points[1]).toEqual(newPoint);
	});

	it('skips empty patch arrays without contacting bridge', () => {
		bridgeMock.state.value = 'connected';
		songStore.applyPatch([]);
		expect(bridgeMock.sendMock).not.toHaveBeenCalled();
	});

	it('does not call bridge when disconnected even with valid ops', () => {
		bridgeMock.state.value = 'disconnected';
		songStore.applyPatch([
			{ op: 'replace', path: '/tracks/track-piano/mute', value: true }
		]);
		expect(songStore.currentSong!.tracks[0].mute).toBe(true);
		expect(bridgeMock.sendMock).not.toHaveBeenCalled();
	});

	it('aliases /buses/{id}/volumeDb → bus.volume locally', () => {
		bridgeMock.state.value = 'connected';
		const busId = songStore.addBus('Reverb');
		bridgeMock.sentCommands.length = 0;

		songStore.applyPatch([
			{ op: 'replace', path: `/buses/${busId}/volumeDb`, value: -7 }
		]);

		const bus = songStore.currentSong!.buses!.find((b) => b.id === busId);
		expect(bus?.volume).toBe(-7);
	});

	it('aliases /master/volumeDb → master.volume locally', () => {
		bridgeMock.state.value = 'connected';
		bridgeMock.sentCommands.length = 0;

		songStore.applyPatch([{ op: 'replace', path: '/master/volumeDb', value: 0.7 }]);

		expect(songStore.currentSong!.master?.volume).toBe(0.7);
	});

	it('aliases /master/inserts/- → master.chain locally', () => {
		bridgeMock.state.value = 'connected';
		bridgeMock.sentCommands.length = 0;

		songStore.applyPatch([
			{
				op: 'add',
				path: '/master/inserts/-',
				value: {
					id: 'm-sat',
					kind: 'insert',
					plugin: { format: 'builtin', uid: 'saturation', name: 'Saturation' },
					bypass: false,
					params: {}
				}
			}
		]);

		expect(songStore.currentSong!.master?.chain?.length).toBe(1);
		expect(songStore.currentSong!.master?.chain?.[0]?.id).toBe('m-sat');
	});

	it('aliases /buses/{id}/inserts/- → bus.chain locally', () => {
		bridgeMock.state.value = 'connected';
		const busId = songStore.addBus('Delay');
		bridgeMock.sentCommands.length = 0;

		songStore.applyPatch([
			{
				op: 'add',
				path: `/buses/${busId}/inserts/-`,
				value: {
					id: 'b-eq',
					kind: 'insert',
					plugin: { format: 'builtin', uid: 'eq', name: 'EQ' },
					bypass: false,
					params: {}
				}
			}
		]);

		const bus = songStore.currentSong!.buses!.find((b) => b.id === busId);
		expect(bus?.chain?.length).toBe(1);
		expect(bus?.chain?.[0]?.id).toBe('b-eq');
	});
});

// ── saveSong PUT payload (regression for buses/master save bug) ──

describe('songStore — saveSong includes Bridge fields in PUT', () => {
	it('PUT payload contains buses + master after Mixer mutations', async () => {
		const api = await import('$lib/api');
		const updateSong = vi.mocked(api.updateSong);
		updateSong.mockImplementation(async (_id, data) => {
			// Echo back so the store can rehydrate without exploding.
			return {
				...songStore.currentSong!,
				...data
			} as Song;
		});

		// Add a bus + send via the store.
		const busId = songStore.addBus('Reverb');
		songStore.addSend('track-piano', busId, 0.4);

		await songStore.saveSong();

		expect(updateSong).toHaveBeenCalledTimes(1);
		const [, payload] = updateSong.mock.calls[0];
		expect(payload).toMatchObject({
			title: 'Test',
			tracks: expect.any(Array)
		});
		// Critical regression check: buses and master must be sent.
		expect(payload).toHaveProperty('buses');
		expect(payload.buses?.length).toBe(1);
		expect(payload.buses?.[0].name).toBe('Reverb');
		expect(payload).toHaveProperty('master');
		expect(payload.master).toBeDefined();
	});
});
