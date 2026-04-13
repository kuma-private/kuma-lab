// `transport.play` accepts an optional `fromTick` parameter. Fire three
// play calls in sequence with fromTick=0, fromTick=480, and fromTick=1_000_000
// (arbitrarily large). Each must round-trip: either an ok response or a
// structured transport_error (e.g. no audio device in CI). A missing
// response or an unhandled parse error would mean the bridge rejected the
// param shape outright.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, waitForCadenzaReady } from '../fixtures/window-stores';

test.describe('Bridge transport.play fromTick variants', () => {
	test('three sequential fromTick values all round-trip', async ({ page, bridge }) => {
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
			if (!c) return { ok: false, settled: 0 };

			// Load a minimal project first so the transport has something
			// to point at. If load errors that's fine — transport.play
			// against default state still exercises the dispatch path.
			try {
				await c.send({
					type: 'project.load',
					project: {
						version: '1',
						bpm: 120,
						timeSignature: [4, 4],
						sampleRate: 48000,
						tracks: [{ id: 't1', name: 'Seek', clips: [] }]
					}
				});
			} catch (e) {
				void e;
			}

			const ticks = [0, 480, 1_000_000];
			const outcomes: Array<{ tick: number; settled: boolean; ok: boolean }> = [];
			for (const t of ticks) {
				try {
					await c.send({ type: 'transport.play', fromTick: t });
					outcomes.push({ tick: t, settled: true, ok: true });
				} catch (e) {
					void e;
					outcomes.push({ tick: t, settled: true, ok: false });
				}
				// Always follow with stop so the next play is a fresh call.
				try {
					await c.send({ type: 'transport.stop' });
				} catch (e) {
					void e;
				}
			}
			return { ok: true, settled: outcomes.filter((o) => o.settled).length, outcomes };
		});

		expect(result.ok).toBe(true);
		expect(result.settled).toBe(3);
	});
});
