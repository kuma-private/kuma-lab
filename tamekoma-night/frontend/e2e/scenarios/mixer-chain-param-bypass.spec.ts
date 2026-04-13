// Verifies setChainParam works on multiple params of the same node
// and that toggling bypass on then off doesn't reset other params.

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-chain-param-bypass';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Param Bypass',
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

test.describe('Chain param + bypass interplay', () => {
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

	test('SVF cutoff/resonance + bypass roundtrip', async ({ page, bridge }) => {
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

		// Set 3 params.
		await callSongStore(page, 'setChainParam', ['track-lead', nodeId, 'cutoff', 1500]);
		await callSongStore(page, 'setChainParam', ['track-lead', nodeId, 'resonance', 0.7]);
		await callSongStore(page, 'setChainParam', ['track-lead', nodeId, 'mode', 1]);

		// Toggle bypass on, then off.
		await callSongStore(page, 'setChainBypass', ['track-lead', nodeId, true]);
		await callSongStore(page, 'setChainBypass', ['track-lead', nodeId, false]);

		// All 3 params should still be at their set values.
		const snap = await readCurrentSong(page);
		const node = snap?.tracks
			.find((t) => t.id === 'track-lead')
			?.chain?.find((n) => n.id === nodeId) as
			| { bypass?: boolean; params?: Record<string, number> }
			| undefined;
		expect(node?.bypass).toBe(false);
		expect(node?.params?.cutoff).toBe(1500);
		expect(node?.params?.resonance).toBe(0.7);
		expect(node?.params?.mode).toBe(1);
	});
});
