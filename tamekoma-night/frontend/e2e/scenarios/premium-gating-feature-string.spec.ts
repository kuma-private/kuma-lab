// Sister to premium-gating-error / premium-gating-clap. Those assert that
// `premiumRequiredPending` flips to true after a gated VST3/CLAP add. This
// test instead asserts that `premiumRequiredFeature` is populated with a
// non-null human-readable label so the upgrade modal has something to show.

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-premium-feature-string';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Premium Feature String',
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

test.describe('Premium gating — feature label is populated on rejection', () => {
	test.beforeEach(async ({ page }) => {
		// Wipe the dev plan override seeded by the premium project's
		// storageState so /auth/me's tier=free actually takes effect.
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

	test('premiumRequiredFeature is a non-empty string after a vst3 rejection', async ({
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

		// Trigger the gate.
		await callSongStore(page, 'addChainNode', [
			'track-lead',
			0,
			{ format: 'vst3', uid: 'fake-vst3', name: 'Some VST3', vendor: 'Vendor' }
		]);

		// Wait for both pending=true AND a feature label to appear.
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
						const b = w.__cadenza?.bridgeStore;
						return {
							pending: b?.premiumRequiredPending ?? false,
							feature: b?.premiumRequiredFeature ?? null
						};
					}),
				{ timeout: 5_000 }
			)
			.toMatchObject({ pending: true });

		// Now snapshot the feature label and assert it's a non-empty string.
		const feature = await page.evaluate(() => {
			const w = window as unknown as {
				__cadenza?: { bridgeStore?: { premiumRequiredFeature?: string | null } };
			};
			return w.__cadenza?.bridgeStore?.premiumRequiredFeature ?? null;
		});
		expect(feature).not.toBeNull();
		expect(typeof feature).toBe('string');
		expect((feature ?? '').length).toBeGreaterThan(0);
	});
});
