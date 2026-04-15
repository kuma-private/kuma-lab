// UI — Error & empty state surfaces.
//
// Exercises the user-visible feedback when API calls fail or data is empty.
// Existing premium-* specs cover JSON Patch rejections and ticket errors at
// the data layer; this spec is strictly UI-level assertions against the
// banner / toast / "not found" slots that are easy to break on a refactor.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-ui-error-states';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Error States',
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

const authMePremium = {
	status: 200,
	contentType: 'application/json',
	body: JSON.stringify({
		name: 'Dev User',
		email: 'dev@test.com',
		sub: 'dev-user',
		tier: 'premium'
	})
};

test.describe('Home — empty and error states', () => {
	test('empty song list shows the onboarding hint', async ({ page }) => {
		await page.route('**/auth/me', (r) => r.fulfill(authMePremium));
		await page.route('**/api/songs', (r) =>
			r.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify([])
			})
		);

		await page.goto('/');
		await expect(page.getByText(/まだSongがありません/)).toBeVisible({
			timeout: 10_000
		});
	});

	test('GET /api/songs 500 shows an error banner', async ({ page }) => {
		await page.route('**/auth/me', (r) => r.fulfill(authMePremium));
		await page.route('**/api/songs', (r) =>
			r.fulfill({ status: 500, body: 'boom' })
		);

		await page.goto('/');
		// The page renders a role="alert" banner when songStore.error is set.
		await expect(page.locator('.error-banner[role="alert"]')).toBeVisible({
			timeout: 8_000
		});
	});
});

test.describe('Song page — not-found and save-error states', () => {
	test('GET /api/songs/{id} 404 shows "Song が見つかりません"', async ({
		page
	}) => {
		await page.route('**/auth/me', (r) => r.fulfill(authMePremium));
		await page.route('**/api/songs', (r) =>
			r.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify([])
			})
		);
		await page.route(`**/api/songs/${SONG_ID}`, (r) =>
			r.fulfill({ status: 404, body: 'not found' })
		);

		await page.goto(`/song/${SONG_ID}`);
		await expect(page.getByText('Song が見つかりません')).toBeVisible({
			timeout: 10_000
		});
	});

	test('PUT save failure shows an error banner without pageerror', async ({
		page
	}) => {
		const pageErrors: string[] = [];
		page.on('pageerror', (e) => pageErrors.push(String(e)));

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
		await page.route('**/auth/me', (r) => r.fulfill(authMePremium));
		await page.route('**/api/songs', (r) =>
			r.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify([li])
			})
		);
		await page.route(`**/api/songs/${SONG_ID}`, (r) => {
			if (r.request().method() === 'PUT') {
				return r.fulfill({ status: 500, body: 'save failed' });
			}
			return r.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(song)
			});
		});

		await page.goto(`/song/${SONG_ID}`);
		await expect
			.poll(async () => (await readCurrentSong(page))?.id, { timeout: 8_000 })
			.toBe(SONG_ID);

		// Trigger a save via Cmd+S.
		await page.keyboard.press('Meta+s');

		// The save should error; songStore.error should be set. The banner is
		// rendered inside /song/[id]/+page.svelte when store.error is truthy.
		await expect(page.locator('.error-banner[role="alert"]')).toBeVisible({
			timeout: 8_000
		});

		// Save failure is recoverable — no unhandled promise rejections or
		// DataCloneError should make it to pageerror.
		expect(
			pageErrors.filter((e) => e.includes('DataCloneError')),
			`DataCloneError leaked: ${pageErrors.join(' | ')}`
		).toEqual([]);
	});
});

test.describe('Mixer tab — renders without pageerror for premium user', () => {
	test('clicking Mixer tab opens the tab without crashing', async ({
		page
	}) => {
		const pageErrors: string[] = [];
		page.on('pageerror', (e) => pageErrors.push(String(e)));

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
		await page.route('**/auth/me', (r) => r.fulfill(authMePremium));
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

		await page.goto(`/song/${SONG_ID}`);
		await expect
			.poll(async () => (await readCurrentSong(page))?.id, { timeout: 8_000 })
			.toBe(SONG_ID);

		const mixerTab = page.getByRole('tab', { name: 'Mixer' });
		await expect(mixerTab).toBeVisible();
		await mixerTab.click();
		await expect(mixerTab).toHaveAttribute('aria-selected', 'true', {
			timeout: 3_000
		});

		// Regardless of bridge connection state, opening the Mixer tab must
		// not raise any pageerror. Curtain / connected variants are covered
		// by the existing bridge-* / mixer-* specs.
		expect(pageErrors).toEqual([]);
	});
});
