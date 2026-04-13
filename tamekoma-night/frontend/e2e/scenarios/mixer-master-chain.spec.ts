// Master chain scenario.
//
// Verifies that master.chain mutations (via project.patch) work end-to-end.
// The frontend doesn't have a direct songStore.addMasterInsert helper today,
// so we exercise the apply path via songStore.applyPatch.

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-mixer-master-chain';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Master Chain',
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

test.describe('Mixer master chain via applyPatch', () => {
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

	test('add master volume + master insert via applyPatch', async ({ page, bridge }) => {
		expect(bridge.url).toBeTruthy();
		await page.goto(`/song/${SONG_ID}`);
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');
		await expect
			.poll(async () => (await readCurrentSong(page))?.id, { timeout: 5_000 })
			.toBe(SONG_ID);

		// Replace master volume.
		await callSongStore(page, 'applyPatch', [
			[{ op: 'replace', path: '/master/volume', value: 0.85 }]
		]);

		// Add a master saturation insert via the frontend `chain` field.
		await callSongStore(page, 'applyPatch', [
			[
				{
					op: 'add',
					path: '/master/chain/-',
					value: {
						id: 'm1',
						kind: 'insert',
						plugin: {
							format: 'builtin',
							uid: 'saturation',
							name: 'Saturation',
							vendor: 'Cadenza'
						},
						bypass: false,
						params: {}
					}
				}
			]
		]);

		await expect
			.poll(
				async () => {
					const snap = (await readCurrentSong(page)) as
						| {
								master?: {
									volume?: number;
									chain?: Array<{ id: string }>;
								};
						  }
						| null;
					return {
						volume: snap?.master?.volume ?? null,
						chain: snap?.master?.chain?.length ?? 0
					};
				},
				{ timeout: 3_000 }
			)
			.toMatchObject({ volume: 0.85, chain: 1 });
	});
});
