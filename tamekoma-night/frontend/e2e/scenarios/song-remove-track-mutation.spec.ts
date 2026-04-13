// songStore.removeTrack drops a track from currentSong.tracks.
// Locks in the local mutation behavior so a regression in the
// updateCurrentSong path is caught before it hits the Flow editor.

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-remove-track-mutation';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Remove Track Mutation',
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
			},
			{
				id: 'track-bass',
				name: 'Bass',
				instrument: 'bass',
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
				id: 'track-drums',
				name: 'Drums',
				instrument: 'drums',
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

test.describe('Song removeTrack mutation', () => {
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

	test('removeTrack drops the track from currentSong.tracks while keeping the rest', async ({
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

		let snap = (await readCurrentSong(page)) as
			| { tracks?: Array<{ id: string }> }
			| null;
		expect(snap?.tracks?.length).toBe(3);
		expect(snap?.tracks?.map((t) => t.id)).toEqual([
			'track-lead',
			'track-bass',
			'track-drums'
		]);

		// Drop the middle track.
		await callSongStore(page, 'removeTrack', ['track-bass']);

		snap = (await readCurrentSong(page)) as typeof snap;
		expect(snap?.tracks?.length).toBe(2);
		expect(snap?.tracks?.map((t) => t.id)).toEqual(['track-lead', 'track-drums']);

		// Dropping the first track leaves just the last.
		await callSongStore(page, 'removeTrack', ['track-lead']);
		snap = (await readCurrentSong(page)) as typeof snap;
		expect(snap?.tracks?.length).toBe(1);
		expect(snap?.tracks?.[0]?.id).toBe('track-drums');

		// Removing an unknown id is a no-op.
		await callSongStore(page, 'removeTrack', ['does-not-exist']);
		snap = (await readCurrentSong(page)) as typeof snap;
		expect(snap?.tracks?.length).toBe(1);
	});
});
