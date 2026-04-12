// ChannelStrip integration tests — exercises the songStore mutation path that
// the ChannelStrip component invokes (setTrackVolume, setTrackMute, addChainNode,
// setChainParam, addSend, setSendLevel). Uses the same bridge + api mocks as the
// existing stores/__tests__/song-mutations.test.ts suite.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Song } from '$lib/types/song';
import type { JsonPatchOp } from '$lib/bridge/protocol';
import { makeBuiltinRef } from '../plugin-descriptors';

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
			client: { send: bridgeMock.sendMock },
			fullCatalog: [
				{ format: 'builtin', id: 'gain', name: 'Gain', vendor: 'Cadenza', path: 'builtin:gain' },
				{
					format: 'builtin',
					id: 'svf',
					name: 'Filter',
					vendor: 'Cadenza',
					path: 'builtin:svf'
				},
				{
					format: 'builtin',
					id: 'compressor',
					name: 'Compressor',
					vendor: 'Cadenza',
					path: 'builtin:compressor'
				}
			],
			builtinCatalog: [],
			pluginCatalog: [],
			meters: {}
		}
	};
});

vi.mock('$lib/api', () => ({
	getSongs: vi.fn(),
	getSong: vi.fn(),
	createSong: vi.fn(),
	updateSong: vi.fn(),
	deleteSong: vi.fn(),
	suggestMixer: vi.fn()
}));

import { songStore } from '$lib/stores/song.svelte';

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
				id: 't-piano',
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
				id: 't-bass',
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

beforeEach(() => {
	bridgeMock.sentCommands.length = 0;
	bridgeMock.sendMock.mockClear();
	bridgeMock.state.value = 'disconnected';
	songStore.setCurrentSong(makeSong());
	songStore.attachEngine(null);
});

describe('ChannelStrip → songStore — fader', () => {
	it('drag fader calls setTrackVolume and updates song state', () => {
		songStore.setTrackVolume('t-piano', -6);
		expect(songStore.currentSong?.tracks[0].volume).toBe(-6);
	});

	it('mute toggle updates mute state', () => {
		songStore.setTrackMute('t-bass', true);
		expect(songStore.currentSong?.tracks[1].mute).toBe(true);
	});

	it('solo toggle updates solo state', () => {
		songStore.setTrackSolo('t-piano', true);
		expect(songStore.currentSong?.tracks[0].solo).toBe(true);
	});

	it('pan change updates pan state', () => {
		songStore.setTrackPan('t-piano', -0.5);
		expect(songStore.currentSong?.tracks[0].pan).toBe(-0.5);
	});
});

describe('ChannelStrip → songStore — insert chain via PluginPicker', () => {
	it('adding a built-in gain inserts it at position 0', () => {
		const id = songStore.addChainNode('t-piano', 0, makeBuiltinRef('gain'));
		expect(id).toBeTruthy();
		const chain = songStore.currentSong?.tracks[0].chain;
		expect(chain).toHaveLength(1);
		expect(chain?.[0].plugin.name).toBe('Gain');
		expect(chain?.[0].plugin.format).toBe('builtin');
	});

	it('consecutive adds build a chain of inserts', () => {
		songStore.addChainNode('t-piano', 0, makeBuiltinRef('gain'));
		songStore.addChainNode('t-piano', 1, makeBuiltinRef('svf'));
		songStore.addChainNode('t-piano', 2, makeBuiltinRef('compressor'));
		const chain = songStore.currentSong?.tracks[0].chain ?? [];
		expect(chain.map((n) => n.plugin.name)).toEqual(['Gain', 'Filter', 'Compressor']);
	});

	it('setChainParam on the inserted gain writes gainDb', () => {
		const nodeId = songStore.addChainNode('t-piano', 0, makeBuiltinRef('gain'));
		songStore.setChainParam('t-piano', nodeId, 'gainDb', -12);
		const node = songStore.currentSong?.tracks[0].chain?.[0];
		expect(node?.params.gainDb).toBe(-12);
	});

	it('setChainBypass flips the bypass flag', () => {
		const nodeId = songStore.addChainNode('t-piano', 0, makeBuiltinRef('svf'));
		songStore.setChainBypass('t-piano', nodeId, true);
		const node = songStore.currentSong?.tracks[0].chain?.[0];
		expect(node?.bypass).toBe(true);
	});

	it('removeChainNode removes the node', () => {
		const nodeId = songStore.addChainNode('t-piano', 0, makeBuiltinRef('gain'));
		songStore.removeChainNode('t-piano', nodeId);
		expect(songStore.currentSong?.tracks[0].chain).toHaveLength(0);
	});
});

