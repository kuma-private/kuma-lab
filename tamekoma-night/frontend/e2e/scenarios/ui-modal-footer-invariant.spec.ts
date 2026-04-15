// UI — modal footer invariant (geometric viewport check)
//
// Regression safety net for a class of bugs that bypasses existing 235 specs:
// a modal's primary action button is technically in the DOM and Playwright's
// `click()` fires without error (DOM event dispatch, not pixel hit-testing),
// yet the user cannot reach the button because a parent `overflow: hidden`
// clips it off-screen. Live case: BlockPopover's `.popover-body` was missing
// `flex: 1 1 auto; min-height: 0`, so tall content pushed the sticky footer
// below `.popover { max-height: 80vh }` and the OK button disappeared.
//
// The invariant asserted by assertElementInViewport is:
//   - the element's bounding box is fully inside the viewport rectangle
//   - Playwright's actionability gate passes (trial click, no actual mutation)
//
// Coverage: 5 modals × 3 viewport sizes. Keep this file narrow — each test
// opens ONE modal and checks ONE invariant. Deeper interactions live in the
// per-modal ui-modal-*.spec.ts files.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import { assertElementInViewport } from '../fixtures/ui-interactions';
import type { Song, SongListItem } from '../../src/lib/types/song';

// ─── Viewport matrix ──────────────────────────────────────────────────────
// Three viewport sizes for the standard invariant sweep. Tested content is
// minimal at these sizes and fits comfortably.
const VIEWPORTS = [
	{ label: 'desktop-large', width: 1440, height: 900 },
	{ label: 'desktop-standard', width: 1280, height: 720 },
	{ label: 'laptop-small', width: 1024, height: 768 }
] as const;

// Dedicated cramped viewport used by the BlockPopover + Raw-expand regression
// probe. 80vh at 500px = 400px of popover room; header + footer eat ~82px;
// body budget ≈ 318px. A BlockPopover with Raw `パラメータ` expanded runs
// easily past 400px of body content, which exceeds the budget and pushes
// the sticky footer below `.popover { overflow: hidden }` — the exact
// failure mode reported from the Piano (bars 1-4) screenshot.
const CRAMPED_VIEWPORT = { width: 1024, height: 500 };

// ─── Song fixtures ────────────────────────────────────────────────────────

