// moveAutomationPoint tick-conflict behavior.
//
// When moveAutomationPoint relocates a point onto a tick that already has
// another point, the current store implementation just writes the new
// tick/value in place — it does not dedupe or collapse. This test locks
// in that "both points coexist at the same tick" contract so any future
// dedup change is a deliberate decision instead of a silent regression.

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-auto-move-conflict';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Move Conflict',
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

test.describe('Automation move point tick conflict', () => {
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

	test('moving onto an occupied tick yields two points with identical ticks', async ({
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

		// Seed two points at distinct ticks.
		const pidA = await callSongStore<string>(page, 'addAutomationPoint', [
			'track-lead',
			nodeId,
			'cutoff',
			240,
			0.2,
			'linear'
		]);
		const pidB = await callSongStore<string>(page, 'addAutomationPoint', [
			'track-lead',
			nodeId,
			'cutoff',
			480,
			0.8,
			'linear'
		]);
		expect(pidA).not.toBe(pidB);

		// Move B onto A's tick with a fresh value.
		await callSongStore(page, 'moveAutomationPoint', [
			'track-lead',
			nodeId,
			'cutoff',
			pidB,
			240,
			0.55
		]);

		const snap = await readCurrentSong(page);
		const lane = snap?.tracks
			.find((t) => t.id === 'track-lead')
			?.automation?.find((a) => a.nodeId === nodeId && a.paramId === 'cutoff');
		const points = lane?.points ?? [];

		// Both points survive; both live at tick 240.
		expect(points.length).toBe(2);
		const at240 = points.filter((p) => p.tick === 240);
		expect(at240.length).toBe(2);
		// Distinct ids preserved (no dedup by id collapse).
		const ids = new Set(at240.map((p) => p.id));
		expect(ids.size).toBe(2);
		expect(ids.has(pidA)).toBe(true);
		expect(ids.has(pidB)).toBe(true);
		// A's value unchanged, B's value updated.
		expect(points.find((p) => p.id === pidA)?.value).toBe(0.2);
		expect(points.find((p) => p.id === pidB)?.value).toBe(0.55);
	});
});
