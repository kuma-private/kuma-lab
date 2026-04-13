// `transport.stop` immediately after `transport.play` — both calls must
// settle in sequence. The fromTick-variants spec uses stop as cleanup
// between plays but doesn't assert on it; this one treats play→stop as
// a first-class scenario. Either call may surface a `transport_error`
// (e.g. CI without an audio device), which is fine — we only require
// that both envelopes come back and the bridge stays connected.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, waitForCadenzaReady } from '../fixtures/window-stores';

test.describe('Bridge transport.play → transport.stop', () => {
	test('play then stop in sequence both round-trip', async ({ page, bridge }) => {
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
					return { settled: true, response: r, error: null as string | null };
				} catch (e: unknown) {
					const err = e as { code?: string };
					return { settled: true, response: null as unknown, error: err.code ?? 'unknown' };
				}
			}

			// Load a trivial project first so transport has something to
			// play. If load errors we still fire the transport commands.
			try {
				await c.send({
					type: 'project.load',
					project: {
						version: '1',
						bpm: 120,
						timeSignature: [4, 4],
						sampleRate: 48000,
						tracks: [{ id: 't1', name: 'Seq', clips: [] }]
					}
				});
			} catch (e) {
				void e;
			}

			const play = await trySend({ type: 'transport.play' });
			const stop = await trySend({ type: 'transport.stop' });
			return { ok: true, play, stop };
		});

		expect(result.ok).toBe(true);
		// Both commands must have settled (a structured error counts — we
		// don't know if the test host has an audio device).
		expect(result.play?.settled).toBe(true);
		expect(result.stop?.settled).toBe(true);
		const playSettled = result.play?.response !== null || result.play?.error !== null;
		const stopSettled = result.stop?.response !== null || result.stop?.error !== null;
		expect(playSettled).toBe(true);
		expect(stopSettled).toBe(true);
		// Bridge still alive after the sequence.
		const snap = await readBridgeStore(page);
		expect(snap.state).toBe('connected');
	});
});
