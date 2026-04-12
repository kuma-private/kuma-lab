// Playwright fixture: spin up the Cadenza Bridge + F# backend as child
// processes for the duration of a worker, then tear them down. The Vite dev
// server itself is still managed by Playwright's `webServer` config.
//
// Usage in a spec:
//   import { test, expect } from '../fixtures/full-stack';
//   test('foo', async ({ page, bridge, backend }) => { ... });
//
// Each fixture is `{ scope: 'worker' }` so a single pair of processes is
// shared across all tests in the same worker. Playwright worker isolation
// ensures tests in parallel workers get separate bridge ports via
// BRIDGE_PORT env / fixture option. For now we pin bridge to 7890 and
// backend to 52731 and rely on `workers: 1` in the e2e CI config.

import { test as base, expect } from '@playwright/test';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createConnection } from 'node:net';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
// __dirname is e2e/fixtures — four parents up = repo root.
const REPO_ROOT = resolve(HERE, '..', '..', '..', '..');
const BRIDGE_DIR = resolve(REPO_ROOT, 'cadenza-bridge');
const BACKEND_DIR = resolve(REPO_ROOT, 'tamekoma-night', 'backend', 'src', 'TamekomaNight.Api');
const BRIDGE_BIN = resolve(BRIDGE_DIR, 'target', 'debug', 'cadenza-bridge');

// Shared across specs — these are bound at config time but declared here
// so scenarios can import them too.
export const BRIDGE_PORT = Number(process.env.CADENZA_E2E_BRIDGE_PORT ?? 7890);
export const BRIDGE_HOST = '127.0.0.1';
export const BRIDGE_BIND = `${BRIDGE_HOST}:${BRIDGE_PORT}`;

export const BACKEND_PORT = Number(process.env.CADENZA_E2E_BACKEND_PORT ?? 52731);
export const BACKEND_URL = `http://localhost:${BACKEND_PORT}`;

// Matches the backend DEV_MODE fallback so scripts/run-full-stack.sh and
// this fixture issue compatible tickets.
export const JWT_KEY = 'e2e-test-key-at-least-32-chars-long!';
export const DEV_PREMIUM_UIDS = 'dev-user';

export interface BridgeFixture {
	host: string;
	port: number;
	url: string;
	process: ChildProcess;
}

export interface BackendFixture {
	port: number;
	baseUrl: string;
	process: ChildProcess;
}

function waitForPort(host: string, port: number, timeoutMs: number): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	return new Promise((resolvePromise, rejectPromise) => {
		const attempt = () => {
			const sock = createConnection({ host, port });
			const done = (err?: Error) => {
				sock.removeAllListeners();
				sock.destroy();
				if (!err) {
					resolvePromise();
				} else if (Date.now() >= deadline) {
					rejectPromise(
						new Error(
							`timed out after ${timeoutMs}ms waiting for ${host}:${port} (${err.message})`
						)
					);
				} else {
					setTimeout(attempt, 200);
				}
			};
			sock.once('connect', () => done());
			sock.once('error', (err) => done(err));
		};
		attempt();
	});
}

async function waitForHttp(url: string, timeoutMs: number): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	// eslint-disable-next-line no-constant-condition
	while (true) {
		try {
			const res = await fetch(url);
			if (res.ok || res.status === 401 || res.status === 404) {
				return;
			}
		} catch {
			/* not ready yet */
		}
		if (Date.now() >= deadline) {
			throw new Error(`timed out after ${timeoutMs}ms waiting for ${url}`);
		}
		await new Promise((r) => setTimeout(r, 250));
	}
}

