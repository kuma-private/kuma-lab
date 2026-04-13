// Song list → open existing song flow.
//
// Verifies the home page shows song list items and clicking through
// loads the song page with the bridge connected.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, readCurrentSong } from '../fixtures/window-stores';

const SONG_ID = 'song-create-load';

test.describe('Song list → song page navigation', () => {
	test.beforeEach(async ({ page }) => {
		const now = new Date().toISOString();
		const song = {
			id: SONG_ID,
			title: 'Open Me',
			bpm: 130,
			timeSignature: '4/4',
			key: 'D',
			chordProgression: '| D | A | Bm | G |',
			sections: [{ id: 'sec1', name: 'A', startBar: 1, endBar: 4 }],
			tracks: [
				{
					id: 'track-pad',
					name: 'Pad',
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
		const listItem = {
			id: SONG_ID,
			title: song.title,
			bpm: song.bpm,
			key: song.key,
			timeSignature: song.timeSignature,
			createdByName: 'Dev User',
			createdAt: song.createdAt,
			lastEditedBy: 'Dev User',
			lastEditedAt: song.lastEditedAt,
			trackCount: 1,
			sectionCount: 1,
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

	test('home page renders the song list and song page loads its data', async ({
		page,
		bridge
	}) => {
		expect(bridge.url).toBeTruthy();
		await page.goto('/');
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');

		// Song title should appear somewhere on the home page.
		await expect(page.locator('text=Open Me').first()).toBeVisible({ timeout: 5_000 });

		// Navigate directly to the song page and verify the store loads it.
		await page.goto(`/song/${SONG_ID}`);
		await expect
			.poll(async () => (await readCurrentSong(page))?.id, { timeout: 5_000 })
			.toBe(SONG_ID);

		const snap = await readCurrentSong(page);
		expect(snap?.title).toBe('Open Me');
		expect(snap?.tracks.length).toBe(1);
	});
});
