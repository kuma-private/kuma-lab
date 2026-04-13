// bridgeStore.clearPremiumRequired must clear a pending flag set by an
// actual Bridge rejection (not just a manual notifyPremiumRequired call).
// Exercises the real flow: free user triggers a gated command → bridge
// replies premium_required → flag set → user dismisses the modal →
// clearPremiumRequired() resets both the pending boolean AND the feature
// label. Sister to premium-notify-manual.spec.ts which only tests the
// imperative notify→clear path.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-clear-gate-pending';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Clear Gate',
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

test.describe('bridgeStore.clearPremiumRequired — real pending flag', () => {
	test.beforeEach(async ({ page }) => {
		// Wipe the premium override from the seeded storageState so
		// /auth/me's tier=free actually downgrades us.
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

	test('real premium_required sets pending; clearPremiumRequired resets', async ({
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

		// Trigger a gated command: addChainNode with a CLAP plugin. The
		// bridge should reply premium_required, which the song store
		// catches and forwards to bridgeStore.notifyPremiumRequired.
		await page.evaluate(async () => {
			const w = window as unknown as {
				__cadenza?: {
					songStore?: {
						addChainNode?: (
							trackId: string,
							index: number,
							plugin: { format: string; uid: string; name: string; vendor: string }
						) => Promise<unknown>;
					};
				};
			};
			try {
				await w.__cadenza?.songStore?.addChainNode?.('track-lead', 0, {
					format: 'clap',
					uid: 'gate.clap',
					name: 'Gate CLAP',
					vendor: 'Vendor'
				});
			} catch {
				/* expected */
			}
		});

		// Assert the flag is up with a non-null feature label.
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

		const flagged = await page.evaluate(() => {
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
		});
		expect(flagged.pending).toBe(true);
		// The feature label is a non-empty string set by the caller.
		expect(typeof flagged.feature === 'string' && flagged.feature.length > 0).toBe(true);

		// Now clear it — simulating the user dismissing the upgrade modal.
		await page.evaluate(() => {
			const w = window as unknown as {
				__cadenza?: { bridgeStore?: { clearPremiumRequired?: () => void } };
			};
			w.__cadenza?.bridgeStore?.clearPremiumRequired?.();
		});

		const cleared = await page.evaluate(() => {
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
		});
		expect(cleared.pending).toBe(false);
		expect(cleared.feature).toBeNull();
	});
});