function ensureBridgeBinary(): string {
	if (existsSync(BRIDGE_BIN)) return BRIDGE_BIN;
	// Build on demand. This is slow (first run ~minutes) but lets fresh
	// checkouts run the fixture without a separate setup step.
	const build = spawnSync('cargo', ['build', '--bin', 'cadenza-bridge'], {
		cwd: BRIDGE_DIR,
		stdio: 'inherit'
	});
	if (build.status !== 0) {
		throw new Error(
			`cargo build --bin cadenza-bridge failed (exit ${build.status}). Ensure a Rust toolchain is installed.`
		);
	}
	if (!existsSync(BRIDGE_BIN)) {
		throw new Error(`bridge binary not found at ${BRIDGE_BIN} after build`);
	}
	return BRIDGE_BIN;
}

async function startBridge(): Promise<BridgeFixture> {
	const bin = ensureBridgeBinary();
	const child = spawn(bin, [], {
		env: {
			...process.env,
			CADENZA_BRIDGE_HEADLESS: '1',
			CADENZA_BRIDGE_BIND: BRIDGE_BIND,
			RUST_LOG: process.env.RUST_LOG ?? 'info'
		},
		stdio: ['ignore', 'pipe', 'pipe']
	});
	// Forward stderr so cargo panics / port collisions surface in test logs.
	child.stderr?.on('data', (chunk: Buffer) => {
		process.stderr.write(`[bridge] ${chunk.toString()}`);
	});
	child.on('exit', (code, sig) => {
		if (code !== null && code !== 0) {
			process.stderr.write(`[bridge] exited with code=${code} sig=${sig}\n`);
		}
	});
	await waitForPort(BRIDGE_HOST, BRIDGE_PORT, 15_000);
	return {
		host: BRIDGE_HOST,
		port: BRIDGE_PORT,
		url: `ws://${BRIDGE_HOST}:${BRIDGE_PORT}`,
		process: child
	};
}

async function startBackend(): Promise<BackendFixture> {
	const child = spawn('dotnet', ['run', '--no-build'], {
		cwd: BACKEND_DIR,
		env: {
			...process.env,
			DEV_MODE: 'true',
			JWT_SIGNING_KEY: JWT_KEY,
			CADENZA_DEV_PREMIUM_UIDS: DEV_PREMIUM_UIDS,
			ASPNETCORE_URLS: BACKEND_URL
		},
		stdio: ['ignore', 'pipe', 'pipe']
	});
	child.stderr?.on('data', (chunk: Buffer) => {
		process.stderr.write(`[backend] ${chunk.toString()}`);
	});
	child.on('exit', (code, sig) => {
		if (code !== null && code !== 0) {
			process.stderr.write(`[backend] exited with code=${code} sig=${sig}\n`);
		}
	});
	await waitForHttp(`${BACKEND_URL}/health`, 60_000);
	return {
		port: BACKEND_PORT,
		baseUrl: BACKEND_URL,
		process: child
	};
}

async function stopChild(child: ChildProcess): Promise<void> {
	if (!child || child.killed || child.exitCode !== null) return;
	return new Promise<void>((resolvePromise) => {
		const onExit = () => resolvePromise();
		child.once('exit', onExit);
		try {
			child.kill('SIGTERM');
		} catch {
			resolvePromise();
			return;
		}
		setTimeout(() => {
			if (child.exitCode === null) {
				try {
					child.kill('SIGKILL');
				} catch {
					/* ignore */
				}
			}
		}, 2000);
	});
}

/** Extended test fixtures for full-stack scenarios. */
export const test = base.extend<
	Record<string, never>,
	{ bridge: BridgeFixture; backend: BackendFixture }
>({
	// eslint-disable-next-line no-empty-pattern -- Playwright requires an object destructure as the first arg.
	bridge: [
		async ({}, use) => {
			const fx = await startBridge();
			await use(fx);
			await stopChild(fx.process);
		},
		{ scope: 'worker', timeout: 120_000 }
	],
	// eslint-disable-next-line no-empty-pattern -- Playwright requires an object destructure as the first arg.
	backend: [
		async ({}, use) => {
			const fx = await startBackend();
			await use(fx);
			await stopChild(fx.process);
		},
		{ scope: 'worker', timeout: 120_000 }
	]
});

export { expect };
