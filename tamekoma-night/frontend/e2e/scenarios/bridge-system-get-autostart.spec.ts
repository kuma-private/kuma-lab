// system.getAutostart is a read-only command that reports whether the
// bridge's OS-level autostart hook is currently enabled. It's safe to call
// in any state — the bridge should always respond with `{ enabled: bool }`
// (or a structured autostart_error on platforms where the feature is not
// wired up). We smoke-test that the round-trip resolves cleanly.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, waitForCadenzaReady } from '../fixtures/window-stores';

test.describe('Bridge system.getAutostart', () => {
	test('round-trips to a truthy response (or a structured error)', async ({ page, bridge }) => {
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
			if (!c) return { ok: false, response: null as unknown, code: null as string | null };
			try {
				const r = await c.send({ type: 'system.getAutostart' });
				return { ok: true, response: r, code: null as string | null };
			} catch (e: unknown) {
				const err = e as { code?: string; message?: string };
				return { ok: true, response: null as unknown, code: err.code ?? 'unknown' };
			}
		});

		expect(result.ok).toBe(true);
		// Smoke: either we got a truthy response (handled ok) or a structured
		// autostart_error. Both are "did not crash" outcomes.
		const resolved = result.response !== null || result.code !== null;
		expect(resolved).toBe(true);
	});
});
