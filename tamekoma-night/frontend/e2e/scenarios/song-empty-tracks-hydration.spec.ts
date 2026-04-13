// A song saved with zero tracks should still hydrate correctly: tracks
// stays as [] and buses/master get the default-shape fallback. Edge case
// for the welcome flow where a brand-new song has no tracks yet.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-empty-tracks';

const EMPTY_SONG: Song = {
	id: SONG_ID,
	title: 'Empty Song',
	bpm: 120,
	timeSignature: '4/4',
	key: 'C',
	chordProgression: '',
	sections: [],
	tracks: [],
	createdBy: 'dev-user',
	createdAt: '2026-04-01T00:00:00.000Z',
	lastEditedAt: '2026-04-01T00:00:00.000Z'
};

test.describe('Empty-song hydration', () => {
	test.beforeEach(async ({ page }) => {
		const listItem: SongListItem = {
			id: SONG_ID,
			title: EMPTY_SONG.title,
			bpm: EMPTY_SONG.bpm,
			key: EMPTY_SONG.key,
			timeSignature: EMPTY_SONG.timeSignature,
			createdByName: 'Dev User',
			createdAt: EMPTY_SONG.createdAt,
			lastEditedBy: 'Dev User',
			lastEditedAt: EMPTY_SONG.lastEditedAt,
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
		await page.route(`**/api/songs/${SONG_ID}`, (route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(EMPTY_SONG)
			})
		);
	});

	test('zero-track song hydrates to empty arrays + default master', async ({
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

		const snap = (await readCurrentSong(page)) as
			| {
					tracks?: unknown[];
					buses?: unknown[];
					master?: { chain?: unknown[]; volume?: number };
			  }
			| null;

		expect(snap?.tracks).toEqual([]);
		expect(snap?.buses).toEqual([]);
		expect(snap?.master?.chain).toEqual([]);
		expect(snap?.master?.volume).toBe(1);
	});
});
