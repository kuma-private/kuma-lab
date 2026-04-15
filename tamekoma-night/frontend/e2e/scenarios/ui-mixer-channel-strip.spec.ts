// UI — ChannelStrip interaction coverage.
//
// Exercises the mute / solo / pan / volume / name-input click paths that
// existing mixer-* specs skip because they mutate the store directly.
// Locks in both the DOM-event path and the subsequent store state.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-ui-mixer-channel-strip';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'ChannelStrip Spec',
		bpm: 120,
		timeSignature: '4/4',
		key: 'C',
		chordProgression: '| C |',
		sections: [{ id: 's1', name: 'A', startBar: 0, endBar: 4 }],
		tracks: [
			{
				id: 'track-a',
				name: 'Track A',
				instrument: 'piano',
				blocks: [],
				volume: 0,
				mute: false,
				solo: false,
				chain: [],
				sends: [],
				pan: 0,
				automation: []
			},
			{
				id: 'track-b',
				name: 'Track B',
				instrument: 'bass',
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

async function stub(page: import('@playwright/test').Page): Promise<void> {
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
		trackCount: song.tracks.length,
		sectionCount: 1,
		visibility: 'private'
	};
	await page.route('**/auth/me', (r) =>
		r.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({
				name: 'u',
				email: 'u@t.com',
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

async function openMixerTab(page: import('@playwright/test').Page): Promise<void> {
	await page.goto(`/song/${SONG_ID}`);
	await expect
		.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
		.toBe('connected');
	await expect
		.poll(async () => (await readCurrentSong(page))?.id, { timeout: 5_000 })
		.toBe(SONG_ID);
	await page.getByRole('tab', { name: 'Mixer' }).click();
}

test.describe('ChannelStrip — click paths', () => {
	test.beforeEach(async ({ page }) => {
		await stub(page);
	});

	test('Mute button click toggles track.mute and aria-pressed', async ({
		page,
		bridge
	}) => {
		expect(bridge.url).toBeTruthy();
		await openMixerTab(page);

		const strip = page.locator('[data-track-id="track-a"]');
		const muteBtn = strip.getByRole('button', { name: 'ミュート' });
		await expect(muteBtn).toHaveAttribute('aria-pressed', 'false');
		await muteBtn.click();
		await expect(muteBtn).toHaveAttribute('aria-pressed', 'true');

		const song = await readCurrentSong(page);
		const a = song?.tracks.find((t) => t.id === 'track-a');
		expect((a as { mute?: boolean } | undefined)?.mute).toBe(true);
	});

	test('Solo button click toggles track.solo and aria-pressed', async ({
		page,
		bridge
	}) => {
		expect(bridge.url).toBeTruthy();
		await openMixerTab(page);

		const strip = page.locator('[data-track-id="track-a"]');
		const soloBtn = strip.getByRole('button', { name: 'ソロ' });
		await expect(soloBtn).toHaveAttribute('aria-pressed', 'false');
		await soloBtn.click();
		await expect(soloBtn).toHaveAttribute('aria-pressed', 'true');

		const song = await readCurrentSong(page);
		const a = song?.tracks.find((t) => t.id === 'track-a');
		expect((a as { solo?: boolean } | undefined)?.solo).toBe(true);
	});

	test('Mute on track-a does not affect track-b', async ({
		page,
		bridge
	}) => {
		expect(bridge.url).toBeTruthy();
		await openMixerTab(page);

		const stripA = page.locator('[data-track-id="track-a"]');
		await stripA.getByRole('button', { name: 'ミュート' }).click();

		const stripB = page.locator('[data-track-id="track-b"]');
		await expect(
			stripB.getByRole('button', { name: 'ミュート' })
		).toHaveAttribute('aria-pressed', 'false');

		const song = await readCurrentSong(page);
		const b = song?.tracks.find((t) => t.id === 'track-b');
		expect((b as { mute?: boolean } | undefined)?.mute).toBe(false);
	});

	test('Volume fader input dispatches and reaches the store', async ({
		page,
		bridge
	}) => {
		expect(bridge.url).toBeTruthy();
		await openMixerTab(page);

		const fader = page
			.locator('[data-track-id="track-a"]')
			.locator('input[aria-label="音量"]');
		await fader.evaluate((el: HTMLInputElement) => {
			el.value = '-6';
			el.dispatchEvent(new Event('input', { bubbles: true }));
		});

		await expect
			.poll(
				async () =>
					(
						await readCurrentSong(page)
					)?.tracks.find((t) => t.id === 'track-a')
						?.volume as unknown as number,
				{ timeout: 3_000 }
			)
			.toBe(-6);
	});

	test('Pan slider input dispatches and reaches the store', async ({
		page,
		bridge
	}) => {
		expect(bridge.url).toBeTruthy();
		await openMixerTab(page);

		const pan = page
			.locator('[data-track-id="track-a"]')
			.locator('input[aria-label="パン"]');
		await pan.evaluate((el: HTMLInputElement) => {
			el.value = '0.5';
			el.dispatchEvent(new Event('input', { bubbles: true }));
		});

		await expect
			.poll(
				async () =>
					(
						await readCurrentSong(page)
					)?.tracks.find((t) => t.id === 'track-a')
						?.pan as unknown as number,
				{ timeout: 3_000 }
			)
			.toBe(0.5);
	});

	test('Name input fill updates the track name in store', async ({
		page,
		bridge
	}) => {
		expect(bridge.url).toBeTruthy();
		await openMixerTab(page);

		const nameInput = page
			.locator('[data-track-id="track-a"]')
			.locator('input[aria-label="トラック名"]');
		await nameInput.fill('Lead Synth');

		await expect
			.poll(
				async () =>
					(
						await readCurrentSong(page)
					)?.tracks.find((t) => t.id === 'track-a')?.name,
				{ timeout: 3_000 }
			)
			.toBe('Lead Synth');
	});
});
