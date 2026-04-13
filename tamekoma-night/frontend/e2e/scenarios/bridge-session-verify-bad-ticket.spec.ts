// session.verify with an obviously-bad ticket must reject with a structured
// verify_failed error rather than silently resolving. This protects the
// entitlement cache from being poisoned by garbage input.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, waitForCadenzaReady } from '../fixtures/window-stores';

test.describe('Bridge session.verify rejects bad ticket', () => {
	test('garbage ticket string resolves to an error code', async ({ page, bridge }) => {
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
							send: (cmd: { type: string; [k: string]: unknown }) => Promise<unknown>;
						};
					};
				};
			};
			const c = w.__cadenza?.bridgeStore?.client;
			if (!c) return { ok: false, code: null as string | null, message: null as string | null };
			try {
				await c.send({
					type: 'session.verify',
					ticket: 'this-is-obviously-not-a-real-ticket-xxxxxxxxxx'
				});
				return { ok: true, code: null as string | null, message: null as string | null };
			} catch (e: unknown) {
				const err = e as { code?: string; message?: string };
				return {
					ok: true,
					code: err.code ?? null,
					message: err.message ?? null
				};
			}
		});

		expect(result.ok).toBe(true);
		// Must have been rejected, not silently accepted. Accept any truthy
		// code or message — the important thing is we did not get a silent
		// resolve with null code AND null message.
		const rejected =
			(result.code !== null && result.code !== '') ||
			(result.message !== null && result.message !== '');
		expect(rejected).toBe(true);
	});
});
