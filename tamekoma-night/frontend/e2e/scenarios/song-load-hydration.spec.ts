// Song load hydration scenario.
//
// Loads a "legacy" song that lacks any of the new optional Bridge fields
// (chain / sends / pan / automation / buses / master) and verifies the
// frontend hydrates them with safe defaults so the rest of the app
// (Mixer, Automation) sees the expected shape.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, readCurrentSong } from '../fixtures/window-stores';

const SONG_ID = 'song-load-hydration';

// Intentionally minimal: no chain / sends / pan / automation / buses / master.
const LEGACY_SONG = {
	id: SONG_ID,
	title: 'Legacy Song',
	bpm: 120,
	timeSignature: '4/4',
	key: 'C',
	chordProgression: '| C | F | G | C |',
	sections: [{ id: 'sec1', name: 'A', startBar: 1, endBar: 4 }],
	tracks: [
		{
			id: 'track-lead',
			name: 'Lead',
			instrument: 'piano',
			blocks: [],
			volume: 0,
			mute: false,
			solo: false
		},
		{
			id: 'track-bass',
			name: 'Bass',
			instrument: 'bass',
			blocks: [],
			volume: 0,
			mute: false,
			solo: false
		}
	],
	createdBy: 'dev-user',
	createdAt: new Date().toISOString(),
	lastEditedAt: new Date().toISOString()
};

test.describe('Legacy song hydration', () => {
	test.beforeEach(async ({ page }) => {
		const listItem = {
			id: SONG_ID,
			title: LEGACY_SONG.title,
			bpm: LEGACY_SONG.bpm,
			key: LEGACY_SONG.key,
			timeSignature: LEGACY_SONG.timeSignature,
			createdByName: 'Dev User',
			createdAt: LEGACY_SONG.createdAt,
			lastEditedBy: 'Dev User',
			lastEditedAt: LEGACY_SONG.lastEditedAt,
			trackCount: 2,
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
				body: JSON.stringify(LEGACY_SONG)
			})
		);
	});

	test('legacy song without chain/buses/master gets default-hydrated', async ({
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
					tracks?: Array<{
						chain?: unknown;
						sends?: unknown;
						pan?: unknown;
						automation?: unknown;
					}>;
					buses?: unknown;
					master?: { chain?: unknown; volume?: number };
			  }
			| null;
		expect(snap).not.toBeNull();
		expect(snap?.tracks?.[0]?.chain).toEqual([]);
		expect(snap?.tracks?.[0]?.sends).toEqual([]);
		expect(snap?.tracks?.[0]?.pan).toBe(0);
		expect(snap?.tracks?.[0]?.automation).toEqual([]);
		expect(snap?.tracks?.[1]?.chain).toEqual([]);
		expect(snap?.buses).toEqual([]);
		expect(snap?.master?.chain).toEqual([]);
		expect(snap?.master?.volume).toBe(1);
	});
});
