// Section CRUD via songStore — addSection / updateSection / removeSection.
// These are local-only mutations (no bridge round-trip) but they back the
// Flow editor's section bar, so a regression here breaks the Free-tier UX.

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-section-crud';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Section CRUD',
		bpm: 120,
		timeSignature: '4/4',
		key: 'C',
		chordProgression: '| C | F | G | C |',
		sections: [{ id: 'verse', name: 'Verse', startBar: 1, endBar: 4 }],
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

test.describe('Song section CRUD', () => {
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

	test('add → rename → remove sections preserves the right ordering', async ({
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

		// Add Chorus + Bridge.
		await callSongStore(page, 'addSection', [
			{ id: 'chorus', name: 'Chorus', startBar: 5, endBar: 8 }
		]);
		await callSongStore(page, 'addSection', [
			{ id: 'bridge', name: 'Bridge', startBar: 9, endBar: 12 }
		]);

		let snap = (await readCurrentSong(page)) as
			| { sections?: Array<{ id: string; name: string; startBar: number; endBar: number }> }
			| null;
		expect(snap?.sections?.length).toBe(3);
		expect(snap?.sections?.map((s) => s.id)).toEqual(['verse', 'chorus', 'bridge']);

		// Rename Chorus.
		await callSongStore(page, 'updateSection', ['chorus', { name: 'Chorus 1' }]);
		snap = (await readCurrentSong(page)) as typeof snap;
		const chorus = snap?.sections?.find((s) => s.id === 'chorus');
		expect(chorus?.name).toBe('Chorus 1');
		expect(chorus?.startBar).toBe(5);

		// Remove Bridge.
		await callSongStore(page, 'removeSection', ['bridge']);
		snap = (await readCurrentSong(page)) as typeof snap;
		expect(snap?.sections?.length).toBe(2);
		expect(snap?.sections?.map((s) => s.id)).toEqual(['verse', 'chorus']);
	});
});
