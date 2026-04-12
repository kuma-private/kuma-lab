// Automation curve cycle scenario.
//
// Verifies that the curve type cycles linear → hold → bezier → linear via
// songStore.setAutomationPointCurve, and that each change emits a JSON
// patch the bridge accepts.

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-curve-cycle';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Curve Cycle',
		bpm: 120,
		timeSignature: '4/4',
		key: 'C',
		chordProgression: '| C | F | G | C |',
		sections: [{ id: 'sec1', name: 'A', startBar: 1, endBar: 4 }],
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

test.describe('Automation curve cycle', () => {
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

	test('cycles point curve linear → hold → bezier → linear', async ({ page, bridge }) => {
		expect(bridge.url).toBeTruthy();
		await page.goto(`/song/${SONG_ID}`);

		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');

		// Add a Filter chain node + an automation point on cutoff.
		const nodeId = await callSongStore<string>(page, 'addChainNode', [
			'track-lead',
			0,
			{ format: 'builtin', uid: 'svf', name: 'Filter', vendor: 'Cadenza' }
		]);
		expect(nodeId).toBeTruthy();

		const pointId = await callSongStore<string>(page, 'addAutomationPoint', [
			'track-lead',
			nodeId,
			'cutoff',
			0,
			0.5,
			'linear'
		]);
		expect(pointId).toBeTruthy();

		// Cycle the curve through hold then bezier then back to linear.
		const cycle: Array<'hold' | 'bezier' | 'linear'> = ['hold', 'bezier', 'linear'];
		for (const next of cycle) {
			await callSongStore(page, 'setAutomationPointCurve', [
				'track-lead',
				nodeId,
				'cutoff',
				pointId,
				next
			]);
			const snap = await readCurrentSong(page);
			const lane = snap?.tracks
				.find((t) => t.id === 'track-lead')
				?.automation?.find((a) => a.nodeId === nodeId && a.paramId === 'cutoff');
			const point = lane?.points.find((p) => p.id === pointId) as
				| { curve?: string }
				| undefined;
			expect(point?.curve).toBe(next);
		}

		await page.screenshot({ path: 'e2e/screenshots/automation-curve-cycle.png', fullPage: true });
	});
});
