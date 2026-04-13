// Free user opens a song that already has a CLAP plugin in its chain
// (persisted from a prior premium session, loaded via GET /api/songs/:id).
// The page must hydrate without crashing. A premium gate MAY surface when
// the song store replays the chain into the bridge, but the route itself
// must remain interactive — this is the "don't brick free users who once
// had premium" scenario.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-free-preloaded-clap';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Preloaded CLAP',
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
				chain: [
					{
						id: 'node-preloaded-clap',
						plugin: {
							format: 'clap',
							uid: 'preloaded.clap',
							name: 'Preloaded CLAP',
							vendor: 'Vendor'
						},
						bypass: false,
						params: {}
					}
				],
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

test.describe('Free user — song with preloaded CLAP in chain', () => {
	test.beforeEach(async ({ page }) => {
		// Wipe any seeded premium override so this behaves as a real free
		// user session, while still being scheduled under the `premium`
		// project for bridge connectivity.
		await page.addInitScript(() => {
			window.localStorage.removeItem('cadenzaPlanOverride');
		});

		const song = makeSong();
		const listItem: SongListItem = {
			id: SONG_ID,
			title: song.title,
			bpm: song.bpm,
			key: song.key,
			timeSignature: song.timeSignature,
			createdByName: 'Free User',
			createdAt: song.createdAt,
			lastEditedBy: 'Free User',
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
					name: 'Free User',
					email: 'free@test.com',
					sub: 'free-user',
					tier: 'free'
				})
			})
		);
		await page.route('**/api/bridge/ticket', (route) =>
			route.fulfill({
				status: 403,
				contentType: 'application/json',
				body: JSON.stringify({ error: 'not_premium' })
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

	test('page hydrates with the CLAP node visible in songStore.currentSong', async ({
		page,
		bridge
	}) => {
		expect(bridge.url).toBeTruthy();

		// Track any JS errors — the page must not crash.
		const jsErrors: string[] = [];
		page.on('pageerror', (e) => jsErrors.push(String(e)));

		await page.goto(`/song/${SONG_ID}`);

		// Bridge still connects (connectivity is tier-independent; only
		// session.verify distinguishes free/premium).
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');

		// Song hydrates into the store with the CLAP node intact.
		await expect
			.poll(async () => (await readCurrentSong(page))?.id, { timeout: 5_000 })
			.toBe(SONG_ID);

		const cur = await readCurrentSong(page);
		expect(cur?.tracks?.[0]?.chain?.[0]?.plugin?.format).toBe('clap');
		expect(cur?.tracks?.[0]?.chain?.[0]?.plugin?.uid).toBe('preloaded.clap');

		// Page remains interactive — body is still present + visible.
		await expect(page.locator('body')).toBeVisible();
		expect(jsErrors).toEqual([]);
	});
});
