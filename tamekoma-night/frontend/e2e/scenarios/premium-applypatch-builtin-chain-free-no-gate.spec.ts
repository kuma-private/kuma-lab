// Negative gating test: a FREE user whose applyPatch inserts a *builtin*
// chain node must NOT raise premium_required. This is the sister test to
// premium-builtin-chain-no-gate (which uses addChainNode on a premium
// user) and the applyPatch counterpart to premium-gating-applypatch-chain-vst3
// (which does vst3 on free). Together they lock in the matrix: only
// premium-format plugins trip the gate, regardless of whether the request
// shape is a direct store method or a raw applyPatch op.

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-applypatch-builtin-chain-free-ok';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'ApplyPatch Builtin Chain Free',
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

test.describe('Premium gating (negative) — applyPatch builtin chain on free user', () => {
	test.beforeEach(async ({ page }) => {
		// Force free tier by clearing the storageState premium override.
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

	test('applyPatch add builtin chain-node on free user does NOT raise premium_required', async ({
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

		// Sanity: free tier.
		const tier = await page.evaluate(() => {
			const w = window as unknown as { __cadenza?: { planStore?: { tier?: string } } };
			return w.__cadenza?.planStore?.tier ?? null;
		});
		expect(tier).toBe('free');

		// applyPatch chain-node add, but with a *builtin* plugin — should
		// be allowed for free.
		await callSongStore(page, 'applyPatch', [
			[
				{
					op: 'add',
					path: '/tracks/track-lead/chain/-',
					value: {
						id: 'node-gain-free',
						kind: 'insert',
						plugin: {
							format: 'builtin',
							uid: 'gain',
							name: 'Gain',
							vendor: 'Cadenza'
						},
						bypass: false,
						params: {}
					}
				}
			]
		]);

		// Give any async dispatch a beat to land.
		await page.waitForTimeout(500);

		const flag = await page.evaluate(() => {
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
		expect(flag.pending).toBe(false);
		expect(flag.feature).toBeNull();

		// And the chain on the local store reflects the new builtin node.
		const snap = await readCurrentSong(page);
		const t = snap?.tracks.find((x) => x.id === 'track-lead');
		expect(t?.chain?.length ?? 0).toBeGreaterThan(0);
		expect(t?.chain?.[0]?.plugin?.uid).toBe('gain');
	});
});
