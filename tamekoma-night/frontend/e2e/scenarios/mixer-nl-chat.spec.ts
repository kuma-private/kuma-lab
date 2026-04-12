// Mixer NL Chat — user types a prompt, the backend /api/mixer/suggest
// response is mocked via route fulfillment, the assistant bubble renders
// with an Apply button, and Apply mutates the songStore.
//
// We mock the suggest endpoint rather than hit the real backend because
// the Anthropic key + live rate limits make the test flaky. The bridge
// fixture is still spawned so the Mixer curtain does not appear.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-mixer-nl-chat';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Mixer NL Chat',
		bpm: 120,
		timeSignature: '4/4',
		key: 'C',
		chordProgression: '| C | F | G | C |',
		sections: [{ id: 'sec1', name: 'A', startBar: 1, endBar: 4 }],
		tracks: [
			{
				id: 'track-bass',
				name: 'Bass',
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

test.describe('Mixer NL chat', () => {
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

		// Mock the NL suggest endpoint with a canned response that lowers the
		// Bass track volume by 3 dB via a JSON Patch op. The SongStore's
		// internal patch applier understands this pointer shape.
		await page.route('**/api/mixer/suggest', (route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					explanation: 'Bass トラックの音量を 3 dB 下げました。',
					ops: [
						{
							op: 'replace',
							path: '/tracks/track-bass/volumeDb',
							value: -3
						}
					],
					sideEffects: []
				})
			})
		);
	});

	test('submits a prompt, shows assistant bubble, Apply mutates store', async ({
		page,
		bridge
	}) => {
		expect(bridge.url).toBeTruthy();

		await page.goto(`/song/${SONG_ID}`);

		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');

		const mixerTab = page.getByRole('tab', { name: 'Mixer' });
		await expect(mixerTab).toBeVisible({ timeout: 10_000 });
		await mixerTab.click();

		// Type a prompt and send via button click (Cmd+Enter works too but
		// clicking is less flaky across OSes).
		const promptInput = page.getByLabel('プロンプト');
		await expect(promptInput).toBeVisible();
		await promptInput.fill('Bass を 3dB 下げて');
		await page.getByRole('button', { name: '送信' }).click();

		// Assistant bubble appears with the mocked explanation.
		await expect(page.getByText('Bass トラックの音量を 3 dB 下げました。')).toBeVisible({
			timeout: 5_000
		});

		// Apply button is present; click it.
		const applyBtn = page.getByRole('button', { name: 'Apply' });
		await expect(applyBtn).toBeVisible();
		await applyBtn.click();

		// songStore now reflects volume = -3 on Bass.
		await expect
			.poll(
				async () => {
					const snap = await readCurrentSong(page);
					return snap?.tracks.find((t) => t.id === 'track-bass');
				},
				{ timeout: 5_000 }
			)
			.toBeTruthy();

		await page.screenshot({ path: 'e2e/screenshots/mixer-nl-chat.png', fullPage: true });
	});
});
