// Automation point with value > 1 or value < 0 (no clamp at store layer).
//
// Param values in Cadenza are conventionally normalized [0..1], but the
// store layer (addAutomationPoint) is intentionally a raw setter: it does
// NOT clamp. Clamp/sanitization is the UI's job. This test pins that
// contract: out-of-range values land verbatim.

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-auto-value-oor';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Value Out Of Range',
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

test.describe('Automation point value out-of-range', () => {
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

	test('value > 1 and value < 0 land verbatim (store does not clamp)', async ({
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

		// value > 1
		const highPid = await callSongStore<string>(page, 'addAutomationPoint', [
			'track-lead',
			nodeId,
			'cutoff',
			0,
			1.75,
			'linear'
		]);
		// value < 0
		const lowPid = await callSongStore<string>(page, 'addAutomationPoint', [
			'track-lead',
			nodeId,
			'cutoff',
			480,
			-0.5,
			'linear'
		]);
		// value exactly 0 and 1 as controls
		await callSongStore(page, 'addAutomationPoint', [
			'track-lead',
			nodeId,
			'cutoff',
			240,
			0,
			'linear'
		]);
		await callSongStore(page, 'addAutomationPoint', [
			'track-lead',
			nodeId,
			'cutoff',
			720,
			1,
			'linear'
		]);

		expect(highPid).toBeTruthy();
		expect(lowPid).toBeTruthy();

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
			.toBe(4);

		const snap = await readCurrentSong(page);
		const lane = snap?.tracks
			.find((t) => t.id === 'track-lead')
			?.automation?.find((a) => a.nodeId === nodeId && a.paramId === 'cutoff');
		const pts = lane?.points ?? [];
		const high = pts.find((p) => p.id === highPid);
		const low = pts.find((p) => p.id === lowPid);

		// Verbatim — no clamp to [0..1].
		expect(high?.value).toBeCloseTo(1.75, 5);
		expect(low?.value).toBeCloseTo(-0.5, 5);
		// Control points unchanged.
		expect(pts.find((p) => p.tick === 240)?.value).toBe(0);
		expect(pts.find((p) => p.tick === 720)?.value).toBe(1);
	});
});
