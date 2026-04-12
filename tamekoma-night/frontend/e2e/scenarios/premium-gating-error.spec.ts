// Premium gating error scenario.
//
// Confirms a free user (no premium tier, no ticket) sees a premium_required
// error when they try to add a VST3 plugin via songStore. The bridgeStore
// surfaces the error via notifyPremiumRequired so an upgrade modal can show.

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-premium-gating';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Premium Gating',
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

test.describe('Premium gating error', () => {
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
		// IMPORTANT: report tier=free even though the storageState says premium.
		// The bridge will not have a ticket so vst3 commands are gated.
		await page.route('**/auth/me', (route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					name: 'Dev User',
					email: 'dev@test.com',
					sub: 'dev-user',
					tier: 'free'
				})
			})
		);
		// And the ticket endpoint denies issuance.
		await page.route('**/api/bridge/ticket', (route) =>
			route.fulfill({
				status: 403,
				contentType: 'application/json',
				body: JSON.stringify({ error: 'not_premium' })
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

	test('attempting to add a vst3 plugin surfaces premium_required', async ({ page, bridge }) => {
		expect(bridge.url).toBeTruthy();
		await page.goto(`/song/${SONG_ID}`);

		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');

		// Wait for song.
		await expect
			.poll(async () => (await readCurrentSong(page))?.id, { timeout: 5_000 })
			.toBe(SONG_ID);

		// Try to add a VST3 plugin via songStore.addChainNode. The store
		// will fire-and-forget the JSON Patch; the bridge rejects with
		// premium_required which the bridgeStore captures.
		await callSongStore(page, 'addChainNode', [
			'track-lead',
			0,
			{
				format: 'vst3',
				uid: 'fake-vst3-id',
				name: 'Some VST3',
				vendor: 'Vendor'
			}
		]);

		// Poll the bridgeStore for the premium-required signal.
		await expect
			.poll(
				async () => {
					return await page.evaluate(() => {
						const w = window as unknown as {
							__cadenza?: {
								bridgeStore?: {
									premiumRequiredPending?: boolean;
									premiumRequiredFeature?: string | null;
								};
							};
						};
						const b = w.__cadenza?.bridgeStore;
						return {
							pending: b?.premiumRequiredPending ?? false,
							feature: b?.premiumRequiredFeature ?? null
						};
					});
				},
				{ timeout: 5_000 }
			)
			.toMatchObject({ pending: true });

		await page.screenshot({
			path: 'e2e/screenshots/premium-gating-error.png',
			fullPage: true
		});
	});
});