describe('ChannelStrip → songStore — instrument plugin', () => {
	it('setTrackInstrument assigns a built-in synth to the track', () => {
		songStore.setTrackInstrument('t-piano', makeBuiltinRef('supersaw'));
		const t = songStore.currentSong?.tracks[0];
		expect(t?.instrumentPlugin).toBeDefined();
		expect(t?.instrumentPlugin?.format).toBe('builtin');
		expect(t?.instrumentPlugin?.uid).toBe('supersaw');
	});

	it('setTrackInstrument(null) clears the instrument plugin', () => {
		songStore.setTrackInstrument('t-piano', makeBuiltinRef('subbass'));
		songStore.setTrackInstrument('t-piano', null);
		expect(songStore.currentSong?.tracks[0].instrumentPlugin).toBeUndefined();
	});

	it('setTrackInstrument emits project.patch when bridge is connected', () => {
		bridgeMock.state.value = 'connected';
		songStore.setTrackInstrument('t-piano', makeBuiltinRef('drumkit'));
		const patches = bridgeMock.sentCommands.filter((c) => c.type === 'project.patch');
		expect(patches.length).toBeGreaterThan(0);
		const lastOps = patches[patches.length - 1].ops ?? [];
		expect(lastOps[0].op).toBe('replace');
		expect(lastOps[0].path).toContain('/instrument');
	});
});

describe('ChannelStrip → songStore — sends', () => {
	it('addSend links a track to a bus', () => {
		songStore.addBus('Reverb');
		const busId = songStore.currentSong?.buses?.[0].id;
		expect(busId).toBeTruthy();
		songStore.addSend('t-piano', busId!, 0.4, false);
		const sends = songStore.currentSong?.tracks[0].sends;
		expect(sends).toHaveLength(1);
		expect(sends?.[0].destBusId).toBe(busId);
		expect(sends?.[0].level).toBe(0.4);
	});

	it('setSendLevel updates send level', () => {
		songStore.addBus('Reverb');
		const busId = songStore.currentSong!.buses![0].id;
		const sendId = songStore.addSend('t-piano', busId, 0.4);
		songStore.setSendLevel('t-piano', sendId, 0.8);
		expect(songStore.currentSong?.tracks[0].sends?.[0].level).toBe(0.8);
	});

	it('removeSend removes the send', () => {
		songStore.addBus('Reverb');
		const busId = songStore.currentSong!.buses![0].id;
		const sendId = songStore.addSend('t-piano', busId, 0.4);
		songStore.removeSend('t-piano', sendId);
		expect(songStore.currentSong?.tracks[0].sends).toHaveLength(0);
	});
});

describe('ChannelStrip → songStore — bridge patches when connected', () => {
	it('adding a chain node emits project.patch when bridge is connected', () => {
		bridgeMock.state.value = 'connected';
		songStore.addChainNode('t-piano', 0, makeBuiltinRef('gain'));
		const patches = bridgeMock.sentCommands.filter((c) => c.type === 'project.patch');
		expect(patches.length).toBeGreaterThan(0);
		const lastOps = patches[patches.length - 1].ops ?? [];
		expect(lastOps.some((op) => op.op === 'add' && op.path.includes('/chain/'))).toBe(true);
	});

	it('setTrackVolume emits project.patch when bridge is connected', () => {
		bridgeMock.state.value = 'connected';
		songStore.setTrackVolume('t-piano', -9);
		const patches = bridgeMock.sentCommands.filter((c) => c.type === 'project.patch');
		expect(patches.length).toBe(1);
		expect(patches[0].ops?.[0].op).toBe('replace');
	});
});
