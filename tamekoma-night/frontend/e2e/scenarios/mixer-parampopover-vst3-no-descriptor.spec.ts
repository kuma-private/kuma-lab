// ParamPopover no-descriptor branch — opening the popover on a chain
// node whose plugin has no built-in descriptor (a VST3 plugin with
// empty params) should render the "no-desc" fallback without throwing.
//
// Covers the `{:else}` branch in ParamPopover.svelte where
// `descriptorForPlugin` returns null for non-builtin formats, and the
// empty `params: {}` lookup path in currentValue().

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-mixer-parampopover-vst3';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Param Popover VST3',
		bpm: 120,
		timeSignature: '4/4',
		key: 'C',
		chordProgression: '| C |',
		sections: [{ id: 'sec1', name: 'A', startBar: 1, endBar: 1 }],
		tracks: [
			{
				id: 'track-keys',
				name: 'Keys',
				instrument: 'piano',
				blocks: [],
				volume: 0,
				mute: false,
				solo: false,
				chain: [
					{
						id: 'node-vst3-empty',
						kind: 'insert',
						plugin: {
							format: 'vst3',
							uid: 'com.example.AcmeReverb',
							name: 'Acme Reverb',
							vendor: 'Acme'
						},
						bypass: false,
						// Empty params object — no defaults, no user overrides.
						params: {}
					}
				],
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

test.describe('Mixer ParamPopover — no descriptor branch', () => {
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

	test('opens the popover for a vst3 node with empty params and shows the no-desc fallback', async ({
		page,
		bridge
	}) => {
		expect(bridge.url).toBeTruthy();

		// Collect any page errors so we can assert none are thrown during
		// the render of the no-descriptor branch.
		const pageErrors: Error[] = [];
		page.on('pageerror', (err) => pageErrors.push(err));

		await page.goto(`/song/${SONG_ID}`);
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');
		await expect
			.poll(async () => (await readCurrentSong(page))?.id, { timeout: 5_000 })
			.toBe(SONG_ID);

		await page.getByRole('tab', { name: 'Mixer' }).click();

		const strip = page.locator('[data-track-id="track-keys"]');
		await expect(strip).toBeVisible();

		// The slot should render even though there is no descriptor,
		// showing the plugin name as its label.
		const vst3Slot = strip
			.locator('[data-section="inserts"]')
			.locator('.slot', { hasText: 'Acme Reverb' });
		await expect(vst3Slot).toBeVisible();

		// Click the slot's name button to open the ParamPopover.
		const nameBtn = vst3Slot.locator('button.name');
		await expect(nameBtn).toBeVisible();
		await nameBtn.click();

		// Dialog opens. The aria-label is `${plugin.name} パラメータ`.
		const popover = page.getByRole('dialog', { name: 'Acme Reverb パラメータ' });
		await expect(popover).toBeVisible();

		// Because descriptorForPlugin returned null for format=vst3, the
		// fallback text must be rendered (format is interpolated).
		await expect(popover).toContainText('このプラグインのパラメータ情報は利用できません');
		await expect(popover).toContainText('vst3');

		// No range sliders should have been rendered in the params list —
		// the descriptor branch is skipped entirely.
		await expect(popover.locator('input[type="range"]')).toHaveCount(0);
		await expect(popover.locator('select')).toHaveCount(0);

		// Close button (× / 閉じる) still works.
		await popover.getByRole('button', { name: '閉じる' }).click();
		await expect(popover).toBeHidden();

		// Nothing exploded during render.
		expect(pageErrors.map((e) => e.message)).toEqual([]);
	});
});
