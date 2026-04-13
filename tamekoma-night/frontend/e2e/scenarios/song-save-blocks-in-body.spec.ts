// Song save — directive blocks survive the PUT round-trip.
//
// There's a history in this codebase of saveSong dropping optional fields
// (buses/master was the last culprit). This spec locks in that the blocks
// array on each track is echoed into the PUT body and lands intact with
// their ids, startBar/endBar, and directives strings.

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-save-blocks-body';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Save Blocks',
		bpm: 120,
		timeSignature: '4/4',
		key: 'C',
		chordProgression: '| C | F |',
		sections: [{ id: 'sec1', name: 'A', startBar: 0, endBar: 4 }],
		tracks: [
			{
				id: 'track-lead',
				name: 'Lead',
				instrument: 'piano',
				blocks: [
					{ id: 'blk-existing', startBar: 0, endBar: 2, directives: '@mode: chord' }
				],
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

test.describe('Song save — blocks survive the PUT body', () => {
	let putBody: unknown = null;

	test.beforeEach(async ({ page }) => {
		putBody = null;
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
		await page.route(`**/api/songs/${SONG_ID}`, async (route) => {
			if (route.request().method() === 'PUT') {
				try {
					putBody = JSON.parse(route.request().postData() ?? '{}');
				} catch {
					putBody = null;
				}
				// Always echo id so hydrateSong has a valid root.
				const echoed = { id: SONG_ID, ...(putBody as object) };
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify(echoed)
				});
			} else {
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify(song)
				});
			}
		});
	});

	test('saveSong PUT body includes blocks (not dropped like buses used to be)', async ({
		page,
		bridge
	}) => {
		expect(bridge.url).toBeTruthy();
		await page.goto(`/song/${SONG_ID}`);
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');

		// Add a brand-new block and update the existing one. Both mutations
		// must land in the PUT body.
		await callSongStore(page, 'addBlock', [
			'track-lead',
			{ id: 'blk-new', startBar: 2, endBar: 4, directives: '@mode: arpUp' }
		]);
		await callSongStore(page, 'updateBlock', [
			'track-lead',
			'blk-existing',
			{ directives: '@mode: chord\n@velocity: p' }
		]);

		await callSongStore(page, 'saveSong', []);
		await expect.poll(() => putBody !== null, { timeout: 5_000 }).toBe(true);

		const body = putBody as {
			tracks?: Array<{
				id?: string;
				blocks?: Array<{
					id: string;
					startBar: number;
					endBar: number;
					directives: string;
				}>;
			}>;
		};
		const t = body.tracks?.find((x) => x.id === 'track-lead');
		expect(t, 'track-lead should be in PUT body').toBeDefined();
		expect(t?.blocks, 'blocks must not be dropped from PUT body').toBeDefined();
		expect(Array.isArray(t?.blocks)).toBe(true);
		expect(t?.blocks?.length).toBe(2);

		const existing = t?.blocks?.find((b) => b.id === 'blk-existing');
		const added = t?.blocks?.find((b) => b.id === 'blk-new');
		expect(existing?.directives).toBe('@mode: chord\n@velocity: p');
		expect(existing?.startBar).toBe(0);
		expect(existing?.endBar).toBe(2);
		expect(added?.directives).toBe('@mode: arpUp');
		expect(added?.startBar).toBe(2);
		expect(added?.endBar).toBe(4);
	});
});
