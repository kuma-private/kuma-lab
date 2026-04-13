// Mixer multi-track chain scenario.
//
// Verifies that multiple tracks can each carry independent chain nodes,
// and that addChainNode + setChainParam scoped to one track doesn't
// leak into the other.

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-multi-track-chain';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Multi Track Chain',
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
			},
			{
				id: 'track-drums',
				name: 'Drums',
				instrument: 'drums',
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

test.describe('Mixer multi-track chain', () => {
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

	test('chain nodes added to one track stay scoped to that track', async ({
		page,
		bridge
	}) => {
		expect(bridge.url).toBeTruthy();
		await page.goto(`/song/${SONG_ID}`);
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');
		await expect
			.poll(async () => (await readCurrentSong(page))?.id, { timeout: 5_000 })
			.toBe(SONG_ID);

		// Add gain to lead, svf to bass, compressor to drums.
		const leadGain = await callSongStore<string>(page, 'addChainNode', [
			'track-lead',
			0,
			{ format: 'builtin', uid: 'gain', name: 'Gain', vendor: 'Cadenza' }
		]);
		const bassFilt = await callSongStore<string>(page, 'addChainNode', [
			'track-bass',
			0,
			{ format: 'builtin', uid: 'svf', name: 'Filter', vendor: 'Cadenza' }
		]);
		const drumsComp = await callSongStore<string>(page, 'addChainNode', [
			'track-drums',
			0,
			{ format: 'builtin', uid: 'compressor', name: 'Compressor', vendor: 'Cadenza' }
		]);

		// Each track has exactly one node, and they don't bleed.
		await expect
			.poll(
				async () => {
					const snap = await readCurrentSong(page);
					return {
						leadCount: snap?.tracks.find((t) => t.id === 'track-lead')?.chain?.length ?? 0,
						bassCount: snap?.tracks.find((t) => t.id === 'track-bass')?.chain?.length ?? 0,
						drumsCount: snap?.tracks.find((t) => t.id === 'track-drums')?.chain?.length ?? 0,
						leadUid: snap?.tracks.find((t) => t.id === 'track-lead')?.chain?.[0]?.plugin?.uid,
						bassUid: snap?.tracks.find((t) => t.id === 'track-bass')?.chain?.[0]?.plugin?.uid,
						drumsUid: snap?.tracks.find((t) => t.id === 'track-drums')?.chain?.[0]?.plugin
							?.uid
					};
				},
				{ timeout: 3_000 }
			)
			.toMatchObject({
				leadCount: 1,
				bassCount: 1,
				drumsCount: 1,
				leadUid: 'gain',
				bassUid: 'svf',
				drumsUid: 'compressor'
			});

		// Set a param on bass — verify lead/drums untouched.
		await callSongStore(page, 'setChainParam', [
			'track-bass',
			bassFilt,
			'cutoff',
			3000
		]);
		const snap = await readCurrentSong(page);
		const bassNode = snap?.tracks
			.find((t) => t.id === 'track-bass')
			?.chain?.find((n) => n.id === bassFilt) as
			| { params?: Record<string, number> }
			| undefined;
		expect(bassNode?.params?.cutoff).toBe(3000);

		// Lead and drums shouldn't have a 'cutoff' param.
		const leadNode = snap?.tracks
			.find((t) => t.id === 'track-lead')
			?.chain?.find((n) => n.id === leadGain) as
			| { params?: Record<string, number> }
			| undefined;
		const drumsNode = snap?.tracks
			.find((t) => t.id === 'track-drums')
			?.chain?.find((n) => n.id === drumsComp) as
			| { params?: Record<string, number> }
			| undefined;
		expect(leadNode?.params?.cutoff).toBeUndefined();
		expect(drumsNode?.params?.cutoff).toBeUndefined();
	});
});
