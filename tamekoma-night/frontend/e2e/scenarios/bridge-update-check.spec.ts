// `update.check` polls the bridge updater for the cached release info.
// In the e2e harness no real release feed is configured, so the bridge
// returns updateAvailable=false. We just verify the command round-trips
// and the response shape includes the expected fields.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, waitForCadenzaReady } from '../fixtures/window-stores';

test.describe('Bridge update.check', () => {
	test('returns the cached update state with updateAvailable: false in dev', async ({
		page,
		bridge
	}) => {
		expect(bridge.url).toBeTruthy();
		await page.goto('/');
		await waitForCadenzaReady(page);
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');

		const result = await page.evaluate(async () => {
			const w = window as unknown as {
				__cadenza?: {
					bridgeStore?: {
						client?: {
							send: (cmd: { type: string }) => Promise<unknown>;
						};
					};
				};
			};
			const c = w.__cadenza?.bridgeStore?.client;
			if (!c) return { ok: false };
			try {
				const r = (await c.send({ type: 'update.check' })) as {
					updateAvailable?: boolean;
				};
				return { ok: true, response: r };
			} catch (e: unknown) {
				return { ok: false, error: String(e) };
			}
		});

		expect(result.ok).toBe(true);
		expect(result.response).toBeTruthy();
		// In the dev fixture the updater is not pointed at a real release
		// feed, so updateAvailable must be false.
		expect((result.response as { updateAvailable?: boolean })?.updateAvailable).toBe(false);
	});
});
