// Generates a storageState JSON file for the "premium" project. A fresh
// browser context visits the app origin, writes the two localStorage flags
// that unlock Premium + expose window.__cadenza, then saves state.
//
// The resulting file (e2e/.auth/premium.json) is consumed by the premium
// project in playwright.config.ts via `use.storageState`.

import { chromium, type FullConfig } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(HERE, '..', '.auth', 'premium.json');
const FREE_PATH = resolve(HERE, '..', '.auth', 'free.json');

async function saveStateAt(
	baseURL: string,
	outPath: string,
	mutate: () => void
): Promise<void> {
	const browser = await chromium.launch();
	try {
		const context = await browser.newContext();
		const page = await context.newPage();
		// Retry the goto a few times — the dev server may still be warming
		// up even though Playwright thinks the webServer URL is ready.
		let lastErr: unknown;
		for (let i = 0; i < 5; i++) {
			try {
				await page.goto(`${baseURL}/`, {
					waitUntil: 'domcontentloaded',
					timeout: 15_000
				});
				lastErr = undefined;
				break;
			} catch (e) {
				lastErr = e;
				await new Promise((r) => setTimeout(r, 1000));
			}
		}
		if (lastErr) throw lastErr;

		await page.evaluate(mutate);

		mkdirSync(dirname(outPath), { recursive: true });
		await context.storageState({ path: outPath });
	} finally {
		await browser.close();
	}
}

async function savePremiumState(baseURL: string): Promise<void> {
	await saveStateAt(baseURL, OUT_PATH, () => {
		window.localStorage.setItem('cadenzaPlanOverride', 'premium');
		window.localStorage.setItem('cadenzaE2E', '1');
	});
}

async function saveFreeState(baseURL: string): Promise<void> {
	await saveStateAt(baseURL, FREE_PATH, () => {
		window.localStorage.removeItem('cadenzaPlanOverride');
		window.localStorage.setItem('cadenzaE2E', '1');
	});
}

export default async function globalSetup(config: FullConfig): Promise<void> {
	const baseURL = config.projects[0]?.use?.baseURL ?? 'http://localhost:52730';
	await savePremiumState(baseURL);
	await saveFreeState(baseURL);
}
