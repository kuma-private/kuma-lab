// Song store — updateTrack merges only the provided partial fields.
//
// updateTrack(trackId, { name: 'X' }) must leave volume / mute / solo / pan
// untouched. Regression guard for a hypothetical rewrite that replaces the
// track object wholesale instead of spreading the partial updates.

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-update-track-partial';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Update Track Partial',
		bpm: 120,
		timeSignature: '4/4',
		key: 'C',
		chordProgression: '| C |',
		sections: [{ id: 'sec1', name: 'A', startBar: 0, endBar: 4 }],
		tracks: [
			{
				id: 'track-keys',
				name: 'Keys',
				instrument: 'piano',
				blocks: [],
				volume: -6,
				mute: true,
				solo: false,
				chain: [],
				sends: [],
				pan: 0.25,
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

test.describe('songStore — updateTrack partial merge', () => {
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

	test('updateTrack({ name }) leaves volume / mute / pan unchanged', async ({ page, bridge }) => {
		expect(bridge.url).toBeTruthy();
		await page.goto(`/song/${SONG_ID}`);
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');
		await expect
			.poll(async () => (await readCurrentSong(page))?.id, { timeout: 5_000 })
			.toBe(SONG_ID);

		await callSongStore(page, 'updateTrack', ['track-keys', { name: 'Grand Piano' }]);

		const t = await page.evaluate(() => {
			const w = window as unknown as {
				__cadenza?: {
					songStore?: {
						currentSong?: {
							tracks: Array<{
								id: string;
								name: string;
								instrument: string;
								volume: number;
								mute: boolean;
								solo: boolean;
								pan?: number;
							}>;
						};
					};
				};
			};
			const cur = w.__cadenza?.songStore?.currentSong;
			if (!cur) return null;
			return JSON.parse(JSON.stringify(cur.tracks[0]));
		});
		expect(t).not.toBeNull();
		expect(t.id).toBe('track-keys');
		// Updated field.
		expect(t.name).toBe('Grand Piano');
		// Everything else must survive the partial merge.
		expect(t.instrument).toBe('piano');
		expect(t.volume).toBe(-6);
		expect(t.mute).toBe(true);
		expect(t.solo).toBe(false);
		expect(t.pan).toBeCloseTo(0.25);
	});
});
