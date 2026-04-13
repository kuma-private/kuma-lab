// Song store — addTrack appends at end, ids stay unique across 3 adds.
//
// Verifies:
//   - addTrack(track) appends to the end of the tracks array (not prepends
//     or inserts in the middle).
//   - After three addTrack calls the tracks array has length initial+3 in
//     the exact order they were added.
//   - Track ids remain unique (no collision when the caller supplies
//     distinct ids, which the store does not rewrite).

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-add-track-order';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Add Track Order',
		bpm: 120,
		timeSignature: '4/4',
		key: 'C',
		chordProgression: '| C |',
		sections: [{ id: 'sec1', name: 'A', startBar: 0, endBar: 4 }],
		tracks: [
			{
				id: 'track-initial',
				name: 'Initial',
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

test.describe('songStore — addTrack ordering + id uniqueness', () => {
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

	test('three addTrack calls append in order with unique ids', async ({ page, bridge }) => {
		expect(bridge.url).toBeTruthy();
		await page.goto(`/song/${SONG_ID}`);
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');
		await expect
			.poll(async () => (await readCurrentSong(page))?.id, { timeout: 5_000 })
			.toBe(SONG_ID);

		const makeTrack = (id: string, name: string, inst: string) => ({
			id,
			name,
			instrument: inst,
			blocks: [],
			volume: 0,
			mute: false,
			solo: false,
			chain: [],
			sends: [],
			pan: 0,
			automation: []
		});

		await callSongStore(page, 'addTrack', [makeTrack('track-bass', 'Bass', 'bass')]);
		await callSongStore(page, 'addTrack', [makeTrack('track-drums', 'Drums', 'drums')]);
		await callSongStore(page, 'addTrack', [makeTrack('track-strings', 'Strings', 'strings')]);

		const ids = await page.evaluate(() => {
			const w = window as unknown as {
				__cadenza?: {
					songStore?: {
						currentSong?: { tracks: Array<{ id: string; name: string }> };
					};
				};
			};
			return (
				w.__cadenza?.songStore?.currentSong?.tracks.map((t) => ({ id: t.id, name: t.name })) ?? []
			);
		});

		// Order must be preserved: initial, then the three added.
		expect(ids.length).toBe(4);
		expect(ids.map((t) => t.id)).toEqual([
			'track-initial',
			'track-bass',
			'track-drums',
			'track-strings'
		]);
		expect(ids.map((t) => t.name)).toEqual(['Initial', 'Bass', 'Drums', 'Strings']);

		// Uniqueness check — Set size equals array length.
		const uniq = new Set(ids.map((t) => t.id));
		expect(uniq.size).toBe(ids.length);
	});
});
