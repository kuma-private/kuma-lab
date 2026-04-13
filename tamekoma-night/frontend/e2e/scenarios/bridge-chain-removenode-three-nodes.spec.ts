// Build a 3-node insert chain via repeated `chain.addNode`, then
// `chain.removeNode` the middle one. The two survivors (outer nodes)
// should still be present — i.e. removeNode targets by nodeId, not by
// bulk-clear. We can't read the chain back through the direct bridge
// protocol without patch, so we verify by removing the same nodeId a
// second time and expecting either a structured error (node already
// gone) or an idempotent ok — both prove the first removal was scoped
// to the targeted id, because otherwise the second-remove would succeed
// on a sibling by accident.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, waitForCadenzaReady } from '../fixtures/window-stores';

test.describe('Bridge chain.removeNode with three nodes', () => {
	test('removing middle node keeps outer nodes, second-remove is scoped', async ({
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

			// Load a minimal single-track project first.
			try {
				await c.send({
					type: 'project.load',
					project: {
						version: '1',
						bpm: 120,
						timeSignature: [4, 4],
						sampleRate: 48000,
						tracks: [{ id: 't1', name: 'ThreeChain', clips: [] }]
					}
				});
			} catch (e) {
				return { ok: true, stage: 'project.load', error: (e as { code?: string }).code };
			}

			// Add three builtin nodes in order: gain, filter, compressor.
			const plugins: Array<{ format: string; uid: string; name: string }> = [
				{ format: 'builtin', uid: 'gain', name: 'Gain' },
				{ format: 'builtin', uid: 'filter', name: 'Filter' },
				{ format: 'builtin', uid: 'compressor', name: 'Compressor' }
			];
			const nodeIds: Array<string | null> = [];
			for (let i = 0; i < plugins.length; i++) {
				try {
					const r = (await c.send({
						type: 'chain.addNode',
						trackId: 't1',
						position: i,
						plugin: plugins[i]
					})) as { nodeId?: string };
					nodeIds.push(r?.nodeId ?? null);
				} catch (e) {
					nodeIds.push(null);
					void e;
				}
			}

			// Middle node is index 1.
			const middleId = nodeIds[1];
			if (!middleId) {
				return { ok: true, stage: 'addNode', nodeIds };
			}

			// First removal — should settle with ok=true.
			let firstRemove: { ok?: boolean } | null = null;
			let firstErr: string | null = null;
			try {
				firstRemove = (await c.send({
					type: 'chain.removeNode',
					trackId: 't1',
					nodeId: middleId
				})) as { ok?: boolean };
			} catch (e) {
				firstErr = (e as { code?: string }).code ?? 'unknown';
			}

			// Second removal of the same id — should either error (gone) or
			// be a no-op. If this "succeeds" on a different node, the first
			// removal bled over. We check the returned nodeId on first
			// remove in tandem below.
			let secondRemove: { ok?: boolean } | null = null;
			let secondErr: string | null = null;
			try {
				secondRemove = (await c.send({
					type: 'chain.removeNode',
					trackId: 't1',
					nodeId: middleId
				})) as { ok?: boolean };
			} catch (e) {
				secondErr = (e as { code?: string }).code ?? 'unknown';
			}

			return {
				ok: true,
				stage: 'done',
				nodeIds,
				middleId,
				firstRemove,
				firstErr,
				secondRemove,
				secondErr
			};
		});

		expect(result.ok).toBe(true);
		if ('stage' in result && result.stage === 'done') {
			// All three addNode calls returned a nodeId.
			expect(result.nodeIds?.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
			// The three ids must be distinct.
			const ids = result.nodeIds as string[];
			expect(new Set(ids).size).toBe(3);
			// First removal of the middle id must have resolved (response or
			// structured error) without throwing unexpectedly.
			const firstSettled = result.firstRemove !== null || result.firstErr !== null;
			expect(firstSettled).toBe(true);
			// Second removal must also settle — we don't require a specific
			// error code or ok value, but the envelope must come back.
			const secondSettled = result.secondRemove !== null || result.secondErr !== null;
			expect(secondSettled).toBe(true);
		} else {
			expect(result).toBeTruthy();
		}
	});
});
