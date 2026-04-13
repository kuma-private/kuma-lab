// Clicking a song card from the home list navigates to that song's page.
// Sister test of song-create-and-load — that one navigates by URL bar
// directly; this one clicks the card link, which catches a regression
// where `<a href>` wires up incorrectly.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, readCurrentSong, waitForCadenzaReady } from '../fixtures/window-stores';

const SONG_ID = 'song-list-click';

test.describe('Song list card click', () => {
	test.beforeEach(async ({ page }) => {
		const now = new Date().toISOString();
		const song = {
			id: SONG_ID,
			title: 'Click Me',
			bpm: 110,
			timeSignature: '4/4',
			key: 'E',
			chordProgression: '| E | A | B | E |',
			sections: [{ id: 'sec1', name: 'A', startBar: 1, endBar: 4 }],
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

	test('clicking a song card on the home list opens its song page', async ({
		page,
		bridge
	}) => {
		expect(bridge.url).toBeTruthy();
		await page.goto('/');
		await waitForCadenzaReady(page);
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');

		const card = page.locator('a.song-card').first();
		await expect(card).toBeVisible();
		await card.click();

		await page.waitForURL(`**/song/${SONG_ID}`, { timeout: 5_000 });
		await waitForCadenzaReady(page);
		await expect
			.poll(async () => (await readCurrentSong(page))?.id, { timeout: 5_000 })
			.toBe(SONG_ID);
	});
});
