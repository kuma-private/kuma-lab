// Free-tier user clicks "新規Song" on the home page → POST /api/songs →
// redirects to /song/{id} → free-tier UI (no Mixer / Automation tabs).
//
// This exercises the create flow for the free tier, which wasn't
// previously covered: song-create-new exercises the premium path,
// song-free-flow-chord-visible loads an existing song. Here we create
// a new one AND verify the tier gating on arrival.

import { test, expect } from '../fixtures/full-stack';
import type { Song, SongListItem } from '../../src/lib/types/song';

const NEW_ID = 'song-free-create-new';

function makeMintedSong(): Song {
	const now = new Date().toISOString();
	return {
		id: NEW_ID,
		title: '無題のスコア',
		bpm: 120,
		timeSignature: '4/4',
		key: 'C',
		chordProgression: '| C |',
		sections: [],
		tracks: [],
		createdBy: 'dev-free',
		createdAt: now,
		lastEditedAt: now
	};
}

test.describe('Free-tier create new song', () => {
	test.beforeEach(async ({ page }) => {
		const minted = makeMintedSong();
		const listItem: SongListItem = {
			id: NEW_ID,
			title: minted.title,
			bpm: minted.bpm,
			key: minted.key,
			timeSignature: minted.timeSignature,
			createdByName: 'Free User',
			createdAt: minted.createdAt,
			lastEditedBy: 'Free User',
			lastEditedAt: minted.lastEditedAt,
			trackCount: 0,
			sectionCount: 0,
			visibility: 'private'
		};

		// Clear the premium dev override seeded by storageState so planStore
		// constructs as free. Must run before app scripts boot.
		await page.addInitScript(() => {
			try {
				window.localStorage.removeItem('cadenzaPlanOverride');
			} catch {
				/* ignore */
			}
		});

		await page.route('**/auth/me', (route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					name: 'Free User',
					email: 'free@test.com',
					sub: 'dev-free',
					tier: 'free'
				})
			})
		);

		await page.route('**/api/songs', (route) => {
			if (route.request().method() === 'POST') {
				route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify({ id: NEW_ID })
				});
				return;
			}
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify([listItem])
			});
		});

		await page.route(`**/api/songs/${NEW_ID}`, (route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(minted)
			})
		);
	});

	test('free user clicks 新規Song → POST → redirect → no Mixer tab', async ({ page }) => {
		const pageErrors: Error[] = [];
		page.on('pageerror', (err) => pageErrors.push(err));

		await page.goto('/');
		await expect(page).toHaveTitle(/Cadenza\.fm/);

		const newBtn = page.getByRole('button', { name: '新規Song' });
		await expect(newBtn).toBeVisible({ timeout: 10_000 });
		await newBtn.click();

		await page.waitForURL(`**/song/${NEW_ID}`, { timeout: 5_000 });

		// Flow tab is the default for free tier and must be selected.
		const flowTab = page.getByRole('tab', { name: 'Flow' });
		await expect(flowTab).toBeVisible({ timeout: 10_000 });
		await expect(flowTab).toHaveAttribute('aria-selected', 'true');

		// Mixer + Automation tabs MUST be hidden for free tier.
		await expect(page.getByRole('tab', { name: 'Mixer' })).toHaveCount(0);
		await expect(page.getByRole('tab', { name: 'Automation' })).toHaveCount(0);

		// Verify the song landed in the store with the minted id.
		await expect
			.poll(
				async () =>
					page.evaluate(() => {
						const w = window as unknown as {
							__cadenza?: { songStore?: { currentSong?: { id?: string } | null } };
						};
						return w.__cadenza?.songStore?.currentSong?.id ?? null;
					}),
				{ timeout: 5_000 }
			)
			.toBe(NEW_ID);

		expect(
			pageErrors,
			`page errors: ${pageErrors.map((e) => e.message).join('\n')}`
		).toEqual([]);
	});
});
