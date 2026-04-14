// Integration verification for the engine-race fix.
//
// bridge-engine-picks-bridge-on-premium.spec.ts proved the selection works
// (engine.kind becomes 'bridge'). This test goes one step further: it
// confirms the playback path actually reaches the bridge. We:
//
// 1. Load the song page as Premium, let the handshake settle, verify
//    engine.kind === 'bridge'.
// 2. Capture every outgoing frame on bridgeStore.client via a tiny wrapper
//    around send() (installed from the test, so we don't touch prod code).
// 3. Call songStore.engine.load(song) + engine.play() via page.evaluate.
// 4. Assert that both `project.load` and `transport.play` commands appear
//    in the captured outgoing list — i.e. the playback pipeline round-trips
//    through the bridge instead of the Tone fallback.
//
// This is what "the browser actually sends audio through the bridge" looks
// like at the protocol layer, minus the headless-audio output which the
// e2e fixture intentionally disables.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-engine-play-reaches';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Engine Play',
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

test.describe('Bridge engine — play reaches the bridge', () => {
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

	test('engine.play() emits project.load + transport.play on the bridge wire', async ({
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

		// Confirm the engine-race fix kicked in for this run.
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

		// Install a non-invasive send wrapper that logs every outgoing frame
		// into a bucket we can read back from the test. No prod code touched.
		await page.evaluate(() => {
			const w = window as unknown as {
				__cadenza?: {
					bridgeStore?: {
						client?: {
							send: (cmd: { type: string; [k: string]: unknown }) => Promise<unknown>;
						};
					};
				};
				__sent?: Array<{ type: string }>;
			};
			w.__sent = [];
			const c = w.__cadenza?.bridgeStore?.client;
			if (!c) return;
			const origSend = c.send.bind(c);
			c.send = async (cmd) => {
				(w.__sent as Array<{ type: string }>).push({ type: cmd.type });
				return origSend(cmd);
			};
		});

		// Drive engine.load + engine.play through the public PlaybackEngine
		// API on songStore. (BridgeEngine.load sends project.load, play sends
		// transport.play.)
		await page.evaluate(async () => {
			const w = window as unknown as {
				__cadenza?: {
					songStore?: {
						currentSong?: unknown;
						engine?: {
							kind?: string;
							load?: (song: unknown) => Promise<void>;
							play?: () => Promise<void>;
						};
					};
				};
			};
			const ss = w.__cadenza?.songStore;
			const engine = ss?.engine;
			if (!engine?.load || !engine.play || !ss?.currentSong) return;
			try {
				await engine.load(ss.currentSong);
			} catch {
				// project.load may error under headless fixture audio; keep going
			}
			try {
				await engine.play();
			} catch {
				// ditto for transport.play
			}
		});

		const sent = await page.evaluate(() => {
			const w = window as unknown as { __sent?: Array<{ type: string }> };
			return w.__sent ?? [];
		});
		const types = sent.map((f) => f.type);
		expect(types).toContain('project.load');
		expect(types).toContain('transport.play');
	});
});
