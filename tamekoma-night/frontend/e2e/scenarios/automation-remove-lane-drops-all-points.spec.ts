// removeAutomationLane must drop ALL points in that lane, not just the
// lane shell. The existing automation-add-remove-lane spec covers the
// empty-lane case; this one seeds multiple points first so we can prove
// every point is gone after removal, while a sibling lane on the SAME
// track stays completely untouched.

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-automation-remove-lane-drops-all';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Remove Lane Drops All',
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

test.describe('Automation remove lane drops all its points', () => {
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

	test('removing a lane with 4 points clears every point and leaves siblings alone', async ({
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

		// Lane #1: cutoff with 4 points.
		await callSongStore(page, 'addAutomationLane', ['track-lead', nodeId, 'cutoff']);
		const cutoffPointIds: string[] = [];
		for (const [tick, value] of [
			[0, 0.1],
			[240, 0.4],
			[480, 0.7],
			[720, 1.0]
		] as const) {
			const id = await callSongStore<string>(page, 'addAutomationPoint', [
				'track-lead',
				nodeId,
				'cutoff',
				tick,
				value,
				'linear'
			]);
			cutoffPointIds.push(id);
		}

		// Lane #2 (sibling): resonance with 1 point that must survive.
		await callSongStore(page, 'addAutomationLane', ['track-lead', nodeId, 'resonance']);
		const resoPid = await callSongStore<string>(page, 'addAutomationPoint', [
			'track-lead',
			nodeId,
			'resonance',
			360,
			0.55,
			'linear'
		]);

		// Sanity: 2 lanes, 4 + 1 points.
		{
			const snap = await readCurrentSong(page);
			const lanes = snap?.tracks.find((t) => t.id === 'track-lead')?.automation ?? [];
			expect(lanes.length).toBe(2);
			const cutoff = lanes.find((l) => l.paramId === 'cutoff');
			const reso = lanes.find((l) => l.paramId === 'resonance');
			expect(cutoff?.points.length).toBe(4);
			expect(reso?.points.length).toBe(1);
		}

		// Remove the cutoff lane.
		await callSongStore(page, 'removeAutomationLane', ['track-lead', nodeId, 'cutoff']);

		const snap = await readCurrentSong(page);
		const lanes = snap?.tracks.find((t) => t.id === 'track-lead')?.automation ?? [];

		// Cutoff lane is gone — no lane shell and no orphan points.
		expect(lanes.find((l) => l.paramId === 'cutoff')).toBeUndefined();

		// Walk the entire automation array and make sure none of the cutoff
		// point ids exist anywhere (prove we dropped ALL points, not just
		// the shell).
		const allPointIds = lanes.flatMap((l) => l.points.map((p) => p.id));
		for (const pid of cutoffPointIds) {
			expect(allPointIds).not.toContain(pid);
		}

		// Sibling resonance lane is fully intact.
		expect(lanes.length).toBe(1);
		const reso = lanes[0];
		expect(reso.paramId).toBe('resonance');
		expect(reso.points.length).toBe(1);
		expect(reso.points[0].id).toBe(resoPid);
		expect(reso.points[0].tick).toBe(360);
		expect(reso.points[0].value).toBe(0.55);
	});
});
