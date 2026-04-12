// MixerChat flow tests — exercise the applyPatch integration and the
// extractMixerSnapshot helper that MixerChat uses.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Song } from '$lib/types/song';
import type { JsonPatchOp } from '$lib/bridge/protocol';
import type { MixerSuggestResponse } from '$lib/api';
import { extractMixerSnapshot } from '../plugin-descriptors';

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
		suggestMixer: vi.fn<
			(req: { songId: string; prompt: string; mixer: unknown }) => Promise<MixerSuggestResponse>
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
	suggestMixer: apiMock.suggestMixer
}));

import { songStore } from '$lib/stores/song.svelte';
import { suggestMixer } from '$lib/api';

function makeSong(): Song {
	return {
		id: 'song-42',
		title: 'Demo',
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
				pan: 0
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
	apiMock.suggestMixer.mockReset();
	songStore.setCurrentSong(makeSong());
	songStore.attachEngine(null);
});

describe('MixerChat — snapshot extraction sent to suggestMixer', () => {
	it('snapshot contains mixer-relevant fields and excludes blocks', async () => {
		apiMock.suggestMixer.mockResolvedValue({
			explanation: 'no-op',
			ops: [],
			sideEffects: []
		});

		const song = songStore.currentSong!;
		const snapshot = extractMixerSnapshot(song);
		await suggestMixer({ songId: song.id, prompt: 'test', mixer: snapshot });

		expect(apiMock.suggestMixer).toHaveBeenCalledWith(
			expect.objectContaining({
				songId: 'song-42',
				prompt: 'test',
				mixer: expect.objectContaining({
					tracks: expect.any(Array),
					buses: expect.any(Array),
					master: expect.any(Object)
				})
			})
		);
		const sentMixer = apiMock.suggestMixer.mock.calls[0][0].mixer as {
			tracks: Array<{ id: string; blocks?: unknown }>;
		};
		expect(sentMixer.tracks[0].id).toBe('t-piano');
		expect('blocks' in sentMixer.tracks[0]).toBe(false);
	});
});

describe('MixerChat — apply response ops via songStore.applyPatch', () => {
	it('replace op on /tracks/{id}/volumeDb does not break the store (volume is volume)', () => {
		// The server returns ops; the chat component calls songStore.applyPatch.
		// Verify that a representative replace op runs without throwing.
		const ops: JsonPatchOp[] = [
			{ op: 'replace', path: '/tracks/t-piano/volume', value: -6 }
		];
		songStore.applyPatch(ops);
		expect(songStore.currentSong?.tracks[0].volume).toBe(-6);
	});

	it('add op on /tracks/{id}/chain/- inserts a node', () => {
		const newNode = {
			id: 'ai-added-1',
			kind: 'insert',
			plugin: { format: 'builtin', uid: 'gain', name: 'Gain' },
			bypass: false,
			params: { gainDb: -3 }
		};
		const ops: JsonPatchOp[] = [
			{ op: 'add', path: '/tracks/t-piano/chain/-', value: newNode }
		];
		songStore.applyPatch(ops);
		const chain = songStore.currentSong?.tracks[0].chain ?? [];
		expect(chain).toHaveLength(1);
		expect(chain[0].id).toBe('ai-added-1');
	});

	it('empty op list is a no-op', () => {
		const before = JSON.stringify(songStore.currentSong);
		songStore.applyPatch([]);
		expect(JSON.stringify(songStore.currentSong)).toBe(before);
	});

	it('applyPatch forwards to bridge when connected', () => {
		bridgeMock.state.value = 'connected';
		songStore.applyPatch([
			{ op: 'replace', path: '/tracks/t-piano/volume', value: -3 }
		]);
		const patches = bridgeMock.sentCommands.filter((c) => c.type === 'project.patch');
		expect(patches).toHaveLength(1);
		expect(patches[0].ops).toHaveLength(1);
	});
});

describe('MixerChat — error handling (via suggestMixer mock)', () => {
	it('propagates API errors so the chat can show an error message', async () => {
		apiMock.suggestMixer.mockRejectedValue(new Error('Rate limited'));
		await expect(
			suggestMixer({ songId: 'song-42', prompt: 'x', mixer: {} })
		).rejects.toThrow('Rate limited');
	});

	it('resolves with explanation+ops when Claude replies', async () => {
		apiMock.suggestMixer.mockResolvedValue({
			explanation: 'ピアノに軽いリバーブを送ります',
			ops: [{ op: 'replace', path: '/tracks/t-piano/volume', value: -4 }],
			sideEffects: ['バスが存在しないため新規作成します']
		});
		const res = await suggestMixer({ songId: 'song-42', prompt: 'リバーブ', mixer: {} });
		expect(res.explanation).toContain('ピアノ');
		expect(res.ops).toHaveLength(1);
		expect(res.sideEffects).toHaveLength(1);
	});
});
