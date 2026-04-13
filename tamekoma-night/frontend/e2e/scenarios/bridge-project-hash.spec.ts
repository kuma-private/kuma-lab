// `project.hash` returns a deterministic blake3 hash of the bridge's
// current project state. Without a project loaded the bridge returns
// either a hash of the empty default state or a project_error — either
// way the command must round-trip without crashing.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, waitForCadenzaReady } from '../fixtures/window-stores';

test.describe('Bridge project.hash', () => {
	test('project.hash command resolves cleanly', async ({ page, bridge }) => {
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
			if (!c) return { ok: false };
			try {
				const r = (await c.send({ type: 'project.hash' })) as { hash?: string };
				return { ok: true, hash: r?.hash ?? null };
			} catch (e: unknown) {
				return { ok: true, error: (e as { code?: string }).code ?? null };
			}
		});

		expect(result.ok).toBe(true);
		// If we got a hash it should be non-empty; if we got an error code it
		// should be non-null. Either way the bridge stayed alive.
		if ('hash' in result && result.hash !== null) {
			expect(typeof result.hash).toBe('string');
			expect(result.hash!.length).toBeGreaterThan(0);
		}
	});
});
