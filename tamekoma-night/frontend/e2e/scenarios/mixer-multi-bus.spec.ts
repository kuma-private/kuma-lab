// Multi-bus routing scenario.
//
// Verifies that creating multiple buses + multiple sends from one track
// to different buses keeps the routing graph correct in the songStore.

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-multi-bus';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Multi Bus',
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

test.describe('Mixer multi-bus routing', () => {
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

	test('routes track sends to multiple distinct buses', async ({ page, bridge }) => {
		expect(bridge.url).toBeTruthy();
		await page.goto(`/song/${SONG_ID}`);
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');
		await expect
			.poll(async () => (await readCurrentSong(page))?.id, { timeout: 5_000 })
			.toBe(SONG_ID);

		// Three buses.
		const reverbBus = await callSongStore<string>(page, 'addBus', ['Reverb']);
		const delayBus = await callSongStore<string>(page, 'addBus', ['Delay']);
		const satBus = await callSongStore<string>(page, 'addBus', ['Saturation']);

		// Three sends from one track, one to each bus.
		const send1 = await callSongStore<string>(page, 'addSend', [
			'track-lead',
			reverbBus,
			0.3
		]);
		const send2 = await callSongStore<string>(page, 'addSend', [
			'track-lead',
			delayBus,
			0.2
		]);
		const send3 = await callSongStore<string>(page, 'addSend', [
			'track-lead',
			satBus,
			0.5
		]);

		await expect
			.poll(
				async () => {
					const snap = (await readCurrentSong(page)) as
						| { buses?: Array<{ id: string }> }
						| null;
					return snap?.buses?.length ?? 0;
				},
				{ timeout: 3_000 }
			)
			.toBe(3);

		const snap = await readCurrentSong(page);
		const t = snap?.tracks.find((x) => x.id === 'track-lead') as
			| {
					sends?: Array<{ id: string; destBusId: string; level: number }>;
			  }
			| undefined;
		expect(t?.sends?.length).toBe(3);

		const map = new Map(t?.sends?.map((s) => [s.id, s]));
		expect(map.get(send1)?.destBusId).toBe(reverbBus);
		expect(map.get(send2)?.destBusId).toBe(delayBus);
		expect(map.get(send3)?.destBusId).toBe(satBus);
		expect(map.get(send1)?.level).toBe(0.3);
		expect(map.get(send2)?.level).toBe(0.2);
		expect(map.get(send3)?.level).toBe(0.5);

		// Remove the middle send.
		await callSongStore(page, 'removeSend', ['track-lead', send2]);
		await expect
			.poll(
				async () => {
					const snap2 = await readCurrentSong(page);
					const t2 = snap2?.tracks.find((x) => x.id === 'track-lead') as
						| { sends?: Array<{ id: string }> }
						| undefined;
					return t2?.sends?.map((s) => s.id) ?? [];
				},
				{ timeout: 3_000 }
			)
			.toEqual([send1, send3]);

		// Remove a bus and verify the songStore reflects it.
		await callSongStore(page, 'removeBus', [reverbBus]);
		await expect
			.poll(
				async () => {
					const snap2 = (await readCurrentSong(page)) as
						| { buses?: Array<{ id: string }> }
						| null;
					return snap2?.buses?.map((b) => b.id) ?? [];
				},
				{ timeout: 3_000 }
			)
			.toEqual([delayBus, satBus]);
	});
});
