// Removing a send drops it from the track without disturbing the destination
// bus or sibling sends.

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-send-remove';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Send Remove',
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

test.describe('Mixer send removal', () => {
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

	test('removeSend drops one of two sends without affecting the other', async ({
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

		const busA = await callSongStore<string>(page, 'addBus', ['Reverb']);
		const busB = await callSongStore<string>(page, 'addBus', ['Delay']);

		const sendA = await callSongStore<string>(page, 'addSend', ['track-lead', busA, 0.3]);
		const sendB = await callSongStore<string>(page, 'addSend', ['track-lead', busB, 0.5]);

		await expect
			.poll(
				async () => {
					const snap = await readCurrentSong(page);
					const t = snap?.tracks.find((x) => x.id === 'track-lead') as
						| { sends?: Array<{ id: string }> }
						| undefined;
					return t?.sends?.length ?? 0;
				},
				{ timeout: 3_000 }
			)
			.toBe(2);

		// Remove sendA — sendB and both buses should still be intact.
		await callSongStore(page, 'removeSend', ['track-lead', sendA]);

		const snap = await readCurrentSong(page);
		const t = snap?.tracks.find((x) => x.id === 'track-lead') as
			| { sends?: Array<{ id: string; destBusId: string; level: number }> }
			| undefined;
		expect(t?.sends?.length).toBe(1);
		expect(t?.sends?.[0]?.id).toBe(sendB);
		expect(t?.sends?.[0]?.destBusId).toBe(busB);
		expect(t?.sends?.[0]?.level).toBe(0.5);

		const buses = (snap as { buses?: Array<{ id: string }> })?.buses ?? [];
		expect(buses.length).toBe(2);
		expect(buses.map((b) => b.id).sort()).toEqual([busA, busB].sort());
	});
});
