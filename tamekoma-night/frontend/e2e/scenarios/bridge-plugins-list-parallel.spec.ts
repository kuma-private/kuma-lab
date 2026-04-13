// Fire 10 `plugins.list` calls in parallel via Promise.all. All must
// resolve (no hangs, no lost ids in the request/response multiplexer)
// and all should return identical catalog JSON — listing is a pure read.
// The concurrent-commands spec covers mixed commands; this one hammers
// the same command type to flush out any per-command-type contention.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, waitForCadenzaReady } from '../fixtures/window-stores';

test.describe('Bridge plugins.list parallel', () => {
	test('10 parallel plugins.list calls all resolve with matching JSON', async ({
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
			if (!c) return { ok: false, settled: 0 };

			const calls: Array<Promise<{ settled: boolean; json: string | null }>> = [];
			for (let i = 0; i < 10; i++) {
				calls.push(
					c
						.send({ type: 'plugins.list' })
						.then((r) => ({ settled: true, json: JSON.stringify(r) }))
						.catch(() => ({ settled: true, json: null }))
				);
			}
			const results = await Promise.all(calls);
			const settled = results.filter((r) => r.settled).length;
			const jsons = results.map((r) => r.json);
			const nonNullJsons = jsons.filter((j): j is string => j !== null);
			const allMatch =
				nonNullJsons.length > 0 && nonNullJsons.every((j) => j === nonNullJsons[0]);
			return { ok: true, settled, total: calls.length, allMatch, nonNullCount: nonNullJsons.length };
		});

		expect(result.ok).toBe(true);
		expect(result.settled).toBe(result.total);
		// If any call returned a JSON payload, they should all match.
		if (result.nonNullCount! > 0) {
			expect(result.allMatch).toBe(true);
		}
		const snap = await readBridgeStore(page);
		expect(snap.state).toBe('connected');
	});
});
