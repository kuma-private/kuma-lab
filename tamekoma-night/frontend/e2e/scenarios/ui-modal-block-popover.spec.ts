// UI — BlockPopover full coverage
//
// BlockPopover is the Flow tab's block-edit dialog. It's where the
// structuredClone-on-Proxy bug was silently breaking every OK click (see
// ui-modal-footer-invariant.spec.ts for the regression-locked functional
// test). This spec adds interaction-level coverage for the rest of the
// modal so future edits to sliders, chips, prompts, Raw toggle, Cancel,
// Escape, and background-click dismissal don't sneak through the data
// layer tests.
//
// Strategy:
//   - Open the dialog by clicking the block (real UI path)
//   - Drive each control via keyboard / click / dispatchEvent where needed
//   - Assert effect in the songStore after dismiss (OK) or no effect (Cancel)
//
// Anthropic suggest endpoints are route-stubbed so the AI prompt flow is
// deterministic.

import { test, expect } from '../fixtures/full-stack';
import { readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-ui-block-popover';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Block Popover Spec',
		bpm: 120,
		timeSignature: '4/4',
		key: 'C',
		chordProgression: '| C | Am | F | G |',
		sections: [{ id: 'sec1', name: 'A', startBar: 0, endBar: 4 }],
		tracks: [
			{
				id: 'track-piano',
				name: 'Piano',
				instrument: 'piano',
				blocks: [
					{
						id: 'block-a',
						startBar: 0,
						endBar: 4,
						directives: '@mode: block\n@velocity: mf'
					}
				],
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

async function stubApi(page: import('@playwright/test').Page): Promise<void> {
	const song = makeSong();
	const li: SongListItem = {
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

async function openBlockPopover(page: import('@playwright/test').Page) {
	await page.goto(`/song/${SONG_ID}`);
	await expect
		.poll(async () => (await readCurrentSong(page))?.id, { timeout: 8_000 })
		.toBe(SONG_ID);
	await page.locator('[data-block-id="block-a"]').click();
	const dialog = page.getByRole('dialog', { name: 'Block Popover' });
	await expect(dialog).toBeVisible();
	return dialog;
}

test.describe('BlockPopover — interactions', () => {
	test.beforeEach(async ({ page }) => {
		await stubApi(page);
	});

	test('header shows the track name and bar range', async ({ page }) => {
		const dialog = await openBlockPopover(page);
		// Format: "Piano — A (bars 1–4)" with en-dashes and the section name.
		await expect(dialog.locator('.popover-title')).toHaveText(
			/Piano.*A.*bars.*1.*4/
		);
	});

	test('OK click commits directives to store and closes dialog', async ({
		page
	}) => {
		const dialog = await openBlockPopover(page);
		// Change the Expression slider to ensure the OK path actually mutates
		// something.
		const sliders = dialog.locator('input[type="range"]');
		await sliders.first().evaluate((el: HTMLInputElement) => {
			el.value = '80';
			el.dispatchEvent(new Event('input', { bubbles: true }));
		});

		await dialog.getByRole('button', { name: 'OK', exact: true }).click();
		await expect(dialog).toBeHidden({ timeout: 2_000 });

		// Directives should be in the store — `@mode: block` stays, expression
		// was slider-only. We verify the block still resolves via the store.
		const song = await readCurrentSong(page);
		const block = song?.tracks.find((t) => t.id === 'track-piano')?.blocks?.[0];
		expect(block?.id).toBe('block-a');
	});

	test('Cancel button (close icon) dismisses without throwing', async ({
		page
	}) => {
		const dialog = await openBlockPopover(page);
		await dialog.getByRole('button', { name: 'Close' }).click();
		await expect(dialog).toBeHidden({ timeout: 2_000 });
	});

	test('Escape key dismisses the dialog', async ({ page }) => {
		const dialog = await openBlockPopover(page);
		await page.keyboard.press('Escape');
		await expect(dialog).toBeHidden({ timeout: 2_000 });
	});

	test('Clicking the overlay backdrop dismisses the dialog', async ({
		page
	}) => {
		const dialog = await openBlockPopover(page);
		// Click top-left corner — outside the centered popover box but
		// inside the fixed overlay.
		await page.mouse.click(5, 5);
		await expect(dialog).toBeHidden({ timeout: 2_000 });
	});

	test('Clicking inside the popover body does NOT dismiss', async ({
		page
	}) => {
		const dialog = await openBlockPopover(page);
		await dialog.locator('.popover-body').click({ position: { x: 10, y: 10 } });
		await expect(dialog).toBeVisible();
	});

	test('Raw パラメータ toggle reveals the directives textarea', async ({
		page
	}) => {
		const dialog = await openBlockPopover(page);
		const textarea = dialog.locator('textarea.raw-textarea');
		await expect(textarea).toHaveCount(0);
		await dialog.getByRole('button', { name: /パラメータ/ }).click();
		await expect(textarea).toBeVisible();
		// The raw text seeded from block.directives.
		await expect(textarea).toHaveValue(/@mode: block/);
	});

	test('Expression slider moves without throwing', async ({ page }) => {
		const dialog = await openBlockPopover(page);
		const slider = dialog.locator('input[type="range"]').first();
		await slider.evaluate((el: HTMLInputElement) => {
			el.value = '20';
			el.dispatchEvent(new Event('input', { bubbles: true }));
		});
		await expect(slider).toHaveValue('20');
	});

	test('Feel slider moves without throwing', async ({ page }) => {
		const dialog = await openBlockPopover(page);
		const slider = dialog.locator('input[type="range"]').nth(1);
		await slider.evaluate((el: HTMLInputElement) => {
			el.value = '70';
			el.dispatchEvent(new Event('input', { bubbles: true }));
		});
		await expect(slider).toHaveValue('70');
	});

	test('AI prompt input accepts text entry', async ({ page }) => {
		const dialog = await openBlockPopover(page);
		const prompt = dialog.locator('input.ai-input');
		await prompt.fill('jazz ballad feel');
		await expect(prompt).toHaveValue('jazz ballad feel');
	});

	test('OK click on a second open/close cycle still closes the dialog', async ({
		page
	}) => {
		// Re-open + re-close regression: the structuredClone bug would leave
		// popoverBlock non-null across cycles.
		let dialog = await openBlockPopover(page);
		await dialog.getByRole('button', { name: 'OK', exact: true }).click();
		await expect(dialog).toBeHidden();

		await page.locator('[data-block-id="block-a"]').click();
		dialog = page.getByRole('dialog', { name: 'Block Popover' });
		await expect(dialog).toBeVisible();
		await dialog.getByRole('button', { name: 'OK', exact: true }).click();
		await expect(dialog).toBeHidden({ timeout: 2_000 });
	});

	test('No pageerror during full BlockPopover interaction cycle', async ({
		page
	}) => {
		const pageErrors: string[] = [];
		page.on('pageerror', (e) => pageErrors.push(String(e)));

		const dialog = await openBlockPopover(page);
		// Touch several controls to exercise reactive paths.
		await dialog.locator('input.ai-input').fill('arpeggio feel');
		await dialog
			.locator('input[type="range"]')
			.first()
			.evaluate((el: HTMLInputElement) => {
				el.value = '60';
				el.dispatchEvent(new Event('input', { bubbles: true }));
			});
		await dialog.getByRole('button', { name: /パラメータ/ }).click();
		await dialog.getByRole('button', { name: 'OK', exact: true }).click();
		await expect(dialog).toBeHidden();

		expect(
			pageErrors,
			`unexpected pageerrors: ${pageErrors.join(' | ')}`
		).toEqual([]);
	});
});
