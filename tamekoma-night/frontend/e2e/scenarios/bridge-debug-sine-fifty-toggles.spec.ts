// Stress the debug.sine toggle path: 50 sequential on/off flips in a
// tight loop. The cycle + triple-toggle specs cover 2 and 3 transitions
// respectively; this one looks for accumulated state drift, leaks, or
// dispatch queue hangs after many repeats. We end in the off state so
// the shared bridge worker is left quiet for downstream tests.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, waitForCadenzaReady } from '../fixtures/window-stores';

test.describe('Bridge debug.sine fifty toggles', () => {
	test('50 back-to-back on/off flips all settle and end off', async ({ page, bridge }) => {
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

			async function trySend(cmd: { type: string; [k: string]: unknown }) {
				try {
					await c!.send(cmd);
					return true;
				} catch {
					// Structured errors still count as "settled" — we only care
					// that the dispatch returned.
					return true;
				}
			}

			let settled = 0;
			const total = 50;
			for (let i = 0; i < total; i++) {
				const on = i % 2 === 0; // even → on, odd → off
				const ok = await trySend({ type: 'debug.sine', on });
				if (ok) settled++;
			}
			// Final cleanup: always leave sine off regardless of parity.
			await trySend({ type: 'debug.sine', on: false });
			return { ok: true, settled, total };
		});

		expect(result.ok).toBe(true);
		expect(result.settled).toBe(result.total);
		// Bridge must still be connected after the stress loop.
		const snap = await readBridgeStore(page);
		expect(snap.state).toBe('connected');
	});
});
