// Free-tier user lands on a song page — FlowEditor is the default tab,
// renders WITHOUT page errors, and the chord progression is visible.
//
// This file is named song-* so it runs under the `premium` Playwright
// project (which seeds cadenzaPlanOverride='premium' in storageState).
// We clear that override via addInitScript before navigating so the app
// treats us as free, then we mock /auth/me with tier=free so planStore
// stays on 'free' after hydration. With that posture, the Flow tab must
// be selected, Mixer/Automation tabs must be hidden, and the chord
// chips from the chord progression must render.

import { test, expect } from '../fixtures/full-stack';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-free-flow-chord';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Free Flow Chord',
		bpm: 120,
		timeSignature: '4/4',
		key: 'C',
		chordProgression: '| C | Am | F | G |',
		sections: [{ id: 'sec1', name: 'A', startBar: 0, endBar: 4 }],
		tracks: [
			{
				id: 'track-1',
				name: 'Piano',
				instrument: 'piano',
				blocks: [],
				volume: 0,
				mute: false,
				solo: false
			}
		],
		createdBy: 'dev-free',
		createdAt: now,
		lastEditedAt: now
	};
}

test.describe('Free-tier song page — FlowEditor default + chord progression visible', () => {
	test.beforeEach(async ({ page }) => {
		const song = makeSong();
		const listItem: SongListItem = {
			id: SONG_ID,
			title: song.title,
			bpm: song.bpm,
			key: song.key,
			timeSignature: song.timeSignature,
			createdByName: 'Free User',
			createdAt: song.createdAt,
			lastEditedBy: 'Free User',
			lastEditedAt: song.lastEditedAt,
			trackCount: song.tracks.length,
			sectionCount: song.sections.length,
			visibility: 'private'
		};

		// Clear the premium dev override the fixture storageState seeds.
		// Must run before app scripts so planStore's constructor sees null.
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

	test('home -> song page renders FlowEditor + chord chips without errors', async ({ page }) => {
		const pageErrors: Error[] = [];
		page.on('pageerror', (err) => pageErrors.push(err));

		// Start at the home page and navigate to the song page via direct
		// goto (matches the flow a free user sees on first visit — no Bridge).
		await page.goto('/');
		await expect(page).toHaveTitle(/Cadenza\.fm/);

		await page.goto(`/song/${SONG_ID}`);

		// Flow tab must be the default.
		const flowTab = page.getByRole('tab', { name: 'Flow' });
		await expect(flowTab).toBeVisible({ timeout: 10_000 });
		await expect(flowTab).toHaveAttribute('aria-selected', 'true');

		// Free-tier: Mixer + Automation tabs must be hidden.
		await expect(page.getByRole('tab', { name: 'Mixer' })).toHaveCount(0);
		await expect(page.getByRole('tab', { name: 'Automation' })).toHaveCount(0);

		// Chord progression rendered by ChordTimeline: each bar produces a
		// .chord-chip element with the chord root. For '| C | Am | F | G |'
		// we expect chips for C, Am, F, and G.
		const chips = page.locator('.chord-chip');
		await expect(chips.first()).toBeVisible({ timeout: 10_000 });
		const chipTexts = await chips.allTextContents();
		const joined = chipTexts.join(' ');
		expect(joined).toContain('C');
		expect(joined).toContain('Am');
		expect(joined).toContain('F');
		expect(joined).toContain('G');

		expect(
			pageErrors,
			`page errors: ${pageErrors.map((e) => e.message).join('\n')}`
		).toEqual([]);
	});
});
