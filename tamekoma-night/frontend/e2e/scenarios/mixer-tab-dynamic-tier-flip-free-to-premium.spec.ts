// Sister test to mixer-tab-dynamic-tier-flip.spec.ts. Round 1 covered
// premium → free at runtime (tabs disappear). This one is the other
// direction: start as free (no override, /auth/me returns tier=free) →
// Mixer + Automation tabs are absent → imperatively call
// planStore.setTier('premium') → both tabs show up without a reload.
// Locks in that the gating expression re-evaluates in the reactive
// direction we did not yet test.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-tab-tier-flip-free-to-premium';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Tab Tier Flip Free→Premium',
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

test.describe('Mixer tab reacts to planStore.setTier free → premium flip', () => {
	test.beforeEach(async ({ page }) => {
		// Wipe the premium-project override so we boot at tier=free.
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

	test('setTier(premium) at runtime reveals Mixer + Automation tabs', async ({
		page,
		bridge
	}) => {
		expect(bridge.url).toBeTruthy();
		await page.goto(`/song/${SONG_ID}`);
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');

		// Sanity: at boot (free tier) both tabs are absent.
		await expect(page.getByRole('tab', { name: 'Mixer' })).toHaveCount(0, { timeout: 5_000 });
		await expect(page.getByRole('tab', { name: 'Automation' })).toHaveCount(0);

		// Confirm planStore.tier is actually 'free' before we flip it, so
		// the assertion below proves a real transition.
		const tierBefore = await page.evaluate(() => {
			const w = window as unknown as {
				__cadenza?: { planStore?: { tier?: 'free' | 'premium' } };
			};
			return w.__cadenza?.planStore?.tier ?? null;
		});
		expect(tierBefore).toBe('free');

		// Flip to premium at runtime.
		await page.evaluate(() => {
			const w = window as unknown as {
				__cadenza?: { planStore?: { setTier?: (t: 'free' | 'premium') => void } };
			};
			w.__cadenza?.planStore?.setTier?.('premium');
		});

		// Both tabs should now appear.
		await expect(page.getByRole('tab', { name: 'Mixer' })).toBeVisible({ timeout: 5_000 });
		await expect(page.getByRole('tab', { name: 'Automation' })).toBeVisible();
	});
});
