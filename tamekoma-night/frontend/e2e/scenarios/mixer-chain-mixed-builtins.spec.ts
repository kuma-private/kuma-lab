// A single track chain with one of each builtin effect type, each with
// their own params. Verifies that setting a param on node A doesn't
// clobber params on node B.

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-chain-mixed';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Chain Mixed',
		bpm: 120,
		timeSignature: '4/4',
		key: 'C',
		chordProgression: '| C |',
		sections: [{ id: 'sec1', name: 'A', startBar: 1, endBar: 1 }],
		tracks: [
			{
				id: 'track-lead',
				name: 'Lead',
				instrument: 'piano',
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
		createdBy: 'dev-user',
		createdAt: now,
		lastEditedAt: now,
		buses: [],
		master: { chain: [], volume: 1 }
	};
}

test.describe('Mixed builtin chain', () => {
	test.beforeEach(async ({ page }) => {
		const song = makeSong();
		const listItem: SongListItem = {
			id: SONG_ID,
			title: song.title,
			bpm: song.bpm,
			key: song.key,
			timeSignature: song.timeSignature,
			createdByName: 'Dev User',
			createdAt: song.createdAt,
			lastEditedBy: 'Dev User',
			lastEditedAt: song.lastEditedAt,
			trackCount: song.tracks.length,
			sectionCount: song.sections.length,
			visibility: 'private'
		};
		await page.route('**/auth/me', (route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					name: 'Dev User',
					email: 'dev@test.com',
					sub: 'dev-user',
					tier: 'premium'
				})
			})
		);
		await page.route('**/api/songs', (route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify([listItem])
			})
		);
		await page.route(`**/api/songs/${SONG_ID}`, (route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(song)
			})
		);
	});

	test('gain + svf + compressor each keep their own params', async ({ page, bridge }) => {
		expect(bridge.url).toBeTruthy();
		await page.goto(`/song/${SONG_ID}`);
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');
		await expect
			.poll(async () => (await readCurrentSong(page))?.id, { timeout: 5_000 })
			.toBe(SONG_ID);

		const gainId = await callSongStore<string>(page, 'addChainNode', [
			'track-lead',
			0,
			{ format: 'builtin', uid: 'gain', name: 'Gain', vendor: 'Cadenza' }
		]);
		const svfId = await callSongStore<string>(page, 'addChainNode', [
			'track-lead',
			1,
			{ format: 'builtin', uid: 'svf', name: 'Filter', vendor: 'Cadenza' }
		]);
		const compId = await callSongStore<string>(page, 'addChainNode', [
			'track-lead',
			2,
			{ format: 'builtin', uid: 'compressor', name: 'Compressor', vendor: 'Cadenza' }
		]);

		await callSongStore(page, 'setChainParam', ['track-lead', gainId, 'gainDb', 3]);
		await callSongStore(page, 'setChainParam', ['track-lead', svfId, 'cutoff', 1500]);
		await callSongStore(page, 'setChainParam', ['track-lead', compId, 'threshold', -18]);

		const snap = await readCurrentSong(page);
		const chain = snap?.tracks.find((t) => t.id === 'track-lead')?.chain ?? [];
		const byId = (id: string) =>
			chain.find((n) => n.id === id) as
				| { params?: Record<string, number> }
				| undefined;

		expect(byId(gainId)?.params?.gainDb).toBe(3);
		expect(byId(gainId)?.params?.cutoff).toBeUndefined();
		expect(byId(svfId)?.params?.cutoff).toBe(1500);
		expect(byId(svfId)?.params?.gainDb).toBeUndefined();
		expect(byId(compId)?.params?.threshold).toBe(-18);
		expect(byId(compId)?.params?.cutoff).toBeUndefined();
	});
});
