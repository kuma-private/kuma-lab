// Sending an unknown bridge command via the client must surface a
// structured error rather than crashing the bridge process. The bridge
// has a default-deny on unknown command types, so the client's response
// promise rejects with parse_error or unknown_command.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, waitForCadenzaReady } from '../fixtures/window-stores';

test.describe('Bridge unknown command error', () => {
	test('sending an unknown command type rejects with an error code', async ({
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
			if (!c) return { ok: false, code: null, message: null };
			try {
				await c.send({ type: 'definitely.not.a.real.command' });
				return { ok: true, code: null as string | null, message: null as string | null };
			} catch (e: unknown) {
				const err = e as { code?: string; message?: string };
				return { ok: true, code: err.code ?? null, message: err.message ?? null };
			}
		});

		expect(result.ok).toBe(true);
		// Either we got a specific code OR a non-empty error message — but not
		// a silent success. The bridge must have rejected the unknown command.
		const rejected = (result.code !== null && result.code !== '') ||
			(result.message !== null && result.message !== '');
		expect(rejected).toBe(true);
	});
});
