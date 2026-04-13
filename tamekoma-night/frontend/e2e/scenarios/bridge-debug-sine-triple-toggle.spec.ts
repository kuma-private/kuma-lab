// Three rapid debug.sine toggles (on → off → on) followed by a final
// cleanup off. The round-2 cycle test only covered a single on→off edge;
// this one exercises back-to-back state transitions to catch hangs or
// half-applied toggle bugs in the audio engine wrapper. We also end in
// the off state so we don't leave the shared bridge humming.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, waitForCadenzaReady } from '../fixtures/window-stores';

test.describe('Bridge debug.sine triple toggle', () => {
	test('on → off → on all resolve back-to-back without hanging', async ({ page, bridge }) => {
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

			async function trySend(cmd: { type: string; [k: string]: unknown }) {
				try {
					const r = await c!.send(cmd);
					return { resolved: true, response: r, code: null as string | null };
				} catch (e: unknown) {
					const err = e as { code?: string };
					return { resolved: true, response: null as unknown, code: err.code ?? 'unknown' };
				}
			}

			const r1 = await trySend({ type: 'debug.sine', on: true });
			const r2 = await trySend({ type: 'debug.sine', on: false });
			const r3 = await trySend({ type: 'debug.sine', on: true });
			// Final cleanup — always leave sine off.
			const rOff = await trySend({ type: 'debug.sine', on: false });
			return { ok: true, r1, r2, r3, rOff };
		});

		expect(result.ok).toBe(true);
		// All three toggles (and the cleanup) must have settled. Either a
		// truthy response or a structured error is acceptable — this is a
		// smoke test that the dispatch doesn't hang or crash.
		for (const r of [result.r1, result.r2, result.r3, result.rOff] as const) {
			expect(r?.resolved).toBe(true);
			const settled = r?.response !== null || r?.code !== null;
			expect(settled).toBe(true);
		}
	});
});
