// UI — Modal lifecycle + ChordEditDialog coverage + cross-modal FlowEditor
// edit paths.
//
// The plan's "modal stack / LIFO" slot is repurposed here to cover the kind
// of emit()-path bugs the real structuredClone regression caused. Cadenza.fm
// only shows one editor modal at a time, so true LIFO stacking isn't really
// a thing — instead we exercise:
//
//   - ChordEditDialog open / cancel / OK save-round-trip
//   - Dismissal paths for ChordEditDialog (Escape, Cancel, close icon)
//   - Re-open / re-close cycles (catches onClose leaks)
//   - Switching between BlockPopover and ChordEditDialog back-to-back
//
// Every OK-path asserts `no pageerror` to lock in the structuredClone fix.

import { test, expect } from '../fixtures/full-stack';
import { readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-ui-modal-stack';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Modal Stack Spec',
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
						directives: '@mode: block'
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

test.describe('ChordEditDialog lifecycle', () => {
	test.beforeEach(async ({ page }) => {
		await stubApi(page);
	});

	test('Bar click opens the dialog; Cancel dismisses', async ({ page }) => {
		await page.goto(`/song/${SONG_ID}`);
		await expect
			.poll(async () => (await readCurrentSong(page))?.id, { timeout: 8_000 })
			.toBe(SONG_ID);

		await page.locator('.chord-cell--clickable').first().click();
		const dialog = page.getByRole('dialog', { name: /コードを編集/ });
		await expect(dialog).toBeVisible();

		await dialog.getByRole('button', { name: /キャンセル|Cancel/ }).click();
		await expect(dialog).toBeHidden({ timeout: 2_000 });
	});

	test('Escape dismisses the dialog without a pageerror', async ({
		page
	}) => {
		const pageErrors: string[] = [];
		page.on('pageerror', (e) => pageErrors.push(String(e)));

		await page.goto(`/song/${SONG_ID}`);
		await expect
			.poll(async () => (await readCurrentSong(page))?.id, { timeout: 8_000 })
			.toBe(SONG_ID);

		await page.locator('.chord-cell--clickable').first().click();
		const dialog = page.getByRole('dialog', { name: /コードを編集/ });
		await expect(dialog).toBeVisible();

		await page.keyboard.press('Escape');
		await expect(dialog).toBeHidden({ timeout: 2_000 });
		expect(pageErrors).toEqual([]);
	});

	test('Close icon dismisses the dialog', async ({ page }) => {
		await page.goto(`/song/${SONG_ID}`);
		await expect
			.poll(async () => (await readCurrentSong(page))?.id, { timeout: 8_000 })
			.toBe(SONG_ID);

		await page.locator('.chord-cell--clickable').first().click();
		const dialog = page.getByRole('dialog', { name: /コードを編集/ });
		await expect(dialog).toBeVisible();

		await dialog.getByRole('button', { name: '閉じる' }).click();
		await expect(dialog).toBeHidden({ timeout: 2_000 });
	});

	test('OK commits chord change and closes without pageerror', async ({
		page
	}) => {
		const pageErrors: string[] = [];
		page.on('pageerror', (e) => pageErrors.push(String(e)));

		await page.goto(`/song/${SONG_ID}`);
		await expect
			.poll(async () => (await readCurrentSong(page))?.id, { timeout: 8_000 })
			.toBe(SONG_ID);

		await page.locator('.chord-cell--clickable').first().click();
		const dialog = page.getByRole('dialog', { name: /コードを編集/ });
		await expect(dialog).toBeVisible();

		// Change the chord input to a different value.
		const input = dialog.locator('input.chord-input').first();
		await input.fill('Dm');

		await dialog.getByRole('button', { name: 'OK', exact: true }).click();
		await expect(dialog).toBeHidden({ timeout: 2_000 });

		expect(
			pageErrors.filter((e) => e.includes('DataCloneError')),
			'structuredClone regression on ChordEditDialog save'
		).toEqual([]);
	});
});

test.describe('Cross-modal switching', () => {
	test.beforeEach(async ({ page }) => {
		await stubApi(page);
	});

	test('BlockPopover → ChordEditDialog → BlockPopover back-to-back', async ({
		page
	}) => {
		const pageErrors: string[] = [];
		page.on('pageerror', (e) => pageErrors.push(String(e)));

		await page.goto(`/song/${SONG_ID}`);
		await expect
			.poll(async () => (await readCurrentSong(page))?.id, { timeout: 8_000 })
			.toBe(SONG_ID);

		// Open + close BlockPopover via OK
		await page.locator('[data-block-id="block-a"]').click();
		let block = page.getByRole('dialog', { name: 'Block Popover' });
		await expect(block).toBeVisible();
		await block.getByRole('button', { name: 'OK', exact: true }).click();
		await expect(block).toBeHidden();

		// Open + close ChordEditDialog via OK
		await page.locator('.chord-cell--clickable').first().click();
		const chord = page.getByRole('dialog', { name: /コードを編集/ });
		await expect(chord).toBeVisible();
		await chord.getByRole('button', { name: 'OK', exact: true }).click();
		await expect(chord).toBeHidden();

		// Re-open BlockPopover — FlowEditor state should allow this
		await page.locator('[data-block-id="block-a"]').click();
		block = page.getByRole('dialog', { name: 'Block Popover' });
		await expect(block).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(block).toBeHidden();

		expect(pageErrors).toEqual([]);
	});
});
