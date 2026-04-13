import { defineConfig, devices } from '@playwright/test';

const PORT = 52730;

export default defineConfig({
	testDir: './e2e',
	// Force sequential execution — the bridge + backend fixtures bind fixed
	// ports (7890, 52731) so parallel workers would collide. CI can override
	// with PW_WORKERS if isolated ports are wired up later.
	workers: process.env.PW_WORKERS ? Number(process.env.PW_WORKERS) : 1,
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: 'list',
	globalSetup: './e2e/fixtures/global-setup.ts',
	use: {
		baseURL: `http://localhost:${PORT}`,
		trace: 'on-first-retry'
	},
	projects: [
		{
			// `free` — smoke + free-flow scenarios. No Premium override is
			// present in the saved storageState so Mixer/Automation tabs are
			// hidden. The legacy smoke.spec.ts lives at the top level and
			// runs here too.
			name: 'free',
			testMatch: /(smoke\.spec\.ts|scenarios\/free-.*\.spec\.ts)$/,
			use: {
				...devices['Desktop Chrome'],
				storageState: './e2e/.auth/free.json'
			}
		},
		{
			// `premium` — bridge handshake + Mixer/Automation scenarios.
			// storageState pre-seeds cadenzaPlanOverride=premium so the
			// planStore reports premium tier without hitting /auth/me.
			name: 'premium',
			testMatch:
				/scenarios\/(bridge-|mixer-|automation-|builtin-|render-|premium-).*\.spec\.ts$/,
			use: {
				...devices['Desktop Chrome'],
				storageState: './e2e/.auth/premium.json'
			}
		}
	],
	webServer: {
		command: 'npm run dev',
		url: `http://localhost:${PORT}`,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000
	}
});
