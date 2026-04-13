// After removeTrack, saveSong's PUT body must NOT contain the removed
// track. This protects against a class of bug where the local mutation
// succeeds but the save payload is derived from a stale snapshot.

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-save-after-remove-track';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Save After Remove Track',
		bpm: 120,
		timeSignature: '4/4',
		key: 'C',
		chordProgression: '| C |',
		sections: [{ id: 'sec1', name: 'A', startBar: 1, endBar: 1 }],
		tracks: [
			{
				id: 'track-keep',
				name: 'Keep',
				instrument: 'piano',
				blocks: [],
				volume: 0,
				mute: false,
				solo: false,
				chain: [],
				sends: [],
				pan: 0,
				automation: []
			},
			{
				id: 'track-drop-me',
				name: 'Drop Me',
				instrument: 'bass',
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

test.describe('Save after removeTrack', () => {
	let putBody: unknown = null;

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
		await page.route(`**/api/songs/${SONG_ID}`, async (route) => {
			if (route.request().method() === 'PUT') {
				try {
					putBody = JSON.parse(route.request().postData() ?? '{}');
				} catch {
					putBody = null;
				}
				// Echo back with id included so hydrateSong accepts the response.
				const echoed =
					putBody && typeof putBody === 'object'
						? { id: SONG_ID, ...(putBody as Record<string, unknown>) }
						: song;
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify(echoed)
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

	test('PUT body omits the removed track and keeps the survivors', async ({
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

		// Drop the track locally first.
		await callSongStore(page, 'removeTrack', ['track-drop-me']);

		// Verify local mutation went through BEFORE hitting save.
		const snap = (await readCurrentSong(page)) as
			| { tracks?: Array<{ id: string }> }
			| null;
		expect(snap?.tracks?.map((t) => t.id)).toEqual(['track-keep']);

		// Trigger save.
		await callSongStore(page, 'saveSong', []);

		// Wait for the PUT to land.
		await expect.poll(() => putBody !== null, { timeout: 5_000 }).toBe(true);

		const body = putBody as { tracks?: Array<{ id?: string; name?: string }> };
		const ids = (body.tracks ?? []).map((t) => t.id);
		expect(ids).toContain('track-keep');
		expect(ids).not.toContain('track-drop-me');
		expect(body.tracks?.length).toBe(1);
	});
});
