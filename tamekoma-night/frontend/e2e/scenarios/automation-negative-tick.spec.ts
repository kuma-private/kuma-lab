// Automation point with negative tick (boundary case).
//
// The store's addAutomationPoint does not reject or clamp tick values — the
// boundary/sanitization responsibility is on the UI layer (draw handlers,
// AI apply). This test locks in the current "raw store" behavior: if a
// caller passes a negative tick, the point lands verbatim and the lane's
// points array still contains it.

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-auto-negative-tick';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Negative Tick',
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

test.describe('Automation negative tick boundary', () => {
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

	test('addAutomationPoint accepts a negative tick verbatim (no clamp)', async ({
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

		// Seed a positive-tick point so the lane is not empty.
		await callSongStore(page, 'addAutomationPoint', [
			'track-lead',
			nodeId,
			'cutoff',
			480,
			0.5,
			'linear'
		]);

		// Boundary: negative tick. Store should NOT reject or clamp.
		const negPid = await callSongStore<string>(page, 'addAutomationPoint', [
			'track-lead',
			nodeId,
			'cutoff',
			-240,
			0.25,
			'linear'
		]);
		expect(negPid).toBeTruthy();

		await expect
			.poll(
				async () => {
					const snap = await readCurrentSong(page);
					const lane = snap?.tracks
						.find((t) => t.id === 'track-lead')
						?.automation?.find((a) => a.nodeId === nodeId && a.paramId === 'cutoff');
					return lane?.points.length ?? 0;
				},
				{ timeout: 3_000 }
			)
			.toBe(2);

		const snap = await readCurrentSong(page);
		const lane = snap?.tracks
			.find((t) => t.id === 'track-lead')
			?.automation?.find((a) => a.nodeId === nodeId && a.paramId === 'cutoff');
		const pts = lane?.points ?? [];
		const neg = pts.find((p) => p.id === negPid);
		expect(neg).toBeTruthy();
		// Verbatim: no clamp to 0.
		expect(neg?.tick).toBe(-240);
		expect(neg?.value).toBeCloseTo(0.25, 5);

		// The positive point is still present and untouched.
		const pos = pts.find((p) => p.tick === 480);
		expect(pos).toBeTruthy();
		expect(pos?.value).toBeCloseTo(0.5, 5);
	});
});
