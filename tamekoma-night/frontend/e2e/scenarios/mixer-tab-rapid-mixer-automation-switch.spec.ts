// Rapidly toggling between Mixer and Automation tabs (4× each direction)
// must not crash the FlowEditor tab panel, leak component state, or
// leave a stale tab panel visible. Exercises the activeTab-driven
// conditional mount/unmount path in FlowEditor.svelte beyond the
// single Flow → Mixer → Automation → Flow cycle covered by
// mixer-tab-navigation.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-mixer-automation-rapid';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Rapid Tab Switch',
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

test.describe('Mixer ↔ Automation rapid tab switching', () => {
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

	test('Mixer→Automation→Mixer→Automation (4x) leaves the Automation panel healthy', async ({
		page,
		bridge
	}) => {
		expect(bridge.url).toBeTruthy();

		const pageErrors: Error[] = [];
		page.on('pageerror', (err) => pageErrors.push(err));

		await page.goto(`/song/${SONG_ID}`);
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');
		await expect
			.poll(async () => (await readCurrentSong(page))?.id, { timeout: 5_000 })
			.toBe(SONG_ID);

		const mixerTab = page.getByRole('tab', { name: 'Mixer' });
		const automationTab = page.getByRole('tab', { name: 'Automation' });

		await expect(mixerTab).toBeVisible({ timeout: 10_000 });
		await expect(automationTab).toBeVisible({ timeout: 10_000 });

		// Rapidly click Mixer→Automation alternately four full round-trips
		// without waiting for visibility between clicks. Each click should
		// immediately change aria-selected on the clicked tab.
		for (let i = 0; i < 4; i += 1) {
			await mixerTab.click();
			await automationTab.click();
		}

		// Final state: Automation tab is selected and its panel content is
		// actually present. The channel strip (Mixer-only) should NOT be
		// mounted anymore.
		await expect(automationTab).toHaveAttribute('aria-selected', 'true');
		await expect(mixerTab).toHaveAttribute('aria-selected', 'false');
		await expect(page.locator('[data-track-id="track-lead"]')).toHaveCount(0);

		// Switch once more back to Mixer to confirm the channel strip
		// re-mounts after all that churn.
		await mixerTab.click();
		await expect(mixerTab).toHaveAttribute('aria-selected', 'true');
		await expect(page.locator('[data-track-id="track-lead"]')).toBeVisible();

		// And back to Automation once more — panel must still respond.
		await automationTab.click();
		await expect(automationTab).toHaveAttribute('aria-selected', 'true');
		await expect(page.locator('[data-track-id="track-lead"]')).toHaveCount(0);

		// No runtime errors from any of the rapid transitions.
		expect(pageErrors.map((e) => e.message)).toEqual([]);
	});
});
