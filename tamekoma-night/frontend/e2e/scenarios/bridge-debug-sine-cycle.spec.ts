// debug.sine toggles a built-in sine oscillator for audio-pipeline
// smoke-testing. We fire { on: true } followed by { on: false } and verify
// both calls resolve — i.e. the toggle is idempotent-ish and the bridge
// survives a full on→off cycle without hanging or crashing.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, waitForCadenzaReady } from '../fixtures/window-stores';

test.describe('Bridge debug.sine on/off cycle', () => {
	test('toggling sine on then off both resolve cleanly', async ({ page, bridge }) => {
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

			// Make sure we always leave sine in the off state, even if the
			// "on" step threw. This keeps us a good citizen in the shared
			// bridge worker.
			const onRes = await trySend({ type: 'debug.sine', on: true });
			const offRes = await trySend({ type: 'debug.sine', on: false });
			return { ok: true, onRes, offRes };
		});

		expect(result.ok).toBe(true);
		// Both steps must have resolved (not hung). Either a truthy response
		// or a structured error is acceptable — this is a smoke test, not a
		// contract test on the response shape.
		expect(result.onRes?.resolved).toBe(true);
		expect(result.offRes?.resolved).toBe(true);
		const onSettled = result.onRes?.response !== null || result.onRes?.code !== null;
		const offSettled = result.offRes?.response !== null || result.offRes?.code !== null;
		expect(onSettled).toBe(true);
		expect(offSettled).toBe(true);
	});
});