const SONG_ID = 'song-ui-modal-footer-invariant';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'UI Modal Footer Invariant',
		bpm: 120,
		timeSignature: '4/4',
		key: 'C',
		chordProgression: '| C | Am | F | G |',
		sections: [{ id: 'sec1', name: 'A', startBar: 0, endBar: 4 }],
		tracks: [
			{
				id: 'track-piano',
				name: 'Piano',
				instrument: 'piano',
				blocks: [
					{
						id: 'block-piano-1',
						startBar: 0,
						endBar: 4,
						directives: '@mode: block\n@velocity: mf'
					}
				],
				volume: 0,
				mute: false,
				solo: false,
				chain: [
					{
						id: 'chain-gain',
						plugin: {
							name: 'Gain',
							uid: 'builtin.gain',
							format: 'builtin'
						},
						params: { gain: 0 },
						bypass: false
					}
				] as unknown as Song['tracks'][number]['chain'],
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

async function stubSongApi(
	page: import('@playwright/test').Page,
	tier: 'free' | 'premium' = 'premium'
): Promise<void> {
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
				tier
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
}

// ─── Tests ────────────────────────────────────────────────────────────────

for (const vp of VIEWPORTS) {
	test.describe(`modal footer invariant @ ${vp.label} (${vp.width}×${vp.height})`, () => {
		test.use({ viewport: { width: vp.width, height: vp.height } });

		test.beforeEach(async ({ page }) => {
			await stubSongApi(page);
		});

		test('BlockPopover OK button is inside viewport and clickable', async ({
			page
		}) => {
			await page.goto(`/song/${SONG_ID}`);
			await expect
				.poll(async () => (await readCurrentSong(page))?.id, { timeout: 8_000 })
				.toBe(SONG_ID);

			// Open BlockPopover by clicking the existing block.
			await page.locator('[data-block-id="block-piano-1"]').click();

			const dialog = page.getByRole('dialog', { name: 'Block Popover' });
			await expect(dialog).toBeVisible({ timeout: 5_000 });

			const okButton = dialog.getByRole('button', { name: 'OK', exact: true });
			await assertElementInViewport(page, okButton, 'BlockPopover OK');
		});

		test('ChordEditDialog OK button is inside viewport and clickable', async ({
			page
		}) => {
			await page.goto(`/song/${SONG_ID}`);
			await expect
				.poll(async () => (await readCurrentSong(page))?.id, { timeout: 8_000 })
				.toBe(SONG_ID);

			// ChordTimeline renders each bar as `.chord-cell.chord-cell--clickable`
			// with role="button" when FlowEditor wires up onBarClick.
			const bar = page.locator('.chord-cell--clickable').first();
			await expect(bar).toBeVisible();
			await bar.click();

			const dialog = page.getByRole('dialog', { name: /コードを編集/ });
			await expect(dialog).toBeVisible({ timeout: 5_000 });

			const okButton = dialog.getByRole('button', { name: 'OK', exact: true });
			await assertElementInViewport(page, okButton, 'ChordEditDialog OK');
		});

		test('PluginPicker add flow is reachable from the Mixer tab', async ({
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

			const strip = page.locator('[data-track-id="track-piano"]');
			await strip
				.locator('[data-section="inserts"]')
				.getByRole('button', { name: 'プラグインを追加' })
				.click();

			const dialog = page.getByRole('dialog', { name: 'プラグインを選択' });
			await expect(dialog).toBeVisible({ timeout: 5_000 });

			// First row in the list is the action target; viewport invariant.
			const firstRow = dialog.locator('.row').first();
			await assertElementInViewport(page, firstRow, 'PluginPicker first row');
		});

		test('ParamTargetPicker close button is inside viewport and clickable', async ({
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

			await page.getByRole('tab', { name: 'Automation' }).click();

			// Click the "Add lane" button to open ParamTargetPicker.
			await page
				.getByRole('button', { name: /レーン.*追加|\+.*Lane|パラメータ.*追加/i })
				.first()
				.click();

			const dialog = page.getByRole('dialog', {
				name: 'オートメーション対象を選択'
			});
			await expect(dialog).toBeVisible({ timeout: 5_000 });

			const close = dialog.getByRole('button', { name: '閉じる' });
			await assertElementInViewport(page, close, 'ParamTargetPicker close');
		});

		test('HelpModal close button is inside viewport and clickable', async ({
			page
		}) => {
			await page.goto(`/song/${SONG_ID}`);
			await expect
				.poll(async () => (await readCurrentSong(page))?.id, { timeout: 8_000 })
				.toBe(SONG_ID);

			await page.getByRole('button', { name: /ヘルプ|Help|\?/i }).first().click();

			// HelpModal doesn't set role=dialog; find by the heading instead.
			const heading = page.getByRole('heading', { name: 'ヘルプ' });
			await expect(heading).toBeVisible({ timeout: 5_000 });

			const close = page.getByRole('button', { name: 'ヘルプを閉じる' });
			await assertElementInViewport(page, close, 'HelpModal close');
		});
	});
}

// ─── BlockPopover Raw-expand regression at cramped viewport ──────────────
test.describe('BlockPopover Raw-expand regression @ cramped', () => {
	test.use({ viewport: CRAMPED_VIEWPORT });

	test.beforeEach(async ({ page }) => {
		await stubSongApi(page);
	});

	test('OK stays in viewport after Raw パラメータ is expanded', async ({
		page
	}) => {
		await page.goto(`/song/${SONG_ID}`);
		await expect
			.poll(async () => (await readCurrentSong(page))?.id, { timeout: 8_000 })
			.toBe(SONG_ID);

		await page.locator('[data-block-id="block-piano-1"]').click();

		const dialog = page.getByRole('dialog', { name: 'Block Popover' });
		await expect(dialog).toBeVisible({ timeout: 5_000 });

		// Expand the Raw パラメータ section — this injects a 6-row textarea
		// that balloons the body height past the popover max.
		await dialog.getByRole('button', { name: /パラメータ/ }).click();
		await expect(dialog.locator('textarea.raw-textarea')).toBeVisible();

		const okButton = dialog.getByRole('button', { name: 'OK', exact: true });
		await assertElementInViewport(
			page,
			okButton,
			'BlockPopover OK @ cramped+raw-open'
		);
	});
});

// ─── BlockPopover OK click — functional regression ───────────────────────
//
// The REAL bug behind "OK押せない" was not a CSS overflow issue: FlowEditor's
// `emit()` helper called `structuredClone(song)` directly on a Svelte 5
// `$state` proxy, which throws DataCloneError. The exception bubbled out of
// `handleOk() → onSave() → emit()` BEFORE `onClose()` ran, so `popoverBlock`
// stayed non-null and the dialog stayed open. Every other FlowEditor edit
// (section rename, chord edit, block delete, track add/remove, etc.) went
// through the same broken emit() path, so "色々問題が再発" was the whole
// Flow tab silently failing.
//
// Fix: FlowEditor.emit() now uses `$state.snapshot(song)` instead of
// `structuredClone(song)`. This test locks that in — if anyone re-introduces
// the Proxy-to-structuredClone pattern, the OK click leaves the dialog open
// and this test fails.
test.describe('BlockPopover OK click regression (structuredClone / Proxy)', () => {
	test.beforeEach(async ({ page }) => {
		await stubSongApi(page);
	});

	test('OK click dismisses the dialog without a pageerror', async ({
		page
	}) => {
		const pageErrors: string[] = [];
		page.on('pageerror', (e) => pageErrors.push(String(e)));

		await page.goto(`/song/${SONG_ID}`);
		await expect
			.poll(async () => (await readCurrentSong(page))?.id, { timeout: 8_000 })
			.toBe(SONG_ID);

		await page.locator('[data-block-id="block-piano-1"]').click();

		const dialog = page.getByRole('dialog', { name: 'Block Popover' });
		await expect(dialog).toBeVisible();

		const okButton = dialog.getByRole('button', { name: 'OK', exact: true });
		await okButton.click();

		// The dialog must disappear within 1s. Without the fix it persists
		// because `onClose()` never ran after the DataCloneError.
		await expect(dialog).toBeHidden({ timeout: 1_500 });

		// No DataCloneError (or any other page error) may be raised.
		const dataCloneErrors = pageErrors.filter((e) =>
			e.includes('DataCloneError')
		);
		expect(
			dataCloneErrors,
			`structuredClone regression: ${dataCloneErrors.join(' | ')}`
		).toEqual([]);
	});
});
