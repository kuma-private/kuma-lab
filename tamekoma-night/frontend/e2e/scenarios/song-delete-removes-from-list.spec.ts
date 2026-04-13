// songStore.deleteSong(id) scenario.
//
// After a successful DELETE /api/songs/{id}, the store drops the entry
// from `songs[]` and, when the deleted song was the currentSong, also
// clears currentSong. This locks in both effects in one imperative
// callSongStore('deleteSong') invocation so future refactors of the
// delete path keep the list + currentSong consistent.

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const KEEP_ID = 'song-delete-keep';
const DROP_ID = 'song-delete-drop';

function makeSong(id: string, title: string): Song {
	const now = new Date().toISOString();
	return {
		id,
		title,
		bpm: 120,
		timeSignature: '4/4',
		key: 'C',
		chordProgression: '| C |',
		sections: [],
		tracks: [],
		createdBy: 'dev-user',
		createdAt: now,
		lastEditedAt: now
	};
}

function toListItem(song: Song): SongListItem {
	return {
		id: song.id,
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
}

test.describe('Song delete removes from songs[]', () => {
	test.beforeEach(async ({ page }) => {
		const keep = makeSong(KEEP_ID, 'Keep Me');
		const drop = makeSong(DROP_ID, 'Drop Me');
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
				body: JSON.stringify([toListItem(keep), toListItem(drop)])
			})
		);
		await page.route(`**/api/songs/${KEEP_ID}`, (route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(keep)
			})
		);
		await page.route(`**/api/songs/${DROP_ID}`, (route) => {
			if (route.request().method() === 'DELETE') {
				route.fulfill({ status: 204, body: '' });
				return;
			}
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(drop)
			});
		});
	});

	test('deleteSong drops the entry from songs[] and clears currentSong', async ({
		page,
		bridge
	}) => {
		expect(bridge.url).toBeTruthy();
		// Land on the song we're going to delete so currentSong is set.
		await page.goto(`/song/${DROP_ID}`);
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');

		// Populate songs[] by invoking loadSongs.
		await callSongStore(page, 'loadSongs', []);
		await expect
			.poll(async () =>
				page.evaluate(() => {
					const w = window as unknown as {
						__cadenza?: { songStore?: { songs?: Array<{ id: string }> } };
					};
					return w.__cadenza?.songStore?.songs?.length ?? 0;
				})
			)
			.toBe(2);

		// Ensure currentSong is the one we're about to delete.
		await callSongStore(page, 'loadSong', [DROP_ID]);
		await expect
			.poll(async () =>
				page.evaluate(() => {
					const w = window as unknown as {
						__cadenza?: { songStore?: { currentSong?: { id?: string } | null } };
					};
					return w.__cadenza?.songStore?.currentSong?.id ?? null;
				})
			)
			.toBe(DROP_ID);

		// Act — delete the drop song.
		await callSongStore(page, 'deleteSong', [DROP_ID]);

		// songs[] should now contain only the keep entry.
		const idsAfter = await page.evaluate(() => {
			const w = window as unknown as {
				__cadenza?: { songStore?: { songs?: Array<{ id: string }> } };
			};
			return (w.__cadenza?.songStore?.songs ?? []).map((s) => s.id);
		});
		expect(idsAfter).toEqual([KEEP_ID]);

		// currentSong was the deleted one → cleared.
		const currentAfter = await page.evaluate(() => {
			const w = window as unknown as {
				__cadenza?: { songStore?: { currentSong?: { id?: string } | null } };
			};
			return w.__cadenza?.songStore?.currentSong;
		});
		expect(currentAfter).toBeNull();
	});
});
