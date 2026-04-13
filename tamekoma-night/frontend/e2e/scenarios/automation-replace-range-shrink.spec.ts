// replaceAutomationRange shrink case.
//
// Existing coverage:
//   - automation-replace-range: 4 points → in-range replaced with 2 (same tick count).
//   - automation-replace-range-edge: empty replacement clears in-range.
//
// This test seeds MORE in-range points (6) and replaces them with FEWER
// non-empty points (2). The resulting lane must drop the shrunken-out
// ticks entirely and keep outside points untouched.

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-auto-replace-shrink';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Replace Range Shrink',
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

test.describe('Automation replace range shrink', () => {
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

	test('replacing 6 in-range points with 2 shrinks the lane correctly', async ({
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

		// Seed 8 points: 0 and 1000 are outside the replace range (kept);
		// 100/200/300/400/500/600 are in-range (to be shrunk to 2).
		const seedTicks = [0, 100, 200, 300, 400, 500, 600, 1000];
		for (const tick of seedTicks) {
			await callSongStore(page, 'addAutomationPoint', [
				'track-lead',
				nodeId,
				'cutoff',
				tick,
				0.5,
				'linear'
			]);
		}

		// Verify seed landed.
		{
			const snap = await readCurrentSong(page);
			const lane = snap?.tracks
				.find((t) => t.id === 'track-lead')
				?.automation?.find((a) => a.nodeId === nodeId && a.paramId === 'cutoff');
			expect(lane?.points.length).toBe(8);
		}

		// Replace [100, 700) with only 2 points. The 6 in-range points
		// (100..600) should be removed, outside 0 and 1000 stay.
		await callSongStore(page, 'replaceAutomationRange', [
			'track-lead',
			nodeId,
			'cutoff',
			100,
			700,
			[
				{ id: 'shrunk-a', tick: 150, value: 0.8, curve: 'linear' },
				{ id: 'shrunk-b', tick: 650, value: 0.2, curve: 'linear' }
			]
		]);

		const snap = await readCurrentSong(page);
		const lane = snap?.tracks
			.find((t) => t.id === 'track-lead')
			?.automation?.find((a) => a.nodeId === nodeId && a.paramId === 'cutoff');
		const ticks = (lane?.points ?? []).map((p) => p.tick).sort((a, b) => a - b);

		// Before: 8 points. After: 4 (0, 150, 650, 1000).
		expect(lane?.points.length).toBe(4);
		expect(ticks).toEqual([0, 150, 650, 1000]);

		const byTick = new Map(
			(lane?.points ?? []).map((p) => [p.tick, p as { value: number }])
		);
		expect(byTick.get(0)?.value).toBe(0.5);
		expect(byTick.get(1000)?.value).toBe(0.5);
		expect(byTick.get(150)?.value).toBe(0.8);
		expect(byTick.get(650)?.value).toBe(0.2);
	});
});
