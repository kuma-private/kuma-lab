// Concurrent command smoke test. Fire 5 different bridge commands in
// parallel via Promise.all and verify every one of them settles (resolved
// or structured-error). This exercises the client's request-id
// multiplexing: the bridge must be able to interleave responses for
// simultaneously-outstanding requests without deadlocking or crossing
// wires.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, waitForCadenzaReady } from '../fixtures/window-stores';

test.describe('Bridge concurrent commands', () => {
	test('five commands fired in parallel all settle', async ({ page, bridge }) => {
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
			if (!c) return { ok: false, settled: 0, total: 0 };

			const cmds: Array<{ type: string; [k: string]: unknown }> = [
				{ type: 'plugins.list' },
				{ type: 'project.hash' },
				{ type: 'update.check' },
				{ type: 'system.getAutostart' },
				{ type: 'transport.seek', tick: 0 }
			];

			const results = await Promise.all(
				cmds.map(async (cmd) => {
					try {
						const r = await c!.send(cmd);
						return { settled: true, ok: true, response: r, code: null as string | null };
					} catch (e: unknown) {
						const err = e as { code?: string };
						return {
							settled: true,
							ok: false,
							response: null as unknown,
							code: err.code ?? 'unknown'
						};
					}
				})
			);

			return {
				ok: true,
				settled: results.filter((r) => r.settled).length,
				total: results.length,
				perCmd: results
			};
		});

		expect(result.ok).toBe(true);
		// All five must have settled — neither hung nor lost in id
		// multiplexing. We don't care whether each individual command
		// resolved or errored; only that none fell off the back of the
		// pending-request map.
		expect(result.settled).toBe(5);
		expect(result.total).toBe(5);
	});
});
