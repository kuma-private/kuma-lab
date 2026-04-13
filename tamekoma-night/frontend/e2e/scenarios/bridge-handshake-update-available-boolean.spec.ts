// Regression guard: the handshake result must carry a non-null boolean
// `updateAvailable` field. Older builds omitted the field entirely, so
// the UI badge defaulted to false via `?? false`. We want the field to
// be explicitly present and of type boolean so the update flow can tell
// "no update" apart from "unknown". We read through a direct evaluate
// because the shared readBridgeStore snapshot trims handshakeResult to
// only `{ bridgeVersion }`.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, waitForCadenzaReady } from '../fixtures/window-stores';

test.describe('Bridge handshake.handshakeResult.updateAvailable', () => {
	test('is a non-null boolean after connect', async ({ page, bridge }) => {
		expect(bridge.url).toBeTruthy();
		await page.goto('/');
		await waitForCadenzaReady(page);
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');

		const result = await page.evaluate(() => {
			const w = window as unknown as {
				__cadenza?: {
					bridgeStore?: {
						handshakeResult?: {
							bridgeVersion?: string;
							updateAvailable?: unknown;
						} | null;
						updateAvailable?: unknown;
					};
				};
			};
			const b = w.__cadenza?.bridgeStore;
			if (!b) return { ok: false };
			const hs = b.handshakeResult ?? null;
			return {
				ok: true,
				hsPresent: hs !== null,
				hsUpdateAvailable: hs?.updateAvailable ?? null,
				hsUpdateAvailableType: typeof hs?.updateAvailable,
				storeUpdateAvailable: b.updateAvailable ?? null,
				storeUpdateAvailableType: typeof b.updateAvailable
			};
		});

		expect(result.ok).toBe(true);
		expect(result.hsPresent).toBe(true);
		// Primary assertion: handshakeResult.updateAvailable is a boolean
		// (not undefined / not null). Either true or false is acceptable —
		// we only care the field is populated.
		expect(result.hsUpdateAvailableType).toBe('boolean');
		expect(result.hsUpdateAvailable).not.toBeNull();
		// The store mirror should match the handshake value.
		expect(result.storeUpdateAvailableType).toBe('boolean');
		expect(result.storeUpdateAvailable).toBe(result.hsUpdateAvailable);
	});
});
