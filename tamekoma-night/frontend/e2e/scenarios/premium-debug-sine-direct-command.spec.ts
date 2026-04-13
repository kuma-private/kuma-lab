// Premium user firing a direct `debug.sine` Bridge command must NOT
// trigger the premium_required signal. debug.sine is a smoke-test
// command with no plugin behind it, so there is nothing to gate on —
// but the Bridge protocol path still has to stay clean. Counterpart to
// premium-builtin-chain-no-gate (builtin plugin, no gate) at the
// raw-protocol layer instead of the songStore layer.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, waitForCadenzaReady } from '../fixtures/window-stores';

test.describe('Premium gating (negative) — direct debug.sine command', () => {
	test.beforeEach(async ({ page }) => {
		// Premium via /auth/me AND the premium project's localStorage
		// override — dev-user is in CADENZA_DEV_PREMIUM_UIDS so session.verify
		// will issue a real ticket.
		await page.route('**/auth/me', (route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					name: 'Dev User',
					email: 'dev@test.com',
					sub: 'dev-user',
					tier: 'premium'
				})
			})
		);
		await page.route('**/api/songs', (route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify([])
			})
		);
	});

	test('debug.sine on/off on a premium user does not raise premium_required', async ({
		page,
		bridge
	}) => {
		expect(bridge.url).toBeTruthy();
		await page.goto('/');
		await waitForCadenzaReady(page);
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');

		// Confirm planStore.tier has actually landed on premium before we
		// exercise the direct command, so the assertion below is meaningful.
		await expect
			.poll(
				async () =>
					page.evaluate(() => {
						const w = window as unknown as {
							__cadenza?: { planStore?: { tier?: 'free' | 'premium' } };
						};
						return w.__cadenza?.planStore?.tier ?? null;
					}),
				{ timeout: 5_000 }
			)
			.toBe('premium');

		// Fire a full on→off cycle via the raw Bridge client (not the
		// songStore path). Both calls must resolve (not hang) and neither
		// should raise a premium_required rpc error.
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

			const onRes = await trySend({ type: 'debug.sine', on: true });
			const offRes = await trySend({ type: 'debug.sine', on: false });
			return { ok: true, onRes, offRes };
		});

		expect(result.ok).toBe(true);
		expect(result.onRes?.resolved).toBe(true);
		expect(result.offRes?.resolved).toBe(true);
		// Neither call should have come back with a premium_required code.
		expect(result.onRes?.code).not.toBe('premium_required');
		expect(result.offRes?.code).not.toBe('premium_required');

		// And bridgeStore must not have flipped the pending flag.
		const flag = await page.evaluate(() => {
			const w = window as unknown as {
				__cadenza?: {
					bridgeStore?: {
						premiumRequiredPending?: boolean;
						premiumRequiredFeature?: string | null;
					};
				};
			};
			const b = w.__cadenza?.bridgeStore;
			return {
				pending: b?.premiumRequiredPending ?? false,
				feature: b?.premiumRequiredFeature ?? null
			};
		});
		expect(flag.pending).toBe(false);
		expect(flag.feature).toBeNull();
	});
});
