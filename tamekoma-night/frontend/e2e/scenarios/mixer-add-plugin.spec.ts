// Mixer — add a built-in Filter plugin to the first track's insert slot.
// Verifies the PluginPicker modal opens, the slot updates, and the
// songStore reflects the new ChainNode. Requires the `premium` project
// (storageState seeds cadenzaPlanOverride=premium).
//
// The backend song endpoints are stubbed so we do not need a real backend
// for this test — the bridge fixture is still spawned so the Mixer tab
// does not show the offline curtain.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-mixer-add-plugin';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Mixer Add Plugin',
		bpm: 120,
		timeSignature: '4/4',
		key: 'C',
		chordProgression: '| C | F | G | C |',
		sections: [{ id: 'sec1', name: 'A', startBar: 1, endBar: 4 }],
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

test.describe('Mixer add plugin', () => {
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

	test('adds Filter (svf) to first track insert slot', async ({ page, bridge }) => {
		expect(bridge.url).toBeTruthy();

		await page.goto(`/song/${SONG_ID}`);

		// Wait for bridge connection so Mixer is not curtained.
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');

		// Switch to Mixer tab.
		const mixerTab = page.getByRole('tab', { name: 'Mixer' });
		await expect(mixerTab).toBeVisible({ timeout: 10_000 });
		await mixerTab.click();

		// A channel strip for the Piano track must render.
		const strip = page.locator('[data-track-id="track-piano"]');
		await expect(strip).toBeVisible();

		// The strip has two "add" slots — one in the Instrument section
		// (top) and one in the Inserts section. We want to add a Filter
		// to the Insert chain, so target the Inserts section explicitly.
		const insertAddSlot = strip
			.locator('[data-section="inserts"]')
			.getByRole('button', { name: 'プラグインを追加' });
		await insertAddSlot.click();

		const pickerDialog = page.getByRole('dialog', { name: 'プラグインを選択' });
		await expect(pickerDialog).toBeVisible();

		// Switch to the Built-in filter tab inside the picker.
		await pickerDialog.getByRole('button', { name: 'Built-in' }).click();

		// Click the "Filter" row.
		await pickerDialog.getByText('Filter', { exact: true }).first().click();

		// The picker should close once a plugin is picked.
		await expect(pickerDialog).toBeHidden();

		// songStore reflects a new chain node of the Filter plugin.
		await expect
			.poll(
				async () => {
					const snap = await readCurrentSong(page);
					const chain = snap?.tracks.find((t) => t.id === 'track-piano')?.chain ?? [];
					return chain.map((c) => c.plugin.name);
				},
				{ timeout: 5_000 }
			)
			.toContain('Filter');

		await page.screenshot({ path: 'e2e/screenshots/mixer-add-plugin.png', fullPage: true });
	});
});
