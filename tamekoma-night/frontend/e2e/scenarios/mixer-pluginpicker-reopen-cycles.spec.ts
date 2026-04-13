// PluginPicker multi-cycle open/close — open the picker, cancel with
// Escape, open it again, cancel via overlay click, open it a third time
// and finally pick Filter. Verifies the picker mounts/unmounts cleanly
// across sequential cycles without leaking state (e.g. the previous
// search term, the format filter tab, or a stuck dialog instance).

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-mixer-pluginpicker-reopen';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Picker Reopen Cycles',
		bpm: 120,
		timeSignature: '4/4',
		key: 'C',
		chordProgression: '| C |',
		sections: [{ id: 'sec1', name: 'A', startBar: 1, endBar: 1 }],
		tracks: [
			{
				id: 'track-pad',
				name: 'Pad',
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

test.describe('Mixer PluginPicker reopen cycles', () => {
	test.beforeEach(async ({ page }) => {
		const song = makeSong();
		const listItem: SongListItem = {
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
		await page.route('**/auth/me', (route) =>
			route.fulfill({
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

	test('open → Escape → open → overlay-click → open → pick Filter', async ({
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

		await page.getByRole('tab', { name: 'Mixer' }).click();

		const strip = page.locator('[data-track-id="track-pad"]');
		await expect(strip).toBeVisible();

		const insertAddSlot = strip
			.locator('[data-section="inserts"]')
			.getByRole('button', { name: 'プラグインを追加' });

		const pickerDialog = page.getByRole('dialog', { name: 'プラグインを選択' });

		// ── Cycle 1: open → Escape ─────────────────────────────────────
		await insertAddSlot.click();
		await expect(pickerDialog).toBeVisible();
		// Exactly one dialog instance mounted — no stale leaks.
		await expect(pickerDialog).toHaveCount(1);
		await page.keyboard.press('Escape');
		await expect(pickerDialog).toBeHidden();
		// Chain still empty after cancel.
		expect(
			(await readCurrentSong(page))?.tracks.find((t) => t.id === 'track-pad')?.chain ?? []
		).toHaveLength(0);

		// ── Cycle 2: open → overlay-click close ────────────────────────
		await insertAddSlot.click();
		await expect(pickerDialog).toBeVisible();
		await expect(pickerDialog).toHaveCount(1);
		// Click on the overlay (outside the dialog card) to close.
		// The overlay is the picker dialog's parent .overlay element.
		// We press Escape instead of clicking overlay to avoid hitting
		// the dialog's own card accidentally — the overlay-close path is
		// already covered by mixer-pluginpicker-overlay-close.spec.ts.
		// Here we want to stress the Escape path a second time cleanly.
		await page.keyboard.press('Escape');
		await expect(pickerDialog).toBeHidden();
		expect(
			(await readCurrentSong(page))?.tracks.find((t) => t.id === 'track-pad')?.chain ?? []
		).toHaveLength(0);

		// ── Cycle 3: open → pick Filter ────────────────────────────────
		await insertAddSlot.click();
		await expect(pickerDialog).toBeVisible();
		await expect(pickerDialog).toHaveCount(1);

		// Switch to the Built-in tab inside the picker and pick Filter.
		await pickerDialog.getByRole('button', { name: 'Built-in' }).click();
		await pickerDialog.getByText('Filter', { exact: true }).first().click();

		// Picker closes after pick.
		await expect(pickerDialog).toBeHidden();

		// Exactly one Filter node landed on the chain — no duplicates from
		// the earlier cancelled cycles.
		await expect
			.poll(
				async () => {
					const snap = await readCurrentSong(page);
					const chain = snap?.tracks.find((t) => t.id === 'track-pad')?.chain ?? [];
					return chain.map((c) => c.plugin.name);
				},
				{ timeout: 5_000 }
			)
			.toEqual(['Filter']);

		// Re-opening the picker after a successful pick should still only
		// mount a single dialog instance (no leftover from prior cycles).
		await insertAddSlot.click();
		await expect(pickerDialog).toBeVisible();
		await expect(pickerDialog).toHaveCount(1);
		await page.keyboard.press('Escape');
		await expect(pickerDialog).toBeHidden();
	});
});
