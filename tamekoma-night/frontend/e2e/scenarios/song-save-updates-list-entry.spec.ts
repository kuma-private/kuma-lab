// saveSong → songs[] list-entry update scenario.
//
// After a successful PUT, songStore.saveSong patches the matching
// SongListItem in songs[] in-place so the list card reflects the new
// title / bpm / lastEditedAt without refetching /api/songs. This test
// locks in two invariants:
//   (1) the list length stays the same (the entry is mutated, not
//       pushed as a duplicate)
//   (2) the fields on the entry reflect the saved values (title,
//       bpm, lastEditedAt)
//
// The PUT mock echoes the request body with a bumped lastEditedAt so
// we can cleanly differentiate the saved value from the original.

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-save-updates-list-entry';
const OTHER_ID = 'song-save-updates-list-other';

const ORIGINAL_EDITED_AT = '2026-01-01T00:00:00.000Z';
const NEW_EDITED_AT = '2026-04-13T12:34:56.000Z';

function makeSong(id: string, title: string, bpm: number): Song {
	return {
		id,
		title,
		bpm,
		timeSignature: '4/4',
		key: 'C',
		chordProgression: '| C |',
		sections: [],
		tracks: [],
		createdBy: 'dev-user',
		createdAt: ORIGINAL_EDITED_AT,
		lastEditedAt: ORIGINAL_EDITED_AT
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

test.describe('saveSong updates the matching songs[] list entry', () => {
	test.beforeEach(async ({ page }) => {
		const target = makeSong(SONG_ID, 'Original Title', 120);
		const other = makeSong(OTHER_ID, 'Other Song', 90);

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
				body: JSON.stringify([toListItem(target), toListItem(other)])
			})
		);
		await page.route(`**/api/songs/${OTHER_ID}`, (route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(other)
			})
		);
		await page.route(`**/api/songs/${SONG_ID}`, async (route) => {
			if (route.request().method() === 'PUT') {
				let body: Record<string, unknown> = {};
				try {
					body = JSON.parse(route.request().postData() ?? '{}');
				} catch {
					body = {};
				}
				// Server bumps lastEditedAt and echoes back. Critically: id
				// must be present so hydrateSong/store.update can key off it.
				const echoed = {
					...body,
					id: SONG_ID,
					lastEditedAt: NEW_EDITED_AT
				};
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify(echoed)
				});
				return;
			}
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(target)
			});
		});
	});

	test('saveSong mutates the matching songs[] entry in-place (no duplicate)', async ({
		page,
		bridge
	}) => {
		expect(bridge.url).toBeTruthy();
		await page.goto(`/song/${SONG_ID}`);
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');

		// Populate songs[] and confirm the starting state.
		await callSongStore(page, 'loadSongs', []);
		await expect
			.poll(async () =>
				page.evaluate(() => {
					const w = window as unknown as {
						__cadenza?: { songStore?: { songs?: unknown[] } };
					};
					return w.__cadenza?.songStore?.songs?.length ?? 0;
				})
			)
			.toBe(2);

		// Mutate title + bpm on currentSong, then save.
		await page.evaluate(() => {
			const w = window as unknown as {
				__cadenza?: { songStore?: { currentSong: Record<string, unknown> | null } };
			};
			const cur = w.__cadenza?.songStore?.currentSong;
			if (!cur) throw new Error('currentSong not loaded');
			cur.title = 'Updated Title';
			cur.bpm = 150;
		});
		await callSongStore(page, 'saveSong', []);

		// Read back songs[] — same length, target entry updated, other
		// entry untouched.
		const snap = await page.evaluate(() => {
			const w = window as unknown as {
				__cadenza?: {
					songStore?: {
						songs?: Array<{
							id: string;
							title: string;
							bpm: number;
							lastEditedAt: string;
						}>;
					};
				};
			};
			return w.__cadenza?.songStore?.songs ?? [];
		});
		expect(snap.length).toBe(2);

		const updated = snap.find((s) => s.id === SONG_ID);
		expect(updated).toBeDefined();
		expect(updated?.title).toBe('Updated Title');
		expect(updated?.bpm).toBe(150);
		expect(updated?.lastEditedAt).toBe(NEW_EDITED_AT);

		const untouched = snap.find((s) => s.id === OTHER_ID);
		expect(untouched?.title).toBe('Other Song');
		expect(untouched?.bpm).toBe(90);
		expect(untouched?.lastEditedAt).toBe(ORIGINAL_EDITED_AT);

		// Defensive: make sure there isn't a second SONG_ID entry appended.
		const matches = snap.filter((s) => s.id === SONG_ID);
		expect(matches.length).toBe(1);
	});
});
