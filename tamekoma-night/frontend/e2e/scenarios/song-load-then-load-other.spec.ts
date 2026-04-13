// Sequential loadSong scenario.
//
// A single tab loads song A, then loads song B. After the second
// loadSong, currentSong must reflect B (id, title, tracks) — not a
// stale merge of A, and not a null intermediate state visible after
// the second call settles. Regressions in this path historically came
// from caching a resolved `song` closure across the two calls.

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_A_ID = 'song-load-then-load-a';
const SONG_B_ID = 'song-load-then-load-b';

function makeSong(id: string, title: string, trackName: string): Song {
	const now = new Date().toISOString();
	return {
		id,
		title,
		bpm: 120,
		timeSignature: '4/4',
		key: 'C',
		chordProgression: '| C |',
		sections: [],
		tracks: [
			{
				id: `${id}-track`,
				name: trackName,
				instrument: 'piano',
				blocks: [],
				volume: 0,
				mute: false,
				solo: false
			}
		],
		createdBy: 'dev-user',
		createdAt: now,
		lastEditedAt: now
	};
}

function toListItem(song: Song): SongListItem {
	return {
		id: song.id,
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
}

test.describe('loadSong followed by loadSong switches currentSong', () => {
	test.beforeEach(async ({ page }) => {
		const a = makeSong(SONG_A_ID, 'Song A', 'Alpha');
		const b = makeSong(SONG_B_ID, 'Song B', 'Bravo');
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
				body: JSON.stringify([toListItem(a), toListItem(b)])
			})
		);
		await page.route(`**/api/songs/${SONG_A_ID}`, (route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(a)
			})
		);
		await page.route(`**/api/songs/${SONG_B_ID}`, (route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(b)
			})
		);
	});

	test('currentSong swaps from A to B after a second loadSong', async ({ page, bridge }) => {
		expect(bridge.url).toBeTruthy();
		// Land on song A via normal route; this wires bridge + currentSong=A.
		await page.goto(`/song/${SONG_A_ID}`);
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');
		await expect
			.poll(async () => (await readCurrentSong(page))?.id, { timeout: 5_000 })
			.toBe(SONG_A_ID);

		const beforeA = (await readCurrentSong(page)) as {
			id?: string;
			title?: string;
			tracks?: Array<{ id?: string; name?: string }>;
		} | null;
		expect(beforeA?.title).toBe('Song A');
		expect(beforeA?.tracks?.[0]?.name).toBe('Alpha');

		// Imperative loadSong(B) — no navigation, just the store call.
		await callSongStore(page, 'loadSong', [SONG_B_ID]);
		await expect
			.poll(async () => (await readCurrentSong(page))?.id, { timeout: 5_000 })
			.toBe(SONG_B_ID);

		const afterB = (await readCurrentSong(page)) as {
			id?: string;
			title?: string;
			tracks?: Array<{ id?: string; name?: string }>;
		} | null;
		expect(afterB?.id).toBe(SONG_B_ID);
		expect(afterB?.title).toBe('Song B');
		expect(afterB?.tracks?.length).toBe(1);
		expect(afterB?.tracks?.[0]?.id).toBe(`${SONG_B_ID}-track`);
		expect(afterB?.tracks?.[0]?.name).toBe('Bravo');

		// Sanity: no trace of A in the new currentSong.
		expect(afterB?.tracks?.find((t) => t.name === 'Alpha')).toBeUndefined();

		// And the store's error flag wasn't tripped during the swap.
		const errAfter = await page.evaluate(() => {
			const w = window as unknown as {
				__cadenza?: { songStore?: { error?: string | null } };
			};
			return w.__cadenza?.songStore?.error ?? null;
		});
		expect(errAfter).toBeNull();
	});
});
