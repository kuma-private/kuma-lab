// hydrateSong must default `master` when the wire sends JSON null
// (not merely `undefined` / missing). The default is {chain:[], volume:1}.
//
// This locks in the nullish-coalescing semantics of hydrateSong — if
// someone changes `??` to `||` or a strict `=== undefined` check, this
// case regresses and the Mixer master strip breaks.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-hydration-null-master';

function makeSong(): Record<string, unknown> {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Null Master Hydration',
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
				solo: false
			}
		],
		createdBy: 'dev-user',
		createdAt: now,
		lastEditedAt: now,
		// Entire master object is explicitly null on the wire.
		master: null
	};
}

test.describe('Hydration with master=null', () => {
	test.beforeEach(async ({ page }) => {
		const song = makeSong();
		const listItem: SongListItem = {
			id: SONG_ID,
			title: song.title as string,
			bpm: song.bpm as number,
			key: song.key as string,
			timeSignature: song.timeSignature as string,
			createdByName: 'Dev User',
			createdAt: song.createdAt as string,
			lastEditedBy: 'Dev User',
			lastEditedAt: song.lastEditedAt as string,
			trackCount: 1,
			sectionCount: 1,
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

	test('master=null becomes {chain:[], volume:1} after hydrateSong', async ({
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

		const snap = (await readCurrentSong(page)) as
			| { master?: { chain?: unknown; volume?: number } | null }
			| null;
		expect(snap).not.toBeNull();
		// master must be an object (not null, not undefined).
		expect(snap?.master).not.toBeNull();
		expect(typeof snap?.master).toBe('object');
		expect(snap?.master?.chain).toEqual([]);
		expect(snap?.master?.volume).toBe(1);
	});
});
