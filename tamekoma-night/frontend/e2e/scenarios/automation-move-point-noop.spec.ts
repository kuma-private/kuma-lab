// moveAutomationPoint with the SAME tick and value (no-op).
//
// The store path still runs its mutate + JSON patch pair with identical
// values. This test documents the invariant: the point must still exist
// with the same id, tick, value, and curve, and the lane must still
// contain exactly one point.

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-automation-move-noop';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Move Point No-op',
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

test.describe('Automation move point no-op', () => {
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

	test('moveAutomationPoint with same tick + value leaves the point intact', async ({
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
		const pid = await callSongStore<string>(page, 'addAutomationPoint', [
			'track-lead',
			nodeId,
			'cutoff',
			360,
			0.42,
			'linear'
		]);
		expect(pid).toBeTruthy();

		// Fire moveAutomationPoint twice with the *exact* same values.
		await callSongStore(page, 'moveAutomationPoint', [
			'track-lead',
			nodeId,
			'cutoff',
			pid,
			360,
			0.42
		]);
		await callSongStore(page, 'moveAutomationPoint', [
			'track-lead',
			nodeId,
			'cutoff',
			pid,
			360,
			0.42
		]);

		const snap = await readCurrentSong(page);
		const lane = snap?.tracks
			.find((t) => t.id === 'track-lead')
			?.automation?.find((a) => a.nodeId === nodeId && a.paramId === 'cutoff');

		expect(lane).toBeDefined();
		expect(lane?.points.length).toBe(1);
		const p = lane?.points[0];
		expect(p?.id).toBe(pid);
		expect(p?.tick).toBe(360);
		expect(p?.value).toBe(0.42);
		// curve wasn't passed to moveAutomationPoint — the store's JSON patch
		// builds {id, tick, value} but the in-memory mutate only touches
		// tick + value, so curve should remain what we originally seeded.
		expect(p?.curve).toBe('linear');
	});
});
