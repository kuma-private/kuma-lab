// UI — Premium gating at the tab / navigation level.
//
// Complements the existing premium-* / mixer-tab-dynamic-tier-flip-* specs
// which cover data-layer gating (JSON Patch ops, backend ticket checks,
// instrument-ref shapes). This file asserts the *UI surface* stays in sync
// with planStore.tier for both the initial render and runtime flips.
//
// Uses the premium project's storageState by default, but flips the plan
// via localStorage mid-spec to exercise both directions.

import { test, expect } from '../fixtures/full-stack';
import { readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-ui-premium-gate';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Premium Gate',
		bpm: 120,
		timeSignature: '4/4',
		key: 'C',
		chordProgression: '| C |',
		sections: [{ id: 's1', name: 'A', startBar: 0, endBar: 4 }],
		tracks: [
			{
				id: 'track-piano',
				name: 'Piano',
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

async function stub(
	page: import('@playwright/test').Page,
	tier: 'free' | 'premium'
): Promise<void> {
	const song = makeSong();
	const li: SongListItem = {
		id: SONG_ID,
		title: song.title,
		bpm: song.bpm,
		key: song.key,
		timeSignature: song.timeSignature,
		createdByName: 'u',
		createdAt: song.createdAt,
		lastEditedBy: 'u',
		lastEditedAt: song.lastEditedAt,
		trackCount: 1,
		sectionCount: 1,
		visibility: 'private'
	};
	await page.route('**/auth/me', (r) =>
		r.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({
				name: 'u',
				email: 'u@t.com',
				sub: 'dev-user',
				tier
			})
		})
	);
	await page.route('**/api/songs', (r) =>
		r.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify([li])
		})
	);
	await page.route(`**/api/songs/${SONG_ID}`, (r) =>
		r.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify(song)
		})
	);
}

test.describe('Premium-gated tab UI', () => {
	test('premium user sees Mixer + Automation tabs', async ({ page }) => {
		await stub(page, 'premium');
		await page.goto(`/song/${SONG_ID}`);
		await expect
			.poll(async () => (await readCurrentSong(page))?.id, { timeout: 8_000 })
			.toBe(SONG_ID);

		await expect(page.getByRole('tab', { name: 'Mixer' })).toBeVisible();
		await expect(page.getByRole('tab', { name: 'Automation' })).toBeVisible();
	});

	test('runtime flip premium→free hides Mixer + Automation tabs', async ({
		page
	}) => {
		await stub(page, 'premium');
		await page.goto(`/song/${SONG_ID}`);
		await expect
			.poll(async () => (await readCurrentSong(page))?.id, { timeout: 8_000 })
			.toBe(SONG_ID);

		// Flip plan to free via planStore.setTier and verify tabs disappear.
		await page.evaluate(() => {
			const w = window as unknown as {
				__cadenza?: { planStore?: { setTier?: (t: 'free' | 'premium') => void } };
			};
			w.__cadenza?.planStore?.setTier?.('free');
		});

		await expect(page.getByRole('tab', { name: 'Mixer' })).toHaveCount(0, {
			timeout: 3_000
		});
		await expect(page.getByRole('tab', { name: 'Automation' })).toHaveCount(0);
	});

	test('runtime flip free→premium reveals Mixer + Automation tabs', async ({
		page
	}) => {
		await stub(page, 'premium'); // Still needed for API tier consistency
		await page.goto(`/song/${SONG_ID}`);
		await expect
			.poll(async () => (await readCurrentSong(page))?.id, { timeout: 8_000 })
			.toBe(SONG_ID);

		// Start on free
		await page.evaluate(() => {
			(
				window as unknown as {
					__cadenza?: { planStore?: { setTier?: (t: 'free' | 'premium') => void } };
				}
			).__cadenza?.planStore?.setTier?.('free');
		});
		await expect(page.getByRole('tab', { name: 'Mixer' })).toHaveCount(0);

		// Flip back to premium
		await page.evaluate(() => {
			(
				window as unknown as {
					__cadenza?: { planStore?: { setTier?: (t: 'free' | 'premium') => void } };
				}
			).__cadenza?.planStore?.setTier?.('premium');
		});

		await expect(page.getByRole('tab', { name: 'Mixer' })).toBeVisible({
			timeout: 3_000
		});
		await expect(page.getByRole('tab', { name: 'Automation' })).toBeVisible();
	});

	test('Flow / Visualizer / Text tabs remain visible at both tiers', async ({
		page
	}) => {
		await stub(page, 'premium');
		await page.goto(`/song/${SONG_ID}`);
		await expect
			.poll(async () => (await readCurrentSong(page))?.id, { timeout: 8_000 })
			.toBe(SONG_ID);

		for (const tier of ['premium', 'free'] as const) {
			await page.evaluate((t) => {
				(
					window as unknown as {
						__cadenza?: { planStore?: { setTier?: (t: 'free' | 'premium') => void } };
					}
				).__cadenza?.planStore?.setTier?.(t);
			}, tier);
			await expect(
				page.getByRole('tab', { name: 'Flow' }),
				`Flow at ${tier}`
			).toBeVisible();
			await expect(
				page.getByRole('tab', { name: 'Visualizer' }),
				`Visualizer at ${tier}`
			).toBeVisible();
			await expect(
				page.getByRole('tab', { name: 'Text' }),
				`Text at ${tier}`
			).toBeVisible();
		}
	});
});
