// Song store — per-track block CRUD: addBlock, updateBlock, removeBlock.
//
// Verifies:
//   - addBlock appends to the target track's blocks array.
//   - addBlock / removeBlock on track A does not affect track B
//     (blocks are independent per track, not aliased across tracks).
//   - updateBlock patches fields on the block matching the given id,
//     leaving sibling blocks and non-updated fields (startBar/endBar)
//     untouched.

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-block-crud';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Block CRUD',
		bpm: 120,
		timeSignature: '4/4',
		key: 'C',
		chordProgression: '| C |',
		sections: [{ id: 'sec1', name: 'A', startBar: 0, endBar: 4 }],
		tracks: [
			{
				id: 'track-a',
				name: 'Track A',
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
				id: 'track-b',
				name: 'Track B',
				instrument: 'bass',
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

async function readTracks(page: import('@playwright/test').Page) {
	return page.evaluate(() => {
		const w = window as unknown as {
			__cadenza?: {
				songStore?: {
					currentSong?: {
						tracks: Array<{
							id: string;
							blocks: Array<{
								id: string;
								startBar: number;
								endBar: number;
								directives: string;
							}>;
						}>;
					};
				};
			};
		};
		const cur = w.__cadenza?.songStore?.currentSong;
		if (!cur) return null;
		return JSON.parse(JSON.stringify(cur.tracks)) as Array<{
			id: string;
			blocks: Array<{ id: string; startBar: number; endBar: number; directives: string }>;
		}>;
	});
}

test.describe('songStore — block CRUD per track', () => {
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

	test('addBlock / updateBlock / removeBlock keep tracks independent', async ({
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

		// Seed: 2 blocks on track-a, 1 block on track-b.
		await callSongStore(page, 'addBlock', [
			'track-a',
			{ id: 'blk-a1', startBar: 0, endBar: 2, directives: '@mode: chord' }
		]);
		await callSongStore(page, 'addBlock', [
			'track-a',
			{ id: 'blk-a2', startBar: 2, endBar: 4, directives: '@mode: arpUp' }
		]);
		await callSongStore(page, 'addBlock', [
			'track-b',
			{ id: 'blk-b1', startBar: 0, endBar: 4, directives: '@velocity: mf' }
		]);

		const t1 = await readTracks(page);
		expect(t1).not.toBeNull();
		expect(t1!.find((t) => t.id === 'track-a')?.blocks.map((b) => b.id)).toEqual([
			'blk-a1',
			'blk-a2'
		]);
		expect(t1!.find((t) => t.id === 'track-b')?.blocks.map((b) => b.id)).toEqual(['blk-b1']);

		// updateBlock: patch blk-a2.directives and verify the partial update
		// does not clobber startBar/endBar nor touch blk-a1 / track-b.
		await callSongStore(page, 'updateBlock', [
			'track-a',
			'blk-a2',
			{ directives: '@mode: pluck\n@velocity: ff' }
		]);
		const t2 = await readTracks(page);
		const a1 = t2!.find((t) => t.id === 'track-a')!.blocks.find((b) => b.id === 'blk-a1');
		const a2 = t2!.find((t) => t.id === 'track-a')!.blocks.find((b) => b.id === 'blk-a2');
		expect(a1?.directives).toBe('@mode: chord');
		expect(a1?.startBar).toBe(0);
		expect(a1?.endBar).toBe(2);
		expect(a2?.directives).toBe('@mode: pluck\n@velocity: ff');
		// Partial merge must preserve positional fields.
		expect(a2?.startBar).toBe(2);
		expect(a2?.endBar).toBe(4);

		// removeBlock: drop blk-a1 from track-a; track-b must be untouched.
		await callSongStore(page, 'removeBlock', ['track-a', 'blk-a1']);
		const t3 = await readTracks(page);
		expect(t3!.find((t) => t.id === 'track-a')!.blocks.map((b) => b.id)).toEqual(['blk-a2']);
		expect(t3!.find((t) => t.id === 'track-b')!.blocks.map((b) => b.id)).toEqual(['blk-b1']);
	});
});
