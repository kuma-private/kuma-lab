// Burst of rapid mutations followed by an immediate saveSong: the save
// PUT body must reflect the *final* state of every field, not an
// intermediate snapshot. Catches a regression where saveSong reads a
// stale closure of currentSong.

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-rapid-mutate-save';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Rapid Mutate Save',
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

test.describe('Rapid mutate → save final state', () => {
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
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify(putBody ?? song)
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

	test('30 rapid setTrackVolume calls + save → PUT has the final value', async ({
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

		// Rapid burst of 30 different volumes. Final value: -7.5.
		const finalVolume = await page.evaluate(() => {
			const w = window as unknown as {
				__cadenza?: {
					songStore?: { setTrackVolume: (id: string, v: number) => void };
				};
			};
			let v = 0;
			for (let i = 0; i < 30; i++) {
				v = -i * 0.25;
				w.__cadenza?.songStore?.setTrackVolume('track-lead', v);
			}
			return v;
		});
		expect(finalVolume).toBe(-7.25);

		await callSongStore(page, 'saveSong', []);

		await expect.poll(() => putBody !== null, { timeout: 5_000 }).toBe(true);
		const body = putBody as { tracks?: Array<{ id: string; volume?: number }> };
		const t = body.tracks?.find((x) => x.id === 'track-lead');
		expect(t?.volume).toBe(-7.25);
	});
});
