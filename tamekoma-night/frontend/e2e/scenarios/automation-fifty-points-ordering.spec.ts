// Add 50 automation points to the same lane with monotonically increasing
// ticks, then query the lane and check the storage order.
//
// addAutomationPoint currently appends to the points array (no sort), so
// this test documents INSERTION order. Because the inserted ticks are
// already monotonically increasing, insertion order === tick order here.

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-auto-fifty-points';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Fifty Points',
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

test.describe('Automation 50 points monotonic', () => {
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

	test('adds 50 points monotonically and observes insertion = tick order', async ({
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

		const nodeId = await callSongStore<string>(page, 'addChainNode', [
			'track-lead',
			0,
			{ format: 'builtin', uid: 'svf', name: 'Filter', vendor: 'Cadenza' }
		]);
		await callSongStore(page, 'addAutomationLane', ['track-lead', nodeId, 'cutoff']);

		// 50 points at ticks 0, 50, 100, ..., 2450. Value ramps 0.0 → ~1.0.
		const N = 50;
		const expectedTicks = Array.from({ length: N }, (_, i) => i * 50);
		for (let i = 0; i < N; i++) {
			const value = i / (N - 1);
			await callSongStore(page, 'addAutomationPoint', [
				'track-lead',
				nodeId,
				'cutoff',
				expectedTicks[i],
				value,
				'linear'
			]);
		}

		const snap = await readCurrentSong(page);
		const lane = snap?.tracks
			.find((t) => t.id === 'track-lead')
			?.automation?.find((a) => a.nodeId === nodeId && a.paramId === 'cutoff');

		expect(lane?.points.length).toBe(N);

		const actualTicks = (lane?.points ?? []).map((p) => p.tick);

		// Documented behavior: addAutomationPoint appends, so the store
		// order matches insertion order. Since ticks were inserted
		// monotonically, the array is already tick-ordered without a sort.
		expect(actualTicks).toEqual(expectedTicks);

		// And a sort() is a no-op on this lane.
		const sortedTicks = [...actualTicks].sort((a, b) => a - b);
		expect(sortedTicks).toEqual(expectedTicks);

		// Spot-check the value ramp: first = 0, last ≈ 1.
		expect(lane?.points[0].value).toBe(0);
		expect(lane?.points[N - 1].value).toBeCloseTo(1, 6);
	});
});
