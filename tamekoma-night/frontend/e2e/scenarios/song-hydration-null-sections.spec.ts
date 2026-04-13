// Eng D round 4 flagged: hydrateSong used to leave `sections: null` as null,
// which would then crash FlowEditor.svelte's `song.sections.find(...)` with
// a null-deref. Fixed by adding `sections: song.sections ?? []` in
// hydrateSong. This e2e locks the regression: a backend payload with
// `sections: null` must not crash the song page and must render with an
// empty sections array.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-null-sections';

test.describe('Hydration — sections: null', () => {
	test.beforeEach(async ({ page }) => {
		const songWithNullSections = {
			id: SONG_ID,
			title: 'Null Sections',
			bpm: 120,
			timeSignature: '4/4',
			key: 'C',
			chordProgression: '| C |',
			sections: null,
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
			createdAt: '2026-04-01T00:00:00.000Z',
			lastEditedAt: '2026-04-01T00:00:00.000Z',
			buses: [],
			master: { chain: [], volume: 1 }
		};
		const listItem: SongListItem = {
			id: SONG_ID,
			title: 'Null Sections',
			bpm: 120,
			key: 'C',
			timeSignature: '4/4',
			createdByName: 'Dev User',
			createdAt: '2026-04-01T00:00:00.000Z',
			lastEditedBy: 'Dev User',
			lastEditedAt: '2026-04-01T00:00:00.000Z',
			trackCount: 1,
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
				body: JSON.stringify(songWithNullSections)
			})
		);
	});

	test('a song with sections:null hydrates to [] and the page does not crash', async ({
		page,
		bridge
	}) => {
		expect(bridge.url).toBeTruthy();
		const pageErrors: Error[] = [];
		page.on('pageerror', (err) => pageErrors.push(err));

		await page.goto(`/song/${SONG_ID}`);
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');
		await expect
			.poll(async () => (await readCurrentSong(page))?.id, { timeout: 5_000 })
			.toBe(SONG_ID);

		const snap = (await readCurrentSong(page)) as
			| { sections?: unknown }
			| null;
		expect(snap?.sections).toEqual([]);
		expect(pageErrors).toEqual([]);
	});
});
