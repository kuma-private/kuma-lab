// transport.* commands round-trip cleanly via the bridge client. The bridge
// shares state across all tests in the same worker, so a project may or may
// not be loaded when this test runs — we just assert each command resolves
// to either ok or a structured transport_error, never an unexpected error
// or a hang.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, waitForCadenzaReady } from '../fixtures/window-stores';

test.describe('Bridge transport commands', () => {
	test('transport.play / stop / seek round-trip without crashing', async ({
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

			async function trySend(cmd: { type: string; [k: string]: unknown }) {
				try {
					await c!.send(cmd);
					return { code: null as string | null };
				} catch (e: unknown) {
					const err = e as { code?: string };
					return { code: err.code ?? null };
				}
			}

			return {
				ok: true,
				play: await trySend({ type: 'transport.play' }),
				stop: await trySend({ type: 'transport.stop' }),
				seek: await trySend({ type: 'transport.seek', tick: 0 })
			};
		});

		expect(result.ok).toBe(true);
		// Each command resolved (no hang). Code is either null (ok) or the
		// expected transport_error if no project is loaded — both are valid
		// "did not crash" outcomes. We just disallow anything else.
		const accepted = (c: string | null | undefined) =>
			c === null || c === undefined || c === 'transport_error';
		expect(accepted(result.play?.code)).toBe(true);
		expect(accepted(result.stop?.code)).toBe(true);
		expect(accepted(result.seek?.code)).toBe(true);
	});
});
