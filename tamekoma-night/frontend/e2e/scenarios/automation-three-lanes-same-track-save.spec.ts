// Three automation lanes on three different nodes of the same track, then
// saveSong — verify all three lanes round-trip into the PUT body with the
// correct nodeId / paramId / point counts.
//
// `song-save-automation-points-body` covers 1 lane. `automation-multi-lane`
// covers the in-memory store shape. This test is the intersection: multiple
// lanes on the same track make it through the serializer into the outgoing
// PUT payload.

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-auto-three-lanes-save';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Three Lanes Save',
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

test.describe('Automation three lanes on same track saveSong', () => {
	let putBody: unknown = null;

	test.beforeEach(async ({ page }) => {
		putBody = null;
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
		await page.route(`**/api/songs/${SONG_ID}`, async (route) => {
			if (route.request().method() === 'PUT') {
				try {
					putBody = JSON.parse(route.request().postData() ?? '{}');
				} catch {
					putBody = null;
				}
				const echoed = { id: SONG_ID, ...(putBody as object) };
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify(echoed)
				});
			} else {
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify(song)
				});
			}
		});
	});

	test('3 lanes (3 nodes) + points land in PUT body', async ({ page, bridge }) => {
		expect(bridge.url).toBeTruthy();
		await page.goto(`/song/${SONG_ID}`);
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');
		await expect
			.poll(async () => (await readCurrentSong(page))?.id, { timeout: 5_000 })
			.toBe(SONG_ID);

		// Seed three distinct insert nodes on the same track.
		const filterId = await callSongStore<string>(page, 'addChainNode', [
			'track-lead',
			0,
			{ format: 'builtin', uid: 'svf', name: 'Filter', vendor: 'Cadenza' }
		]);
		const compId = await callSongStore<string>(page, 'addChainNode', [
			'track-lead',
			1,
			{ format: 'builtin', uid: 'comp', name: 'Compressor', vendor: 'Cadenza' }
		]);
		const delayId = await callSongStore<string>(page, 'addChainNode', [
			'track-lead',
			2,
			{ format: 'builtin', uid: 'delay', name: 'Delay', vendor: 'Cadenza' }
		]);
		expect(filterId).toBeTruthy();
		expect(compId).toBeTruthy();
		expect(delayId).toBeTruthy();

		// Lane 1: filter cutoff — 2 points.
		await callSongStore(page, 'addAutomationLane', ['track-lead', filterId, 'cutoff']);
		await callSongStore(page, 'addAutomationPoint', [
			'track-lead',
			filterId,
			'cutoff',
			0,
			0.2,
			'linear'
		]);
		await callSongStore(page, 'addAutomationPoint', [
			'track-lead',
			filterId,
			'cutoff',
			480,
			0.8,
			'linear'
		]);

		// Lane 2: compressor threshold — 3 points.
		await callSongStore(page, 'addAutomationLane', ['track-lead', compId, 'threshold']);
		await callSongStore(page, 'addAutomationPoint', [
			'track-lead',
			compId,
			'threshold',
			0,
			0.5,
			'hold'
		]);
		await callSongStore(page, 'addAutomationPoint', [
			'track-lead',
			compId,
			'threshold',
			240,
			0.6,
			'hold'
		]);
		await callSongStore(page, 'addAutomationPoint', [
			'track-lead',
			compId,
			'threshold',
			960,
			0.4,
			'linear'
		]);

		// Lane 3: delay mix — 1 point.
		await callSongStore(page, 'addAutomationLane', ['track-lead', delayId, 'mix']);
		await callSongStore(page, 'addAutomationPoint', [
			'track-lead',
			delayId,
			'mix',
			0,
			0.33,
			'linear'
		]);

		// Save and inspect the PUT body.
		await callSongStore(page, 'saveSong', []);
		await expect.poll(() => putBody !== null, { timeout: 5_000 }).toBe(true);

		const body = putBody as {
			tracks?: Array<{
				id?: string;
				automation?: Array<{
					nodeId: string;
					paramId: string;
					points: Array<{ tick: number; value: number; curve?: string }>;
				}>;
			}>;
		};

		const track = body.tracks?.find((t) => t.id === 'track-lead');
		expect(track).toBeTruthy();
		expect(track?.automation?.length).toBe(3);

		const lanes = track?.automation ?? [];
		const byKey = new Map(lanes.map((l) => [`${l.nodeId}::${l.paramId}`, l]));

		const l1 = byKey.get(`${filterId}::cutoff`);
		expect(l1).toBeTruthy();
		expect(l1?.points.length).toBe(2);
		expect(l1?.points.map((p) => p.tick).sort((a, b) => a - b)).toEqual([0, 480]);

		const l2 = byKey.get(`${compId}::threshold`);
		expect(l2).toBeTruthy();
		expect(l2?.points.length).toBe(3);
		expect(l2?.points.map((p) => p.tick).sort((a, b) => a - b)).toEqual([0, 240, 960]);

		const l3 = byKey.get(`${delayId}::mix`);
		expect(l3).toBeTruthy();
		expect(l3?.points.length).toBe(1);
		expect(l3?.points[0].tick).toBe(0);
		expect(l3?.points[0].value).toBeCloseTo(0.33, 5);
	});
});
