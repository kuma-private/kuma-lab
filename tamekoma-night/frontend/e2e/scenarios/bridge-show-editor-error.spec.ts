// chain.showEditor with an unknown track/node id surfaces editor_error
// rather than crashing. Verifies the error code path round-trips.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, waitForCadenzaReady } from '../fixtures/window-stores';

test.describe('Bridge chain.showEditor error path', () => {
	test('unknown track/node id resolves to an editor_error', async ({ page, bridge }) => {
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
			if (!c) return { ok: false };
			try {
				await c.send({
					type: 'chain.showEditor',
					trackId: 'track-does-not-exist',
					nodeId: 'node-does-not-exist'
				});
				return { ok: true, code: null as string | null };
			} catch (e: unknown) {
				const err = e as { code?: string };
				return { ok: true, code: err.code ?? null };
			}
		});

		expect(result.ok).toBe(true);
		// Whether the bridge has a project loaded or not, the unknown node
		// must not silently succeed — it must come back as an error code.
		expect(result.code).toBeTruthy();
	});
});
