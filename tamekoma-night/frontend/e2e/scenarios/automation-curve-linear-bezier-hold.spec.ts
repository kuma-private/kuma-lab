// Automation: set a single point's curve through the specific sequence
// linear → bezier → hold, asserting the `curve` field in the store after
// EACH mutation.
//
// Distinct from `automation-curve-cycle` (which runs linear → hold →
// bezier → linear) in that it asserts the bezier-first ordering and the
// final state ends on `hold`. This locks in that setAutomationPointCurve
// works from any prior value, not just the previous cycle step.

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-auto-curve-lbh';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Curve Linear Bezier Hold',
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

test.describe('Automation curve linear→bezier→hold', () => {
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

	test('sets curve linear → bezier → hold and verifies after each step', async ({
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

		const pointId = await callSongStore<string>(page, 'addAutomationPoint', [
			'track-lead',
			nodeId,
			'cutoff',
			0,
			0.5,
			'linear'
		]);
		expect(pointId).toBeTruthy();

		const readCurve = async () => {
			const snap = await readCurrentSong(page);
			const lane = snap?.tracks
				.find((t) => t.id === 'track-lead')
				?.automation?.find((a) => a.nodeId === nodeId && a.paramId === 'cutoff');
			const p = lane?.points.find((x) => x.id === pointId) as { curve?: string } | undefined;
			return p?.curve;
		};

		// Initial state: linear (seeded).
		await expect.poll(readCurve, { timeout: 3_000 }).toBe('linear');

		// linear → bezier
		await callSongStore(page, 'setAutomationPointCurve', [
			'track-lead',
			nodeId,
			'cutoff',
			pointId,
			'bezier'
		]);
		await expect.poll(readCurve, { timeout: 3_000 }).toBe('bezier');

		// bezier → hold
		await callSongStore(page, 'setAutomationPointCurve', [
			'track-lead',
			nodeId,
			'cutoff',
			pointId,
			'hold'
		]);
		await expect.poll(readCurve, { timeout: 3_000 }).toBe('hold');

		// Sanity: only one point on the lane, untouched tick/value.
		const snap = await readCurrentSong(page);
		const lane = snap?.tracks
			.find((t) => t.id === 'track-lead')
			?.automation?.find((a) => a.nodeId === nodeId && a.paramId === 'cutoff');
		expect(lane?.points.length).toBe(1);
		expect(lane?.points[0].tick).toBe(0);
		expect(lane?.points[0].value).toBe(0.5);
	});
});
