// updateSection can change the bar range of an existing section.
// startBar / endBar are what the Flow section bar renders against,
// so any regression here corrupts the timeline layout.

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-update-section-bars';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Update Section Bars',
		bpm: 120,
		timeSignature: '4/4',
		key: 'C',
		chordProgression: '| C | F | G | C |',
		sections: [
			{ id: 'verse', name: 'Verse', startBar: 1, endBar: 4 },
			{ id: 'chorus', name: 'Chorus', startBar: 5, endBar: 8 }
		],
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

test.describe('Song updateSection bar range', () => {
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

	test('updateSection changes startBar/endBar and leaves other fields intact', async ({
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

		// Extend Verse to bars 1..6 (grow right).
		await callSongStore(page, 'updateSection', [
			'verse',
			{ startBar: 1, endBar: 6 }
		]);

		let snap = (await readCurrentSong(page)) as
			| {
					sections?: Array<{
						id: string;
						name: string;
						startBar: number;
						endBar: number;
					}>;
			  }
			| null;
		let verse = snap?.sections?.find((s) => s.id === 'verse');
		expect(verse?.startBar).toBe(1);
		expect(verse?.endBar).toBe(6);
		expect(verse?.name).toBe('Verse');

		// Shrink Chorus from its left edge: 7..8.
		await callSongStore(page, 'updateSection', ['chorus', { startBar: 7 }]);
		snap = (await readCurrentSong(page)) as typeof snap;
		const chorus = snap?.sections?.find((s) => s.id === 'chorus');
		expect(chorus?.startBar).toBe(7);
		expect(chorus?.endBar).toBe(8);
		expect(chorus?.name).toBe('Chorus');

		// Only endBar update also applies cleanly.
		await callSongStore(page, 'updateSection', ['verse', { endBar: 10 }]);
		snap = (await readCurrentSong(page)) as typeof snap;
		verse = snap?.sections?.find((s) => s.id === 'verse');
		expect(verse?.startBar).toBe(1);
		expect(verse?.endBar).toBe(10);

		// Section count never changes under updateSection.
		expect(snap?.sections?.length).toBe(2);
	});
});
