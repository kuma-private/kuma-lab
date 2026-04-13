// Song save — mutations do not auto-fire a PUT.
//
// The songStore mixer/automation methods (addChainNode, addSend, addBus,
// addAutomationPoint, setTrackVolume, …) mutate in-memory state and push
// a bridge patch, but they must NOT call api.updateSong on their own.
// The user-facing save button / autosave is the only path that should
// fire PUT /api/songs/{id}. A regression where any mutation helper calls
// saveSong() would spam the backend.

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-save-requires-explicit';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'No Auto Save',
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

test.describe('Song save — explicit call required', () => {
	let putCount = 0;
	let lastPutBody: unknown = null;

	test.beforeEach(async ({ page }) => {
		putCount = 0;
		lastPutBody = null;
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
				putCount++;
				try {
					lastPutBody = JSON.parse(route.request().postData() ?? '{}');
				} catch {
					lastPutBody = null;
				}
				const echoed = { id: SONG_ID, ...(lastPutBody as object) };
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

	test('mutations do not trigger saveSong; PUT only fires on explicit call', async ({
		page,
		bridge
	}) => {
		expect(bridge.url).toBeTruthy();
		await page.goto(`/song/${SONG_ID}`);
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');

		// Fire a wide variety of mutations — none should issue a PUT.
		const nodeId = await callSongStore<string>(page, 'addChainNode', [
			'track-lead',
			0,
			{ format: 'builtin', uid: 'svf', name: 'Filter', vendor: 'Cadenza' }
		]);
		await callSongStore(page, 'setChainParam', ['track-lead', nodeId, 'cutoff', 3200]);
		await callSongStore(page, 'setChainBypass', ['track-lead', nodeId, true]);
		const busId = await callSongStore<string>(page, 'addBus', ['Delay']);
		await callSongStore(page, 'addSend', ['track-lead', busId, 0.25]);
		await callSongStore(page, 'addAutomationLane', ['track-lead', nodeId, 'cutoff']);
		await callSongStore(page, 'addAutomationPoint', [
			'track-lead',
			nodeId,
			'cutoff',
			0,
			0.3,
			'linear'
		]);
		await callSongStore(page, 'setTrackVolume', ['track-lead', -4]);
		await callSongStore(page, 'setTrackPan', ['track-lead', 0.3]);

		// Give the bridge patch pipeline a beat to settle. Any accidental
		// auto-save would have landed by now.
		await page.waitForTimeout(400);
		expect(putCount).toBe(0);
		expect(lastPutBody).toBeNull();

		// Explicit save — single PUT fires.
		await callSongStore(page, 'saveSong', []);
		await expect.poll(() => putCount, { timeout: 5_000 }).toBe(1);
		expect(lastPutBody).not.toBeNull();

		// Another round of mutations with no save — counter still 1.
		await callSongStore(page, 'setChainParam', ['track-lead', nodeId, 'cutoff', 2000]);
		await callSongStore(page, 'setTrackVolume', ['track-lead', -6]);
		await page.waitForTimeout(400);
		expect(putCount).toBe(1);

		// Second explicit save — counter becomes 2.
		await callSongStore(page, 'saveSong', []);
		await expect.poll(() => putCount, { timeout: 5_000 }).toBe(2);
	});
});
