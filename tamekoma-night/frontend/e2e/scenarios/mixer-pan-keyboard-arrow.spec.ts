// ChannelStrip pan slider keyboard arrow — focusing the pan range input
// and pressing ArrowUp / ArrowRight must increment the value by its
// step (0.01) and push the new pan through to track.pan in the song
// store. Covers the keyboard-driven oninput path on the pan slider
// (existing mixer-pan-fader-input and mixer-pan-edge use .fill()).

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-mixer-pan-keyboard';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Pan Keyboard Arrow',
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
				// Start at a known non-boundary value so a single ArrowUp
				// press produces a deterministic result (0 + 0.01 = 0.01).
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

test.describe('Channel strip pan slider keyboard arrow', () => {
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

	test('ArrowRight on a focused pan slider increments track.pan by one step', async ({
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

		const strip = page.locator('[data-track-id="track-lead"]');
		const panInput = strip.getByRole('slider', { name: 'パン' });
		await expect(panInput).toBeVisible();
		await expect(panInput).toHaveValue('0');

		// Focus the slider and press ArrowRight — native <input type=range>
		// increments by one step (0.01) and fires an input event.
		await panInput.focus();
		await page.keyboard.press('ArrowRight');

		// Store should reflect one-step increment. Use a loose tolerance
		// for float rounding.
		await expect
			.poll(
				async () => {
					const snap = await readCurrentSong(page);
					const t = snap?.tracks.find((x) => x.id === 'track-lead') as
						| { pan?: number }
						| undefined;
					return t?.pan ?? null;
				},
				{ timeout: 3_000 }
			)
			.toBeCloseTo(0.01, 5);

		// A second ArrowRight nudges one more step.
		await page.keyboard.press('ArrowRight');
		await expect
			.poll(
				async () => {
					const snap = await readCurrentSong(page);
					const t = snap?.tracks.find((x) => x.id === 'track-lead') as
						| { pan?: number }
						| undefined;
					return t?.pan ?? null;
				},
				{ timeout: 3_000 }
			)
			.toBeCloseTo(0.02, 5);

		// ArrowLeft walks it back toward center.
		await page.keyboard.press('ArrowLeft');
		await expect
			.poll(
				async () => {
					const snap = await readCurrentSong(page);
					const t = snap?.tracks.find((x) => x.id === 'track-lead') as
						| { pan?: number }
						| undefined;
					return t?.pan ?? null;
				},
				{ timeout: 3_000 }
			)
			.toBeCloseTo(0.01, 5);
	});
});
