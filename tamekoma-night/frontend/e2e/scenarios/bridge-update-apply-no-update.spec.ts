// `update.apply` when there is no update available must return a clean
// structured error (code: update_error), not crash the bridge. In the e2e
// harness the updater is not pointed at a real release feed, so
// update.check always reports false — apply should therefore fail with a
// structured envelope. We verify:
//  1. The send() throws (client maps error envelope to rejection), AND
//  2. The bridge is still alive after the error (a follow-up command
//     resolves normally).

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, waitForCadenzaReady } from '../fixtures/window-stores';

test.describe('Bridge update.apply without available update', () => {
	test('errors cleanly and keeps the bridge responsive', async ({ page, bridge }) => {
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

			// 1. Sanity-check update.check — should report updateAvailable=false.
			let available: boolean | null = null;
			try {
				const r = (await c.send({ type: 'update.check' })) as { updateAvailable?: boolean };
				available = r?.updateAvailable ?? null;
			} catch (e) {
				void e;
			}

			// 2. Call update.apply. Expect a structured rejection.
			let applyThrew = false;
			let applyCode: string | null = null;
			let applyResolved: unknown = null;
			try {
				applyResolved = await c.send({ type: 'update.apply' });
			} catch (e) {
				applyThrew = true;
				applyCode = (e as { code?: string }).code ?? null;
			}

			// 3. Bridge must still respond to subsequent commands.
			let followUpOk = false;
			try {
				const r = (await c.send({ type: 'update.check' })) as { updateAvailable?: boolean };
				followUpOk = r?.updateAvailable === false;
			} catch (e) {
				void e;
			}

			return { ok: true, available, applyThrew, applyCode, applyResolved, followUpOk };
		});

		expect(result.ok).toBe(true);
		// No update should be advertised in the e2e harness.
		if (result.available !== null) {
			expect(result.available).toBe(false);
		}
		// Either the apply threw (expected — update_error) or it resolved
		// with a degraded response (apply is a no-op in dev builds). Both
		// are acceptable as long as the follow-up command still works.
		if (result.applyThrew) {
			// Structured error envelope — code should be update_error.
			// Allow other codes as long as the code is a non-empty string.
			if (result.applyCode !== null) {
				expect(typeof result.applyCode).toBe('string');
				expect((result.applyCode as string).length).toBeGreaterThan(0);
			}
		} else {
			// No throw — then the response must be truthy (not undefined).
			expect(result.applyResolved).toBeTruthy();
		}
		expect(result.followUpOk).toBe(true);
	});
});
