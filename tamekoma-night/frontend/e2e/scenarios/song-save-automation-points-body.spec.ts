// Song save — multi-point automation round-trip.
//
// addAutomationLane followed by several addAutomationPoint calls must
// produce a saveSong PUT body where the lane carries exactly those points
// (correct tick, value, curve). Guards against a lane being stomped down
// to a single point or stripped on serialize.

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-save-automation-points';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Automation Points',
		bpm: 120,
		timeSignature: '4/4',
		key: 'C',
		chordProgression: '| C |',
		sections: [{ id: 'sec1', name: 'A', startBar: 0, endBar: 4 }],
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

test.describe('Song save — automation points in PUT body', () => {
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

	test('lane with 3 addAutomationPoint calls serializes all points verbatim', async ({
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
		await callSongStore(page, 'addAutomationPoint', [
			'track-lead',
			nodeId,
			'cutoff',
			0,
			0.1,
			'linear'
		]);
		await callSongStore(page, 'addAutomationPoint', [
			'track-lead',
			nodeId,
			'cutoff',
			480,
			0.6,
			'hold'
		]);
		await callSongStore(page, 'addAutomationPoint', [
			'track-lead',
			nodeId,
			'cutoff',
			960,
			0.9,
			'linear'
		]);

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
		const t = body.tracks?.find((x) => x.id === 'track-lead');
		expect(t?.automation?.length).toBe(1);
		const lane = t?.automation?.[0];
		expect(lane?.nodeId).toBe(nodeId);
		expect(lane?.paramId).toBe('cutoff');
		expect(lane?.points.length).toBe(3);

		// Points should carry the tick/value/curve we supplied.
		const ticks = lane?.points.map((p) => p.tick).sort((a, b) => a - b);
		expect(ticks).toEqual([0, 480, 960]);
		const byTick = new Map(lane?.points.map((p) => [p.tick, p]));
		expect(byTick.get(0)?.value).toBe(0.1);
		expect(byTick.get(0)?.curve).toBe('linear');
		expect(byTick.get(480)?.value).toBe(0.6);
		expect(byTick.get(480)?.curve).toBe('hold');
		expect(byTick.get(960)?.value).toBe(0.9);
		expect(byTick.get(960)?.curve).toBe('linear');
	});
});
