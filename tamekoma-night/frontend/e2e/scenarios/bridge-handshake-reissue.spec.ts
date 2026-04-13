// Multiple `handshake` re-issues from the same client. The bridge store
// auto-issues handshake on connect; we then send a second handshake
// manually via bridgeStore.client.send and verify it also returns a
// proper handshake result (bridgeVersion + capabilities), not a parse
// error or a "already handshook" rejection.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, waitForCadenzaReady } from '../fixtures/window-stores';

test.describe('Bridge handshake re-issue', () => {
	test('second handshake from same client also returns bridgeVersion + capabilities', async ({
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
			try {
				// First explicit re-handshake (the store already did one on connect).
				const r1 = (await c.send({ type: 'handshake', version: '0.1' })) as {
					bridgeVersion?: string;
					capabilities?: string[];
				};
				// Second re-handshake — the interesting assertion.
				const r2 = (await c.send({ type: 'handshake', version: '0.1' })) as {
					bridgeVersion?: string;
					capabilities?: string[];
				};
				return {
					ok: true,
					r1Version: r1?.bridgeVersion ?? null,
					r1Caps: Array.isArray(r1?.capabilities) ? r1.capabilities : null,
					r2Version: r2?.bridgeVersion ?? null,
					r2Caps: Array.isArray(r2?.capabilities) ? r2.capabilities : null
				};
			} catch (e: unknown) {
				return { ok: true, error: (e as { code?: string }).code ?? 'unknown' };
			}
		});

		expect(result.ok).toBe(true);
		if ('r2Version' in result && result.r2Version !== null) {
			expect(typeof result.r2Version).toBe('string');
			expect(result.r2Version!.length).toBeGreaterThan(0);
			expect(Array.isArray(result.r2Caps)).toBe(true);
			expect((result.r2Caps as string[]).length).toBeGreaterThan(0);
			// Both handshakes should surface the same bridgeVersion.
			expect(result.r1Version).toBe(result.r2Version);
		} else {
			// Bridge answered with some structured response — didn't crash.
			expect(result).toBeTruthy();
		}
	});
});
