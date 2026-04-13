// Mixer MixerChat — Cancel button dismisses the suggestion without
// touching the store.
//
// Flow: type prompt -> submit -> assistant bubble renders with Apply +
// Cancel buttons -> click Cancel. The assistant message stays in history
// but its ops are cleared, so Apply / Cancel disappear and the
// songStore's mutable state (track.volume on the seeded Bass track) is
// untouched.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-mixer-mixerchat-cancel-preview';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'MixerChat Cancel',
		bpm: 120,
		timeSignature: '4/4',
		key: 'C',
		chordProgression: '| C |',
		sections: [{ id: 'sec1', name: 'A', startBar: 1, endBar: 1 }],
		tracks: [
			{
				id: 'track-bass',
				name: 'Bass',
				instrument: 'bass',
				blocks: [],
				volume: -6,
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

test.describe('Mixer MixerChat cancel preview', () => {
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

		// Canned suggest response proposes to drop Bass volume to -20. The
		// test will click Cancel, so the store must NOT reach that value.
		await page.route('**/api/mixer/suggest', (route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					explanation: 'Bass を -20 dB に下げる提案です。',
					ops: [
						{ op: 'replace', path: '/tracks/track-bass/volumeDb', value: -20 }
					],
					sideEffects: []
				})
			})
		);
	});

	test('Cancel leaves the store untouched and removes Apply/Cancel buttons', async ({
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

		// Snapshot the seeded Bass volume before interacting with the chat.
		const before = await readCurrentSong(page);
		const volBefore = before?.tracks.find((t) => t.id === 'track-bass')?.volume;
		expect(volBefore).toBe(-6);

		// Submit the prompt.
		const prompt = page.getByLabel('プロンプト');
		await prompt.fill('Bass を下げて');
		await page.getByRole('button', { name: '送信' }).click();

		// Assistant bubble + Apply / Cancel buttons render.
		await expect(page.getByText('Bass を -20 dB に下げる提案です。')).toBeVisible({
			timeout: 5_000
		});
		// Scope to the assistant bubble so we don't collide with other
		// "Cancel" buttons elsewhere in the app (e.g. add-send list cancel).
		const assistantBubble = page
			.locator('.msg.assistant')
			.filter({ hasText: 'Bass を -20 dB に下げる提案です。' });
		const applyBtn = assistantBubble.getByRole('button', { name: 'Apply' });
		const cancelBtn = assistantBubble.getByRole('button', { name: 'Cancel' });
		await expect(applyBtn).toBeVisible();
		await expect(cancelBtn).toBeVisible();

		// Click Cancel — NOT Apply.
		await cancelBtn.click();

		// Apply / Cancel disappear because handleCancel clears ops on the
		// assistant message (the {#if !message.applied} branch with Apply
		// only renders while ops.length > 0).
		await expect(applyBtn).toHaveCount(0);
		await expect(cancelBtn).toHaveCount(0);

		// The assistant explanation is still in history — chat does not
		// evict the message on Cancel, only strips its ops.
		await expect(page.getByText('Bass を -20 dB に下げる提案です。')).toBeVisible();
		// User bubble also still in history.
		await expect(page.locator('.msg.user', { hasText: 'Bass を下げて' })).toBeVisible();

		// Store side: volume is still -6, the proposed -20 never applied.
		const after = await readCurrentSong(page);
		const volAfter = after?.tracks.find((t) => t.id === 'track-bass')?.volume;
		expect(volAfter).toBe(-6);
	});
});
