// Two consecutive `plugins.list` calls with no intervening scan must
// return the same catalog in the same order — i.e. listing is a pure
// read over stable bridge state. This is a regression guard against the
// handler returning an iterator/HashMap order that would vary between
// calls. We don't assume the catalog is non-empty (the e2e harness may
// have no third-party plugins), so the check is "second call JSON equals
// first call JSON".

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, waitForCadenzaReady } from '../fixtures/window-stores';

test.describe('Bridge plugins.list idempotency', () => {
	test('two consecutive plugins.list calls return identical JSON', async ({ page, bridge }) => {
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
				const r1 = await c.send({ type: 'plugins.list' });
				const r2 = await c.send({ type: 'plugins.list' });
				const j1 = JSON.stringify(r1);
				const j2 = JSON.stringify(r2);
				return { ok: true, j1, j2, match: j1 === j2 };
			} catch (e) {
				return { ok: false, error: String(e) };
			}
		});

		expect(result.ok).toBe(true);
		expect(result.j1).toBeTruthy();
		expect(result.j2).toBeTruthy();
		expect(result.match).toBe(true);
	});
});
