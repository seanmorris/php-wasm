import { defineConfig } from '@playwright/test';

import { getPlaywrightLaunchOptions } from './test/lib/playwright-browser.mjs';

export default defineConfig({
	testDir: './test/browser',
	testMatch: ['**/*.spec.mjs'],
	fullyParallel: false,
	workers: 1,
	timeout: 180000,
	reporter: 'list',
	use: {
		baseURL: `http://127.0.0.1:${process.env.DEMO_WEB_E2E_PORT ?? 9000}`,
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
		video: 'off',
		...getPlaywrightLaunchOptions()
	},
});
