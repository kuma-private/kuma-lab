// Mixer ChatMessage — user bubble + assistant bubble render with correct
// role classes after submitting a prompt.
//
// MixerChat renders ChatMessage for each history entry. User messages get
// `.msg.user` (right-aligned) and assistant messages get `.msg.assistant`
// (left-aligned). This spec submits a prompt (mocked /api/mixer/suggest
// response), then verifies both bubble classes appear with the expected
// text.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-mixer-chatmessage-bubbles-render';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'ChatMessage Bubbles',
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

test.describe('Mixer ChatMessage bubbles render', () => {
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
		await page.route('**/api/mixer/suggest', (route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					explanation: 'ワームなトーンを提案しました。',
					ops: [],
					sideEffects: []
				})
			})
		);
	});

	test('submit renders a user bubble (right) and an assistant bubble (left)', async ({
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

		const prompt = page.getByLabel('プロンプト');
		await expect(prompt).toBeVisible();

		// Before submitting there should be no ChatMessage bubbles.
		await expect(page.locator('.msg.user')).toHaveCount(0);
		await expect(page.locator('.msg.assistant')).toHaveCount(0);

		const userText = 'ウォームな音にしたい';
		await prompt.fill(userText);
		await page.getByRole('button', { name: '送信' }).click();

		// User bubble renders with the typed text.
		const userBubble = page.locator('.msg.user');
		await expect(userBubble).toHaveCount(1);
		await expect(userBubble).toContainText(userText);

		// Assistant bubble renders with the mocked explanation (after the
		// loading bubble gets replaced).
		const assistantBubble = page.locator('.msg.assistant', {
			hasText: 'ワームなトーンを提案しました。'
		});
		await expect(assistantBubble).toBeVisible({ timeout: 5_000 });

		// Alignment: .msg.user gets flex-end (right), .msg.assistant gets
		// flex-start (left). Read computed styles to confirm ChatMessage's
		// role-driven CSS is in effect.
		const userAlign = await userBubble.evaluate(
			(el) => getComputedStyle(el as HTMLElement).justifyContent
		);
		expect(userAlign).toBe('flex-end');

		const assistantAlign = await assistantBubble.evaluate(
			(el) => getComputedStyle(el as HTMLElement).justifyContent
		);
		expect(assistantAlign).toBe('flex-start');
	});
});
