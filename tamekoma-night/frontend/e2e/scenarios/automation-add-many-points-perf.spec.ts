// Performance smoke: 100 points added in sequence within a reasonable
// time budget. Ensures the structuredClone path doesn't degrade past
// usability for realistic automation densities.

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-many-points-perf';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Perf 100 pts',
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

test.describe('Automation 100-point performance smoke', () => {
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

	test('100 sequential addAutomationPoint calls finish within 8s', async ({
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

		// Run all 100 adds in a single page.evaluate to avoid round-trip
		// per call. This is the realistic burst pattern when AI generates
		// a curve.
		const elapsedMs = await page.evaluate(
			async (args) => {
				const w = window as unknown as {
					__cadenza?: {
						songStore?: {
							addAutomationPoint: (
								trackId: string,
								nodeId: string,
								paramId: string,
								tick: number,
								value: number,
								curve?: string
							) => string;
						};
					};
				};
				const ss = w.__cadenza?.songStore;
				if (!ss) return -1;
				const t0 = performance.now();
				for (let i = 0; i < 100; i++) {
					ss.addAutomationPoint(
						args.trackId,
						args.nodeId,
						args.paramId,
						i * 48,
						(i % 8) / 8,
						'linear'
					);
				}
				return performance.now() - t0;
			},
			{ trackId: 'track-lead', nodeId, paramId: 'cutoff' }
		);

		expect(elapsedMs).toBeGreaterThan(0);
		expect(elapsedMs).toBeLessThan(8_000);

		// Verify the points landed.
		const snap = await readCurrentSong(page);
		const lane = snap?.tracks
			.find((t) => t.id === 'track-lead')
			?.automation?.find((a) => a.nodeId === nodeId && a.paramId === 'cutoff');
		expect(lane?.points.length).toBe(100);
	});
});
