// AI curve "Apply" path: replaceAutomationRange replaces points within
// [startTick, endTick) and preserves outside points.

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-automation-replace-range';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Replace Range',
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

test.describe('Automation replace range', () => {
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

	test('replaces points in range, preserves outside-of-range points', async ({
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

		// Set up: chain node + 4 points spanning ticks 0/240/480/720.
		const nodeId = await callSongStore<string>(page, 'addChainNode', [
			'track-lead',
			0,
			{ format: 'builtin', uid: 'svf', name: 'Filter', vendor: 'Cadenza' }
		]);
		await callSongStore(page, 'addAutomationLane', ['track-lead', nodeId, 'cutoff']);
		for (const tick of [0, 240, 480, 720]) {
			await callSongStore(page, 'addAutomationPoint', [
				'track-lead',
				nodeId,
				'cutoff',
				tick,
				0.25,
				'linear'
			]);
		}

		// Replace the range [240, 600) with 2 new points.
		await callSongStore(page, 'replaceAutomationRange', [
			'track-lead',
			nodeId,
			'cutoff',
			240,
			600,
			[
				{ id: 'new-1', tick: 240, value: 0.9, curve: 'linear' },
				{ id: 'new-2', tick: 480, value: 0.1, curve: 'linear' }
			]
		]);

		const snap = await readCurrentSong(page);
		const lane = snap?.tracks
			.find((t) => t.id === 'track-lead')
			?.automation?.find((a) => a.nodeId === nodeId && a.paramId === 'cutoff');
		const ticks = (lane?.points ?? []).map((p) => p.tick).sort((a, b) => a - b);

		// Original 0 and 720 stay; original 240 and 480 replaced; new 240 and 480 added.
		// 600 is exclusive so 720 is preserved. 0 is preserved (outside range).
		expect(ticks).toEqual([0, 240, 480, 720]);
		// Verify the values: 0 and 720 should still be 0.25, 240 and 480 should be 0.9 / 0.1.
		const byTick = new Map(
			(lane?.points ?? []).map((p) => [p.tick, p as { value: number }])
		);
		expect(byTick.get(0)?.value).toBe(0.25);
		expect(byTick.get(720)?.value).toBe(0.25);
		expect(byTick.get(240)?.value).toBe(0.9);
		expect(byTick.get(480)?.value).toBe(0.1);
	});
});
