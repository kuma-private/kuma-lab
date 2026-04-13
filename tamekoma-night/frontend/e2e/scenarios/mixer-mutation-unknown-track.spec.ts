// Mutating an unknown track id must be a no-op locally and (silently)
// rejected by the bridge. Catches a regression where the mutate helper
// crashes on a missing track.

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-mutate-unknown';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Mutate Unknown',
		bpm: 120,
		timeSignature: '4/4',
		key: 'C',
		chordProgression: '| C |',
		sections: [{ id: 'sec1', name: 'A', startBar: 1, endBar: 1 }],
		tracks: [
			{
				id: 'track-real',
				name: 'Real',
				instrument: 'piano',
				blocks: [],
				volume: -3,
				mute: false,
				solo: false,
				chain: [],
				sends: [],
				pan: 0.1,
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

test.describe('Mutation on unknown track id', () => {
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

	test('setTrackVolume on a ghost track id leaves real track untouched', async ({
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

		// Try a few mutations against an id that doesn't exist.
		await callSongStore(page, 'setTrackVolume', ['track-ghost', -50]);
		await callSongStore(page, 'setTrackPan', ['track-ghost', 0.9]);
		await callSongStore(page, 'setTrackMute', ['track-ghost', true]);

		const snap = await readCurrentSong(page);
		const real = snap?.tracks.find((t) => t.id === 'track-real') as
			| { volume?: number; pan?: number; mute?: boolean }
			| undefined;
		// Real track unchanged.
		expect(real?.volume).toBe(-3);
		expect(real?.pan).toBe(0.1);
		expect(real?.mute).toBe(false);
		// And no JS crash.
		expect(pageErrors).toEqual([]);
	});
});
