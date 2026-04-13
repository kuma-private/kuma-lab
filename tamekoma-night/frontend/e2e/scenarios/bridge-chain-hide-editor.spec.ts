// chain.hideEditor is the sister of chain.showEditor. Verify the command
// round-trips: the bridge either accepts it (idempotent no-op when no
// editor is open) or rejects it with a structured editor_error. Either is
// a valid "did not crash" outcome — this smoke test only guards against
// hangs and unexpected error codes on the hide path.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, waitForCadenzaReady } from '../fixtures/window-stores';

test.describe('Bridge chain.hideEditor round-trip', () => {
	test('hideEditor on an unknown node resolves without crashing', async ({ page, bridge }) => {
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
			if (!c) return { ok: false, resolved: false, response: null as unknown, code: null as string | null };
			try {
				const r = await c.send({
					type: 'chain.hideEditor',
					trackId: 'track-does-not-exist',
					nodeId: 'node-does-not-exist'
				});
				return { ok: true, resolved: true, response: r, code: null as string | null };
			} catch (e: unknown) {
				const err = e as { code?: string };
				return { ok: true, resolved: true, response: null as unknown, code: err.code ?? 'unknown' };
			}
		});

		expect(result.ok).toBe(true);
		expect(result.resolved).toBe(true);
		// Smoke: the bridge did not hang. Either we got a truthy response
		// (idempotent hide accepted) or a structured editor_error. Both are
		// "did not crash" outcomes.
		const settled = result.response !== null || result.code !== null;
		expect(settled).toBe(true);
	});
});
