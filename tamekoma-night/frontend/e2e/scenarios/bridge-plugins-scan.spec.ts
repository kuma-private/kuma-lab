// `plugins.scan` triggers the bridge to (re)walk plugin install dirs and
// returns the new count. With no third-party plugins installed in the
// e2e harness the count should be 0 but the command itself must succeed.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, waitForCadenzaReady } from '../fixtures/window-stores';

test.describe('Bridge plugins.scan', () => {
	test('plugins.scan completes and returns a count field', async ({ page, bridge }) => {
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
				const r = (await c.send({ type: 'plugins.scan' })) as { count?: number };
				return { ok: true, count: r?.count ?? null };
			} catch (e: unknown) {
				return { ok: false, error: String(e) };
			}
		});

		expect(result.ok).toBe(true);
		expect(typeof result.count).toBe('number');
		expect(result.count).toBeGreaterThanOrEqual(0);
	});
});
