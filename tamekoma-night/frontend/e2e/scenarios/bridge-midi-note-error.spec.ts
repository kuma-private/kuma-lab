// midi.noteOn / midi.noteOff with an unknown track id surface midi_error
// rather than a successful no-op. Catches a regression where the unknown
// track lookup might silently swallow the failure.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, waitForCadenzaReady } from '../fixtures/window-stores';

test.describe('Bridge midi.noteOn error path', () => {
	test('unknown track id surfaces midi_error for noteOn and noteOff', async ({
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
							send: (cmd: { type: string; [k: string]: unknown }) => Promise<unknown>;
						};
					};
				};
			};
			const c = w.__cadenza?.bridgeStore?.client;
			if (!c) return { ok: false };

			const trySend = async (cmd: { type: string; [k: string]: unknown }) => {
				try {
					await c.send(cmd);
					return null as string | null;
				} catch (e: unknown) {
					return (e as { code?: string }).code ?? null;
				}
			};

			return {
				ok: true,
				on: await trySend({
					type: 'midi.noteOn',
					trackId: 'track-ghost',
					pitch: 60,
					velocity: 100
				}),
				off: await trySend({ type: 'midi.noteOff', trackId: 'track-ghost', pitch: 60 })
			};
		});

		expect(result.ok).toBe(true);
		expect(result.on).toBe('midi_error');
		expect(result.off).toBe('midi_error');
	});
});
