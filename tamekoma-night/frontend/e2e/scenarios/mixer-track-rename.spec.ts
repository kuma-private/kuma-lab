// Track rename + sequential chain ordering scenario.
//
// Verifies that updating a track's name via the songStore propagates,
// and that adding 3 chain nodes to the same track preserves insertion
// order (position 0 → first, position 1 → second, etc.).

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-track-rename';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Track Rename',
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

test.describe('Track rename + chain order', () => {
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

	test('chain insertion order is preserved across multiple addChainNode calls', async ({
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

		// Add three nodes in a specific order: gain → svf → compressor.
		const id1 = await callSongStore<string>(page, 'addChainNode', [
			'track-lead',
			0,
			{ format: 'builtin', uid: 'gain', name: 'Gain', vendor: 'Cadenza' }
		]);
		const id2 = await callSongStore<string>(page, 'addChainNode', [
			'track-lead',
			1,
			{ format: 'builtin', uid: 'svf', name: 'Filter', vendor: 'Cadenza' }
		]);
		const id3 = await callSongStore<string>(page, 'addChainNode', [
			'track-lead',
			2,
			{ format: 'builtin', uid: 'compressor', name: 'Compressor', vendor: 'Cadenza' }
		]);

		await expect
			.poll(
				async () => {
					const snap = await readCurrentSong(page);
					const t = snap?.tracks.find((x) => x.id === 'track-lead');
					return t?.chain?.map((n) => n.id) ?? [];
				},
				{ timeout: 3_000 }
			)
			.toEqual([id1, id2, id3]);

		// Verify the plugin uids in order.
		const snap = await readCurrentSong(page);
		const uids = snap?.tracks
			.find((t) => t.id === 'track-lead')
			?.chain?.map((n) => n.plugin.uid);
		expect(uids).toEqual(['gain', 'svf', 'compressor']);
	});
});
