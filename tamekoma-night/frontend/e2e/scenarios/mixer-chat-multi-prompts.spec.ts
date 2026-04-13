// MixerChat history — sending three prompts in sequence produces three
// user bubbles plus three assistant bubbles, and the history container
// grows accordingly. Covers the MixerChat pushMessage/replaceLast loop
// across multiple turns.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-mixer-chat-multi-prompts';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Chat Multi Prompts',
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

test.describe('Mixer chat multiple prompts accumulate in history', () => {
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
		// Distinguish each response so we can assert all three assistant
		// bubbles land, in order.
		let n = 0;
		await page.route('**/api/mixer/suggest', async (route) => {
			n += 1;
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					explanation: `assistant-reply-${n}`,
					ops: [],
					sideEffects: []
				})
			});
		});
	});

	test('three sequential submits render three user and three assistant bubbles', async ({
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
		const sendBtn = page.getByRole('button', { name: '送信' });

		// Empty state: zero bubbles yet.
		await expect(page.locator('.msg.user')).toHaveCount(0);
		await expect(page.locator('.msg.assistant')).toHaveCount(0);

		const prompts = ['プロンプト1', 'プロンプト2', 'プロンプト3'];
		for (let i = 0; i < prompts.length; i += 1) {
			await prompt.fill(prompts[i]);
			await sendBtn.click();
			// Wait for the assistant reply for this turn to land before
			// sending the next prompt, otherwise MixerChat.busy blocks send.
			await expect(
				page.locator('.msg.assistant', { hasText: `assistant-reply-${i + 1}` })
			).toBeVisible({ timeout: 5_000 });
		}

		// Three user bubbles in DOM order matching what we typed.
		const userBubbles = page.locator('.msg.user');
		await expect(userBubbles).toHaveCount(3);
		await expect(userBubbles.nth(0)).toContainText('プロンプト1');
		await expect(userBubbles.nth(1)).toContainText('プロンプト2');
		await expect(userBubbles.nth(2)).toContainText('プロンプト3');

		// Three assistant bubbles (no loading placeholders left).
		const assistantBubbles = page.locator('.msg.assistant');
		await expect(assistantBubbles).toHaveCount(3);
		await expect(assistantBubbles.nth(0)).toContainText('assistant-reply-1');
		await expect(assistantBubbles.nth(1)).toContainText('assistant-reply-2');
		await expect(assistantBubbles.nth(2)).toContainText('assistant-reply-3');
	});
});
