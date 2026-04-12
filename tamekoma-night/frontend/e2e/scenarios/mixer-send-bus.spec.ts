// Mixer send/bus scenario.
//
// Verifies that creating a bus and adding a send from a track to that bus
// round-trips through the songStore mutations + bridge JSON Patch path.

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-mixer-send-bus';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Send + Bus',
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

test.describe('Mixer send + bus', () => {
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

	test('creates a bus and routes a send from track to bus', async ({ page, bridge }) => {
		expect(bridge.url).toBeTruthy();
		await page.goto(`/song/${SONG_ID}`);

		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');

		// Wait for the song to load
		await expect
			.poll(async () => (await readCurrentSong(page))?.id, { timeout: 5_000 })
			.toBe(SONG_ID);

		// Create a bus called "Reverb Bus".
		const busId = await callSongStore<string>(page, 'addBus', ['Reverb Bus']);
		expect(busId).toBeTruthy();

		// Add a send from the lead track to the bus at level 0.4.
		const sendId = await callSongStore<string>(page, 'addSend', [
			'track-lead',
			busId,
			0.4
		]);
		expect(sendId).toBeTruthy();

		// Adjust the send level via setSendLevel.
		await callSongStore(page, 'setSendLevel', ['track-lead', sendId, 0.6]);

		// Verify the songStore reflects all of it.
		await expect
			.poll(
				async () => {
					const snap = await readCurrentSong(page);
					const t = snap?.tracks.find((x) => x.id === 'track-lead');
					const send = (t as { sends?: Array<{ id: string; level: number; destBusId: string }> })
						?.sends?.find((s) => s.id === sendId);
					return {
						busCount: (snap as { buses?: unknown[] })?.buses?.length ?? 0,
						sendLevel: send?.level ?? null,
						destBusId: send?.destBusId ?? null
					};
				},
				{ timeout: 3_000 }
			)
			.toMatchObject({
				busCount: 1,
				sendLevel: 0.6,
				destBusId: busId
			});

		await page.screenshot({
			path: 'e2e/screenshots/mixer-send-bus.png',
			fullPage: true
		});
	});
});
