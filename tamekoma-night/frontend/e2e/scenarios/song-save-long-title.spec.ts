// Long title persistence scenario.
//
// Titles up to 200 characters must round-trip through hydrateSong and
// songStore.saveSong() intact — no silent truncation, no HTML escaping,
// no Unicode mangling. Locks in that the title field is plumbed
// verbatim into the PUT body even when the string is unusually long
// and mixes ASCII + CJK.

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-save-long-title';

// Build a 200-character title mixing ASCII and a handful of CJK.
// Using repeat() keeps the intent obvious to future readers.
const LONG_TITLE = ('a'.repeat(98) + '音楽' + 'b'.repeat(100)).slice(0, 200);

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: LONG_TITLE,
		bpm: 120,
		timeSignature: '4/4',
		key: 'C',
		chordProgression: '| C |',
		sections: [],
		tracks: [],
		createdBy: 'dev-user',
		createdAt: now,
		lastEditedAt: now
	};
}

test.describe('Song save with 200-char title', () => {
	let putBody: Record<string, unknown> | null = null;

	test.beforeEach(async ({ page }) => {
		putBody = null;
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
			trackCount: 0,
			sectionCount: 0,
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
		await page.route(`**/api/songs/${SONG_ID}`, async (route) => {
			if (route.request().method() === 'PUT') {
				try {
					putBody = JSON.parse(route.request().postData() ?? '{}');
				} catch {
					putBody = null;
				}
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify({ ...(putBody ?? song), id: SONG_ID })
				});
			} else {
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify(song)
				});
			}
		});
	});

	test('200-char title round-trips through hydrateSong + saveSong PUT body', async ({
		page,
		bridge
	}) => {
		expect(bridge.url).toBeTruthy();

		// Sanity: LONG_TITLE really is 200 characters.
		expect(LONG_TITLE.length).toBe(200);

		await page.goto(`/song/${SONG_ID}`);
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');
		await expect
			.poll(async () => (await readCurrentSong(page))?.id, { timeout: 5_000 })
			.toBe(SONG_ID);

		// Hydrated currentSong.title matches the backend value verbatim.
		const hydrated = (await readCurrentSong(page)) as { title?: string } | null;
		expect(hydrated?.title).toBe(LONG_TITLE);
		expect(hydrated?.title?.length).toBe(200);

		// Save → PUT body.title must match verbatim (no truncation).
		await callSongStore(page, 'saveSong', []);
		await expect.poll(() => putBody !== null, { timeout: 5_000 }).toBe(true);
		const body = putBody as { title?: string };
		expect(body.title).toBe(LONG_TITLE);
		expect(body.title?.length).toBe(200);
	});
});
