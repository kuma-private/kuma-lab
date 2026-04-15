// UI-layer interaction helpers. Counterpart to window-stores.ts (data-layer).
//
// Existing tests reach into __cadenza for state, which bypasses Playwright's
// actionability checks entirely — a button that is technically in the DOM but
// clipped by an `overflow: hidden` parent will still fire `click()` via DOM
// event dispatch and the test passes. That's how the BlockPopover OK-button
// regression slipped through 235 specs.
//
// The helpers in this file assert the interaction is geometrically valid:
//   - the element's bounding box is inside the current viewport
//   - Playwright's actionability gate (visibility / stability / pointer-events
//     / not obscured) passes via `click({ trial: true })`
//
// Keep this file thin. Do NOT add modal-specific "openBlockPopover" wrappers —
// those belong inline in each spec so the test reads as a flow.

import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Assert that `locator` resolves to a single element whose bounding box fits
 * entirely within the current viewport AND passes Playwright's actionability
 * check (which is what a real click would go through).
 *
 * The two checks are complementary:
 *   - boundingBox catches "sticky footer pushed off-screen by overflow: hidden"
 *     (the BlockPopover bug — absolute DOM click would still succeed)
 *   - trial click catches pointer-events: none, covering overlays, zero-opacity
 *     siblings, stale animations mid-transition
 */
export async function assertElementInViewport(
	page: Page,
	locator: Locator,
	label?: string
): Promise<void> {
	await expect(
		locator,
		`${label ?? 'element'}: must resolve before viewport check`
	).toBeVisible();

	const box = await locator.boundingBox();
	const viewport = page.viewportSize();
	if (!box) {
		throw new Error(`${label ?? 'element'}: boundingBox() returned null`);
	}
	if (!viewport) {
		throw new Error(`${label ?? 'element'}: viewportSize() returned null`);
	}

	const left = box.x;
	const top = box.y;
	const right = box.x + box.width;
	const bottom = box.y + box.height;

	const inside =
		left >= 0 &&
		top >= 0 &&
		right <= viewport.width &&
		bottom <= viewport.height;

	if (!inside) {
		throw new Error(
			`${label ?? 'element'}: bounding box out of viewport.\n` +
				`  box:      { x: ${left}, y: ${top}, w: ${box.width}, h: ${box.height} }\n` +
				`  viewport: { w: ${viewport.width}, h: ${viewport.height} }\n` +
				`  overflow: right=${Math.max(0, right - viewport.width).toFixed(0)}px, ` +
				`bottom=${Math.max(0, bottom - viewport.height).toFixed(0)}px`
		);
	}

	// trial: true runs the actionability gate without firing the click —
	// this is what catches "covered by overlay", "element disabled",
	// "pointer-events: none", "animating into position".
	await locator.click({ trial: true, timeout: 2000 });
}

/**
 * Click `trigger`, then wait for a dialog matching `modalName` to appear.
 * Returns the dialog Locator for downstream assertions. Uses ARIA role=dialog
 * + accessible name, so it composes with getByRole throughout the codebase.
 */
export async function clickAndWaitForModal(
	page: Page,
	trigger: Locator,
	modalName: string | RegExp
): Promise<Locator> {
	await trigger.click();
	const dialog = page.getByRole('dialog', { name: modalName });
	await expect(dialog).toBeVisible({ timeout: 5000 });
	return dialog;
}

/**
 * Dismiss the top-most modal via one of three dismiss paths. `background`
 * assumes a fixed-position overlay occupying the viewport (we click 5,5).
 * `close-button` looks for a button with aria-label matching /close|閉じる|×/.
 */
export async function dismissTopModal(
	page: Page,
	via: 'escape' | 'background' | 'close-button'
): Promise<void> {
	if (via === 'escape') {
		await page.keyboard.press('Escape');
		return;
	}
	if (via === 'background') {
		await page.mouse.click(5, 5);
		return;
	}
	// close-button
	const candidates = page.getByRole('button', { name: /close|閉じる|×/i });
	const count = await candidates.count();
	if (count === 0) {
		throw new Error('dismissTopModal: no close-button candidate found');
	}
	// Prefer the top-most (last) matching button — modal stacks push newer
	// dialogs to the end of the DOM.
	await candidates.last().click();
}
