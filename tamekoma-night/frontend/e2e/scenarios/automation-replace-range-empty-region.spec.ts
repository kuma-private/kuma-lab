// replaceAutomationRange over a tick range that has NO existing points.
//
// The existing automation-replace-range spec exercises a range that
// contains existing points (mutation path). This test covers the
// insertion-only case: seed points outside the range, call
// replaceAutomationRange over an empty region, and verify the new
// points are added while every pre-existing point is preserved.

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-automation-replace-range-empty';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Replace Range Empty',
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

test.describe('Automation replaceRange on empty region', () => {
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

	test('adds new points without removing outside-of-range points', async ({
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

		// Seed two points at ticks 0 and 1200 — both outside the range we'll
		// replace (which is [300, 600)).
		const leftId = await callSongStore<string>(page, 'addAutomationPoint', [
			'track-lead',
			nodeId,
			'cutoff',
			0,
			0.1,
			'linear'
		]);
		const rightId = await callSongStore<string>(page, 'addAutomationPoint', [
			'track-lead',
			nodeId,
			'cutoff',
			1200,
			0.9,
			'linear'
		]);
		expect(leftId).toBeTruthy();
		expect(rightId).toBeTruthy();

		// Range [300, 600) contains zero existing points.
		await callSongStore(page, 'replaceAutomationRange', [
			'track-lead',
			nodeId,
			'cutoff',
			300,
			600,
			[
				{ tick: 360, value: 0.4, curve: 'linear' },
				{ tick: 540, value: 0.6, curve: 'linear' }
			]
		]);

		const snap = await readCurrentSong(page);
		const lane = snap?.tracks
			.find((t) => t.id === 'track-lead')
			?.automation?.find((a) => a.nodeId === nodeId && a.paramId === 'cutoff');
		expect(lane).toBeDefined();
		const points = lane?.points ?? [];
		expect(points.length).toBe(4);
		const ticks = points.map((p) => p.tick);
		expect(ticks).toEqual([0, 360, 540, 1200]);

		// Original outside-of-range points are preserved by id.
		const ids = new Set(points.map((p) => p.id));
		expect(ids.has(leftId!)).toBe(true);
		expect(ids.has(rightId!)).toBe(true);

		// Outside-range values untouched.
		const byTick = new Map(points.map((p) => [p.tick, p.value]));
		expect(byTick.get(0)).toBe(0.1);
		expect(byTick.get(1200)).toBe(0.9);
		expect(byTick.get(360)).toBe(0.4);
		expect(byTick.get(540)).toBe(0.6);
	});
});
