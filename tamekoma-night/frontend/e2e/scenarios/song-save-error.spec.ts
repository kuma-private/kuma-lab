// PUT /api/songs/{id} returns 500 — saveSong must surface the error
// and leave currentSong intact (no partial mutation, no crash).

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-save-error';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Save Error',
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

test.describe('Song save error', () => {
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
		await page.route(`**/api/songs/${SONG_ID}`, async (route) => {
			if (route.request().method() === 'PUT') {
				await route.fulfill({
					status: 500,
					contentType: 'application/json',
					body: JSON.stringify({ error: 'internal' })
				});
				return;
			}
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(song)
			});
		});
	});

	test('saveSong rejection sets store.error and preserves currentSong', async ({
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

		// Mutate locally so we have something to save.
		await callSongStore(page, 'addBus', ['Reverb']);
		await callSongStore(page, 'setTrackVolume', ['track-lead', -6]);

		// Save — should reject server-side.
		const result = await page.evaluate(async () => {
			const w = window as unknown as {
				__cadenza?: { songStore?: { saveSong?: () => Promise<void>; error?: string | null } };
			};
			const ss = w.__cadenza?.songStore;
			if (!ss?.saveSong) return { rejected: false, error: null };
			try {
				await ss.saveSong();
				return { rejected: false, error: null };
			} catch (e) {
				return { rejected: true, error: ss.error ?? null };
			}
		});

		expect(result.rejected).toBe(true);
		expect(result.error).toBeTruthy();

		// Local state should still hold our pre-save mutations.
		const snap = await readCurrentSong(page);
		const t = snap?.tracks.find((x) => x.id === 'track-lead') as
			| { volume?: number }
			| undefined;
		const buses = (snap as { buses?: Array<{ name: string }> })?.buses ?? [];
		expect(t?.volume).toBe(-6);
		expect(buses.length).toBe(1);
		expect(buses[0]?.name).toBe('Reverb');
	});
});
