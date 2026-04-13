// Mixer mute / solo isolation across multiple tracks.
//
// Verifies muting one track doesn't affect another, soloing one
// doesn't affect another's solo flag, etc.

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-mute-solo';

function makeSong(): Song {
	const now = new Date().toISOString();
	const baseTrack = (id: string, name: string) => ({
		id,
		name,
		instrument: 'piano',
		blocks: [],
		volume: 0,
		mute: false,
		solo: false,
		chain: [],
		sends: [],
		pan: 0,
		automation: []
	});
	return {
		id: SONG_ID,
		title: 'Mute Solo',
		bpm: 120,
		timeSignature: '4/4',
		key: 'C',
		chordProgression: '| C |',
		sections: [{ id: 'sec1', name: 'A', startBar: 1, endBar: 1 }],
		tracks: [
			baseTrack('t-a', 'A'),
			baseTrack('t-b', 'B'),
			baseTrack('t-c', 'C')
		],
		createdBy: 'dev-user',
		createdAt: now,
		lastEditedAt: now,
		buses: [],
		master: { chain: [], volume: 1 }
	};
}

test.describe('Mute / Solo isolation', () => {
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

	test('mute / solo on one track stays scoped', async ({ page, bridge }) => {
		expect(bridge.url).toBeTruthy();
		await page.goto(`/song/${SONG_ID}`);
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');
		await expect
			.poll(async () => (await readCurrentSong(page))?.id, { timeout: 5_000 })
			.toBe(SONG_ID);

		await callSongStore(page, 'setTrackMute', ['t-a', true]);
		await callSongStore(page, 'setTrackSolo', ['t-b', true]);

		const snap = await readCurrentSong(page);
		const a = snap?.tracks.find((t) => t.id === 't-a') as
			| { mute?: boolean; solo?: boolean }
			| undefined;
		const b = snap?.tracks.find((t) => t.id === 't-b') as
			| { mute?: boolean; solo?: boolean }
			| undefined;
		const c = snap?.tracks.find((t) => t.id === 't-c') as
			| { mute?: boolean; solo?: boolean }
			| undefined;
		expect(a?.mute).toBe(true);
		expect(a?.solo).toBe(false);
		expect(b?.mute).toBe(false);
		expect(b?.solo).toBe(true);
		expect(c?.mute).toBe(false);
		expect(c?.solo).toBe(false);

		// Toggle them off.
		await callSongStore(page, 'setTrackMute', ['t-a', false]);
		await callSongStore(page, 'setTrackSolo', ['t-b', false]);
		const snap2 = await readCurrentSong(page);
		const a2 = snap2?.tracks.find((t) => t.id === 't-a') as
			| { mute?: boolean }
			| undefined;
		const b2 = snap2?.tracks.find((t) => t.id === 't-b') as
			| { solo?: boolean }
			| undefined;
		expect(a2?.mute).toBe(false);
		expect(b2?.solo).toBe(false);
	});
});
