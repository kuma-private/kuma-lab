// `project.load` with an enriched payload: 3 tracks plus a `buses` array
// of 5 entries. The bridge's current schema may not recognise `buses`,
// but it should either accept-and-ignore the unknown field or return a
// structured error — neither should crash the dispatch loop. We only
// assert the call resolved and the bridge stays connected.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, waitForCadenzaReady } from '../fixtures/window-stores';

test.describe('Bridge project.load with buses + multi tracks', () => {
	test('accepts 5-bus 3-track payload or errors without crashing', async ({ page, bridge }) => {
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
				const r = (await c.send({
					type: 'project.load',
					project: {
						version: '1',
						bpm: 128,
						timeSignature: [4, 4],
						sampleRate: 48000,
						tracks: [
							{ id: 't1', name: 'Drums', clips: [] },
							{ id: 't2', name: 'Bass', clips: [] },
							{ id: 't3', name: 'Lead', clips: [] }
						],
						buses: [
							{ id: 'b1', name: 'Drum Bus' },
							{ id: 'b2', name: 'FX Bus A' },
							{ id: 'b3', name: 'FX Bus B' },
							{ id: 'b4', name: 'Parallel Comp' },
							{ id: 'b5', name: 'Master' }
						]
					}
				})) as { tracks?: number };
				return { ok: true, resolved: true, tracks: r?.tracks ?? null, errored: false };
			} catch (e: unknown) {
				const err = e as { code?: string };
				return { ok: true, resolved: true, tracks: null, errored: true, code: err.code ?? 'unknown' };
			}
		});

		expect(result.ok).toBe(true);
		expect(result.resolved).toBe(true);
		// If the bridge accepted it and returned a track count, it should
		// reflect the 3 tracks we sent. Otherwise we only require that the
		// envelope settled — an error code is fine.
		if (result.tracks !== null && !result.errored) {
			expect(result.tracks).toBe(3);
		}
		const snap = await readBridgeStore(page);
		expect(snap.state).toBe('connected');
	});
});
