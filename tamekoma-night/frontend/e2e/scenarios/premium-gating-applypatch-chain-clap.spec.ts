// Free user → applyPatch that adds a chain node whose `plugin` field is a
// CLAP ref → premium_required. Sister to premium-gating-applypatch-
// instrument-vst3.spec.ts (instrument shape, vst3) and premium-gating-
// clap.spec.ts (addChainNode path). This one hits the chain-node applyPatch
// shape with a clap plugin — a combination the other gating specs do not
// already cover.

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-applypatch-chain-clap-gate';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'ApplyPatch Chain CLAP Gate',
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

test.describe('Premium gating — applyPatch chain node with CLAP plugin', () => {
	test.beforeEach(async ({ page }) => {
		// Wipe the premium override that the premium project's storageState
		// seeds, so /auth/me's tier=free actually downgrades us to free.
		await page.addInitScript(() => {
			window.localStorage.removeItem('cadenzaPlanOverride');
		});

		const song = makeSong();
		const listItem: SongListItem = {
			id: SONG_ID,
			title: song.title,
			bpm: song.bpm,
			key: song.key,
			timeSignature: song.timeSignature,
			createdByName: 'Free User',
			createdAt: song.createdAt,
			lastEditedBy: 'Free User',
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
					name: 'Free User',
					email: 'free@test.com',
					sub: 'free-user',
					tier: 'free'
				})
			})
		);
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

	test('applyPatch add chain-node with plugin.format=clap triggers gate', async ({
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

		// Add op on the chain array with a CLAP plugin embedded in the node
		// value — the shape the AI mixer chat would produce when inserting
		// a third-party CLAP effect.
		await callSongStore(page, 'applyPatch', [
			[
				{
					op: 'add',
					path: '/tracks/track-lead/chain/-',
					value: {
						id: 'node-evil-clap',
						kind: 'insert',
						plugin: {
							format: 'clap',
							uid: 'evil.clap',
							name: 'Evil CLAP',
							vendor: 'Vendor'
						},
						bypass: false,
						params: {}
					}
				}
			]
		]);

		await expect
			.poll(
				async () =>
					page.evaluate(() => {
						const w = window as unknown as {
							__cadenza?: {
								bridgeStore?: {
									premiumRequiredPending?: boolean;
									premiumRequiredFeature?: string | null;
								};
							};
						};
						return {
							pending: w.__cadenza?.bridgeStore?.premiumRequiredPending ?? false,
							feature: w.__cadenza?.bridgeStore?.premiumRequiredFeature ?? null
						};
					}),
				{ timeout: 5_000 }
			)
			.toMatchObject({ pending: true });
	});
});
