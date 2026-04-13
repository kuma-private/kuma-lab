// ChannelStrip section labels — smoke that Instrument / Inserts / Sends /
// Pan section labels all render inside a strip. This catches regressions
// where a section gets hidden or the data-section attribute drifts.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-mixer-channel-strip-section-labels';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Strip Section Labels',
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

test.describe('Mixer ChannelStrip section labels', () => {
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

	test('Instrument / Inserts sections render with correct labels', async ({ page, bridge }) => {
		expect(bridge.url).toBeTruthy();
		await page.goto(`/song/${SONG_ID}`);
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');
		await expect
			.poll(async () => (await readCurrentSong(page))?.id, { timeout: 5_000 })
			.toBe(SONG_ID);

		await page.getByRole('tab', { name: 'Mixer' }).click();

		const strip = page.locator('.strip[data-track-id="track-lead"]');
		await expect(strip).toBeVisible();

		// CSS applies text-transform: uppercase to .section-label, but
		// Playwright's toHaveText reads the raw DOM textContent, which is
		// mixed-case ("Inserts"). We assert against the DOM text since
		// that's what the template literally renders.
		// Inserts section carries the data-section="inserts" marker.
		const insertsSection = strip.locator('[data-section="inserts"]');
		await expect(insertsSection).toBeVisible();
		await expect(insertsSection.locator('.section-label')).toHaveText('Inserts');

		// Instrument section carries data-section="instrument".
		const instrSection = strip.locator('[data-section="instrument"]');
		await expect(instrSection).toBeVisible();
		await expect(instrSection.locator('.section-label')).toHaveText('Instrument');

		// Sanity: the remaining sections' labels (Sends, Pan) exist too.
		// Read raw textContent via evaluateAll so we're not sensitive to
		// CSS text-transform.
		const rawTexts = await strip
			.locator('.section-label')
			.evaluateAll((els) => els.map((el) => (el.textContent ?? '').trim()));
		expect(rawTexts).toEqual(
			expect.arrayContaining(['Instrument', 'Inserts', 'Sends', 'Pan'])
		);
	});
});
