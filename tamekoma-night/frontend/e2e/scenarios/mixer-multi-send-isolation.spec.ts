// Setting one send's level must not bleed into a sibling send on the same
// track. Catches naive index-based mutation bugs.

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-multi-send';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Multi Send',
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

test.describe('Mixer multi-send isolation', () => {
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

	test('setSendLevel on send A leaves send B untouched', async ({ page, bridge }) => {
		expect(bridge.url).toBeTruthy();
		await page.goto(`/song/${SONG_ID}`);
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');
		await expect
			.poll(async () => (await readCurrentSong(page))?.id, { timeout: 5_000 })
			.toBe(SONG_ID);

		const reverbBus = await callSongStore<string>(page, 'addBus', ['Reverb']);
		const delayBus = await callSongStore<string>(page, 'addBus', ['Delay']);

		const sendR = await callSongStore<string>(page, 'addSend', ['track-lead', reverbBus, 0.2]);
		const sendD = await callSongStore<string>(page, 'addSend', ['track-lead', delayBus, 0.2]);

		// Bump only the reverb send.
		await callSongStore(page, 'setSendLevel', ['track-lead', sendR, 0.85]);

		const snap = await readCurrentSong(page);
		const t = snap?.tracks.find((x) => x.id === 'track-lead') as
			| { sends?: Array<{ id: string; level: number; destBusId: string }> }
			| undefined;

		const r = t?.sends?.find((s) => s.id === sendR);
		const d = t?.sends?.find((s) => s.id === sendD);
		expect(r?.level).toBe(0.85);
		expect(r?.destBusId).toBe(reverbBus);
		expect(d?.level).toBe(0.2);
		expect(d?.destBusId).toBe(delayBus);

		// Now bump only the delay send to a fresh value.
		await callSongStore(page, 'setSendLevel', ['track-lead', sendD, 0.5]);

		const snap2 = await readCurrentSong(page);
		const t2 = snap2?.tracks.find((x) => x.id === 'track-lead') as
			| { sends?: Array<{ id: string; level: number }> }
			| undefined;
		expect(t2?.sends?.find((s) => s.id === sendR)?.level).toBe(0.85);
		expect(t2?.sends?.find((s) => s.id === sendD)?.level).toBe(0.5);
	});
});
