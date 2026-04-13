// addAutomationLane on a (nodeId, paramId) pair that already has an
// existing lane with points — the call must:
//   1. return false (no-op),
//   2. NOT clear the existing lane's points,
//   3. NOT create a shadow second lane entry.
//
// `automation-add-remove-lane` covers the basic idempotency shape but
// exercises it on an empty lane. This test pins the "don't blow away
// existing data" contract explicitly — a regression here would silently
// erase the user's automation on any accidental +Lane click.

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-auto-dup-lane-preserve';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Duplicate Lane Preserves Points',
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

test.describe('Automation duplicate addLane preserves existing points', () => {
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

	test('re-adding an existing lane returns false and keeps all 3 points intact', async ({
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

		// First add creates the lane.
		const first = await callSongStore<boolean>(page, 'addAutomationLane', [
			'track-lead',
			nodeId,
			'cutoff'
		]);
		expect(first).toBe(true);

		// Seed 3 distinct points on the new lane.
		const pid1 = await callSongStore<string>(page, 'addAutomationPoint', [
			'track-lead',
			nodeId,
			'cutoff',
			0,
			0.1,
			'linear'
		]);
		const pid2 = await callSongStore<string>(page, 'addAutomationPoint', [
			'track-lead',
			nodeId,
			'cutoff',
			480,
			0.5,
			'hold'
		]);
		const pid3 = await callSongStore<string>(page, 'addAutomationPoint', [
			'track-lead',
			nodeId,
			'cutoff',
			960,
			0.9,
			'ease-in'
		]);

		// Duplicate add #1.
		const second = await callSongStore<boolean>(page, 'addAutomationLane', [
			'track-lead',
			nodeId,
			'cutoff'
		]);
		expect(second).toBe(false);

		// Duplicate add #2 (triple-tap resilience).
		const third = await callSongStore<boolean>(page, 'addAutomationLane', [
			'track-lead',
			nodeId,
			'cutoff'
		]);
		expect(third).toBe(false);

		// Still exactly 1 lane.
		const snap = await readCurrentSong(page);
		const track = snap?.tracks.find((t) => t.id === 'track-lead');
		expect(track?.automation?.length).toBe(1);

		const lane = track?.automation?.find((a) => a.nodeId === nodeId && a.paramId === 'cutoff');
		expect(lane).toBeTruthy();

		// All 3 points are still present with their original ids and data.
		expect(lane?.points.length).toBe(3);
		const byId = new Map((lane?.points ?? []).map((p) => [p.id, p]));
		const p1 = byId.get(pid1);
		const p2 = byId.get(pid2);
		const p3 = byId.get(pid3);
		expect(p1?.tick).toBe(0);
		expect(p1?.value).toBeCloseTo(0.1, 5);
		expect(p1?.curve).toBe('linear');
		expect(p2?.tick).toBe(480);
		expect(p2?.value).toBeCloseTo(0.5, 5);
		expect(p2?.curve).toBe('hold');
		expect(p3?.tick).toBe(960);
		expect(p3?.value).toBeCloseTo(0.9, 5);
		expect(p3?.curve).toBe('ease-in');
	});
});
