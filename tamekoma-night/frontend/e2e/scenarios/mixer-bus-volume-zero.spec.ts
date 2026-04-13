// Edge: bus volume = 0 (mute equivalent), bus volume = 1 (default), and a
// large value. Verifies the store accepts the full f32 range without
// clamping.

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-bus-vol-edge';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Bus Vol Edge',
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

test.describe('Bus volume edge values', () => {
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

	test('setBusVolume accepts 0 / 1 / 2.5 / -3 without clamping', async ({
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

		const busId = await callSongStore<string>(page, 'addBus', ['Bus']);

		// 0 (silent)
		await callSongStore(page, 'setBusVolume', [busId, 0]);
		let snap = (await readCurrentSong(page)) as
			| { buses?: Array<{ id: string; volume?: number }> }
			| null;
		expect(snap?.buses?.find((b) => b.id === busId)?.volume).toBe(0);

		// 1 (unity)
		await callSongStore(page, 'setBusVolume', [busId, 1]);
		snap = (await readCurrentSong(page)) as
			| { buses?: Array<{ id: string; volume?: number }> }
			| null;
		expect(snap?.buses?.find((b) => b.id === busId)?.volume).toBe(1);

		// 2.5 (boost — store accepts; clamping/limiting is the renderer's job)
		await callSongStore(page, 'setBusVolume', [busId, 2.5]);
		snap = (await readCurrentSong(page)) as
			| { buses?: Array<{ id: string; volume?: number }> }
			| null;
		expect(snap?.buses?.find((b) => b.id === busId)?.volume).toBe(2.5);

		// Negative (phase-inverted; some hosts allow this)
		await callSongStore(page, 'setBusVolume', [busId, -3]);
		snap = (await readCurrentSong(page)) as
			| { buses?: Array<{ id: string; volume?: number }> }
			| null;
		expect(snap?.buses?.find((b) => b.id === busId)?.volume).toBe(-3);
	});
});
