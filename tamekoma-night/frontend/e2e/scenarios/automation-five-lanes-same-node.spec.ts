// Five automation lanes on the SAME chain node, each for a different
// paramId. The existing automation-same-node-two-params spec covers two
// params; this one stresses the (nodeId, paramId) lane key with five
// simultaneous coexisting lanes.

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-automation-five-lanes-same-node';

const PARAM_IDS = ['cutoff', 'resonance', 'mode', 'drive', 'mix'] as const;

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Five Lanes Same Node',
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

test.describe('Automation — five lanes on the same node', () => {
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

	test('5 distinct paramIds on one nodeId coexist with isolated points', async ({
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
		expect(nodeId).toBeTruthy();

		for (let i = 0; i < PARAM_IDS.length; i++) {
			const paramId = PARAM_IDS[i];
			const added = await callSongStore<boolean>(page, 'addAutomationLane', [
				'track-lead',
				nodeId,
				paramId
			]);
			expect(added).toBe(true);
			// Seed each lane with one distinguishable point so we can tell
			// them apart later.
			await callSongStore(page, 'addAutomationPoint', [
				'track-lead',
				nodeId,
				paramId,
				120 * (i + 1),
				(i + 1) / 10,
				'linear'
			]);
		}

		const snap = await readCurrentSong(page);
		const track = snap?.tracks.find((t) => t.id === 'track-lead');
		const lanes = track?.automation ?? [];

		expect(lanes.length).toBe(5);
		// All five lanes live on the same nodeId.
		expect(lanes.every((l) => l.nodeId === nodeId)).toBe(true);
		// The paramIds are exactly our five, with no duplicates.
		const params = lanes.map((l) => l.paramId).sort();
		expect(params).toEqual([...PARAM_IDS].sort());

		// Each lane has exactly one point with the expected tick/value.
		for (let i = 0; i < PARAM_IDS.length; i++) {
			const paramId = PARAM_IDS[i];
			const lane = lanes.find((l) => l.paramId === paramId);
			expect(lane).toBeDefined();
			expect(lane?.points.length).toBe(1);
			expect(lane?.points[0].tick).toBe(120 * (i + 1));
			expect(lane?.points[0].value).toBeCloseTo((i + 1) / 10, 10);
		}
	});
});
