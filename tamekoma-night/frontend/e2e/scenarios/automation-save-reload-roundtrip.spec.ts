// Automation lane survives a saveSong → reload round-trip.
//
// Mutates an automation lane + points via the songStore, calls saveSong(),
// captures the PUT body, then makes subsequent GETs return that captured
// body. Reloading the page re-hydrates currentSong from the "server" copy
// and the automation lane/points must still be present.
//
// `song-save-roundtrip` already covers the PUT body contents. This test
// locks in the reverse direction: the automation data survives the full
// serialize → deserialize → re-hydrate cycle on the frontend.

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-auto-save-reload';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Save Reload Automation',
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

test.describe('Automation save → reload round-trip', () => {
	// Holds the persisted song so later GETs can echo it back.
	let persisted: Song | null = null;

	test.beforeEach(async ({ page }) => {
		persisted = null;
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
		// GET returns either the original song or the persisted copy after PUT.
		// PUT merges the payload (which only carries mutable fields) back over
		// the base song so identity fields (id/createdBy/createdAt) stay intact.
		await page.route(`**/api/songs/${SONG_ID}`, async (route) => {
			const req = route.request();
			if (req.method() === 'PUT') {
				try {
					const payload = JSON.parse(req.postData() ?? '{}') as Partial<Song>;
					persisted = { ...song, ...payload, id: SONG_ID } as Song;
				} catch {
					persisted = null;
				}
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify(persisted ?? song)
				});
			} else {
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify(persisted ?? song)
				});
			}
		});
	});

	test('lane + points survive saveSong and reload-from-mock', async ({ page, bridge }) => {
		expect(bridge.url).toBeTruthy();
		await page.goto(`/song/${SONG_ID}`);
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');
		await expect
			.poll(async () => (await readCurrentSong(page))?.id, { timeout: 5_000 })
			.toBe(SONG_ID);

		// Seed chain + lane + two points.
		const nodeId = await callSongStore<string>(page, 'addChainNode', [
			'track-lead',
			0,
			{ format: 'builtin', uid: 'svf', name: 'Filter', vendor: 'Cadenza' }
		]);
		await callSongStore(page, 'addAutomationLane', ['track-lead', nodeId, 'cutoff']);
		await callSongStore(page, 'addAutomationPoint', [
			'track-lead',
			nodeId,
			'cutoff',
			0,
			0.15,
			'linear'
		]);
		await callSongStore(page, 'addAutomationPoint', [
			'track-lead',
			nodeId,
			'cutoff',
			480,
			0.85,
			'ease-in'
		]);

		// Save — PUT handler captures the payload.
		await callSongStore(page, 'saveSong', []);
		await expect.poll(() => persisted !== null, { timeout: 5_000 }).toBe(true);

		// Fully reload the page. The GET now returns the persisted copy.
		await page.reload();
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');
		await expect
			.poll(async () => (await readCurrentSong(page))?.id, { timeout: 5_000 })
			.toBe(SONG_ID);

		// Automation lane + points must still be there after re-hydration.
		const snap = await readCurrentSong(page);
		const track = snap?.tracks.find((t) => t.id === 'track-lead');
		expect(track?.automation?.length).toBe(1);
		const lane = track?.automation?.[0];
		expect(lane?.nodeId).toBe(nodeId);
		expect(lane?.paramId).toBe('cutoff');
		const ticks = (lane?.points ?? []).map((p) => p.tick).sort((a, b) => a - b);
		expect(ticks).toEqual([0, 480]);
		const byTick = new Map((lane?.points ?? []).map((p) => [p.tick, p]));
		expect(byTick.get(0)?.value).toBeCloseTo(0.15, 5);
		expect(byTick.get(480)?.value).toBeCloseTo(0.85, 5);
	});
});
