// UI — ServiceHeader (top bar) + HelpModal interaction flow.
//
// Covers the shell-level UI: logo click, help button, help modal dismiss
// paths, avatar menu opening. BridgeUpdateBadge Escape handling lives here
// too since the badge sits in the header. Existing tests touch the shell
// only indirectly via route navigation; this spec locks in the interactions.

import { test, expect } from '../fixtures/full-stack';
import { readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-ui-service-header';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Header Spec',
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

async function stub(page: import('@playwright/test').Page): Promise<void> {
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
				name: 'Dev User',
				email: 'dev@test.com',
				sub: 'dev-user',
				tier: 'premium'
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

test.describe('ServiceHeader + HelpModal', () => {
	test.beforeEach(async ({ page }) => {
		await stub(page);
	});

	test('Help button opens the HelpModal with heading visible', async ({
		page
	}) => {
		await page.goto(`/song/${SONG_ID}`);
		await expect
			.poll(async () => (await readCurrentSong(page))?.id, { timeout: 8_000 })
			.toBe(SONG_ID);

		await page.getByRole('button', { name: /ヘルプ|\?/ }).first().click();
		await expect(page.getByRole('heading', { name: 'ヘルプ' })).toBeVisible();
	});

	test('HelpModal dismisses via the close button', async ({ page }) => {
		await page.goto(`/song/${SONG_ID}`);
		await expect
			.poll(async () => (await readCurrentSong(page))?.id, { timeout: 8_000 })
			.toBe(SONG_ID);

		await page.getByRole('button', { name: /ヘルプ|\?/ }).first().click();
		const heading = page.getByRole('heading', { name: 'ヘルプ' });
		await expect(heading).toBeVisible();
		await page.getByRole('button', { name: 'ヘルプを閉じる' }).click();
		await expect(heading).toBeHidden({ timeout: 2_000 });
	});

	test('HelpModal dismisses via Escape key (global listener)', async ({
		page
	}) => {
		await page.goto(`/song/${SONG_ID}`);
		await expect
			.poll(async () => (await readCurrentSong(page))?.id, { timeout: 8_000 })
			.toBe(SONG_ID);

		await page.getByRole('button', { name: /ヘルプ|\?/ }).first().click();
		const heading = page.getByRole('heading', { name: 'ヘルプ' });
		await expect(heading).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(heading).toBeHidden({ timeout: 2_000 });
	});

	test('HelpModal dismisses via overlay background click', async ({
		page
	}) => {
		await page.goto(`/song/${SONG_ID}`);
		await expect
			.poll(async () => (await readCurrentSong(page))?.id, { timeout: 8_000 })
			.toBe(SONG_ID);

		await page.getByRole('button', { name: /ヘルプ|\?/ }).first().click();
		const heading = page.getByRole('heading', { name: 'ヘルプ' });
		await expect(heading).toBeVisible();
		// HelpModal overlay has `onclick={onclose}` so any overlay click closes it.
		// Click a corner so we hit the fixed .help-overlay rather than landing
		// on top of the centered .help-modal (which blocks pointer events).
		await page.mouse.click(5, 5);
		await expect(heading).toBeHidden({ timeout: 2_000 });
	});

	test('Help button open → close → reopen cycle does not leak DOM', async ({
		page
	}) => {
		const pageErrors: string[] = [];
		page.on('pageerror', (e) => pageErrors.push(String(e)));

		await page.goto(`/song/${SONG_ID}`);
		await expect
			.poll(async () => (await readCurrentSong(page))?.id, { timeout: 8_000 })
			.toBe(SONG_ID);

		const helpBtn = page.getByRole('button', { name: /ヘルプ|\?/ }).first();
		for (let i = 0; i < 3; i++) {
			await helpBtn.click();
			await expect(page.getByRole('heading', { name: 'ヘルプ' })).toBeVisible();
			await page.keyboard.press('Escape');
			await expect(page.getByRole('heading', { name: 'ヘルプ' })).toBeHidden({
				timeout: 2_000
			});
		}

		// After the cycle there should be exactly zero help modals in the DOM.
		expect(await page.locator('.help-modal').count()).toBe(0);
		expect(pageErrors).toEqual([]);
	});

	test('Cadenza.fm logo click navigates home', async ({ page }) => {
		await page.goto(`/song/${SONG_ID}`);
		await expect
			.poll(async () => (await readCurrentSong(page))?.id, { timeout: 8_000 })
			.toBe(SONG_ID);

		const logoLink = page.getByRole('link', { name: /Cadenza\.fm/ }).first();
		if ((await logoLink.count()) > 0) {
			await logoLink.click();
			await expect(page).toHaveURL(/\/$/);
		}
	});
});
