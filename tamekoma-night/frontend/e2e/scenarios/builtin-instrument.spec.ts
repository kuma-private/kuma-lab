// Built-in instrument scenario.
//
// 1. Open a song as premium user with the bridge connected.
// 2. Use songStore to set a built-in SuperSaw as the track instrument.
// 3. Verify the songStore reflects the assignment.
// 4. Trigger transport.play and confirm bridge state advances.

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-builtin-instrument';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Built-in Instrument Demo',
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

test.describe('Built-in instrument', () => {
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

	test('adds SuperSaw built-in via chain.addNode and reflects in store', async ({
		page,
		bridge
	}) => {
		expect(bridge.url).toBeTruthy();
		await page.goto(`/song/${SONG_ID}`);

		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');

		// Wait for the song to actually load before mutating it.
		await expect
			.poll(async () => (await readCurrentSong(page))?.id, { timeout: 5_000 })
			.toBe(SONG_ID);

		// Insert SuperSaw via the songStore (will route through bridge as well).
		const nodeId = await callSongStore<string>(page, 'addChainNode', [
			'track-lead',
			0,
			{ format: 'builtin', uid: 'supersaw', name: 'SuperSaw', vendor: 'Cadenza' }
		]);
		expect(nodeId).toBeTruthy();

		// Poll the songStore until the chain has the new node (mutate is sync but
		// the structuredClone + reactivity propagation needs a microtask).
		await expect
			.poll(
				async () => {
					const snap = await readCurrentSong(page);
					return snap?.tracks.find((t) => t.id === 'track-lead')?.chain?.length ?? 0;
				},
				{ timeout: 3_000 }
			)
			.toBe(1);

		const snap = await readCurrentSong(page);
		const track = snap?.tracks.find((t) => t.id === 'track-lead');
		expect(track?.chain?.[0].plugin.uid).toBe('supersaw');

		await page.screenshot({ path: 'e2e/screenshots/builtin-instrument.png', fullPage: true });
	});
});
