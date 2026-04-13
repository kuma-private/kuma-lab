// `plugins.list` returns the bridge's known plugin catalog. In the e2e
// harness no third-party CLAP/VST3 plugins are installed, so the response
// is normally an empty array. We just verify the round-trip works without
// erroring — i.e. the bridge implements the command and the client maps
// the response correctly.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, waitForCadenzaReady } from '../fixtures/window-stores';

test.describe('Bridge plugins.list', () => {
	test('plugins.list returns a (possibly empty) array without error', async ({
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
			if (!c) return { ok: false, reason: 'no client' };
			try {
				const r = await c.send({ type: 'plugins.list' });
				return { ok: true, response: r };
			} catch (e: unknown) {
				const err = e as { code?: string; message?: string };
				return { ok: false, reason: err.message ?? String(e), code: err.code };
			}
		});

		expect(result.ok).toBe(true);
		// Response shape: { catalog?: [...] } or similar — at minimum it must
		// be an object the client could deserialize, not a thrown error.
		expect(result.response).toBeTruthy();
	});
});
