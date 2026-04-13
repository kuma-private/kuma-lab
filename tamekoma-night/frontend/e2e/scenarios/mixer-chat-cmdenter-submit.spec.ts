// MixerChat Cmd+Enter keyboard shortcut — focusing the prompt textarea
// and pressing Meta+Enter triggers the send path (same as clicking the
// Send button). Covers MixerChat.handleKeydown, which is exercised by
// the component unit test but has no existing e2e coverage.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-mixer-chat-cmdenter';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Chat CmdEnter',
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

test.describe('MixerChat Cmd+Enter submits prompt', () => {
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
					explanation: 'cmdenter-reply',
					ops: [],
					sideEffects: []
				})
			})
		);
	});

	test('pressing Meta+Enter on the prompt textarea sends the prompt', async ({
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

		// Initially no bubbles.
		await expect(page.locator('.msg.user')).toHaveCount(0);
		await expect(page.locator('.msg.assistant')).toHaveCount(0);

		// Focus the textarea and type a prompt.
		await prompt.focus();
		await prompt.fill('Cmd+Enter で送信');

		// Press Meta+Enter — should trigger handleSend, NOT insert a newline.
		// The handler's e.preventDefault() should swallow the Enter so the
		// textarea value does not change before it is cleared.
		await page.keyboard.press('Meta+Enter');

		// User bubble appears with the original text.
		const userBubbles = page.locator('.msg.user');
		await expect(userBubbles).toHaveCount(1);
		await expect(userBubbles.first()).toContainText('Cmd+Enter で送信');

		// Assistant reply lands.
		const assistantBubbles = page.locator('.msg.assistant');
		await expect(assistantBubbles).toHaveCount(1);
		await expect(assistantBubbles.first()).toContainText('cmdenter-reply');

		// The prompt input is cleared after send.
		await expect(prompt).toHaveValue('');
	});
});
