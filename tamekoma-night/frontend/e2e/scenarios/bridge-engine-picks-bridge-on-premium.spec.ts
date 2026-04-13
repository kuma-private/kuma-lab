// Regression test for the engine-factory race fix.
//
// Before the fix in song/[id]/+page.svelte (waitForBridgeSettled), a
// Premium user opening a song page raced the bridge handshake on every
// mount. `buildEngine()` ran inside onMount synchronously, observed
// bridgeStore.state === 'idle' or 'connecting', and `chooseEngineKind()`
// fell back to 'tone'. The downstream $effect that was meant to rebuild
// the engine when state flipped to 'connected' never observably fired,
// so the user got stuck on Tone.js for the entire session — which meant
// no Bridge → CLAP/VST3 audio path, even though the bridge itself was
// fully capable.
//
// The fix awaits the bridge handshake before deciding engine kind for
// Premium users. This test pins that down: with bridge connected and
// tier=premium, songStore.engine.kind must reach 'bridge'.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-engine-bridge';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Engine Bridge',
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

test.describe('Bridge engine selection on Premium', () => {
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

	test('songStore.engine.kind is "bridge" once handshake completes', async ({
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

		// The fix waits for the handshake before deciding engine kind, so
		// engine.kind must be 'bridge' here. Poll briefly to absorb the
		// async buildEngine() finish.
		await expect
			.poll(
				async () =>
					page.evaluate(() => {
						const w = window as unknown as {
							__cadenza?: { songStore?: { engine?: { kind?: string } } };
						};
						return w.__cadenza?.songStore?.engine?.kind ?? null;
					}),
				{ timeout: 5_000 }
			)
			.toBe('bridge');
	});
});
