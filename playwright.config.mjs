import {defineConfig} from '@playwright/test';
// The journey runs the real build and real Firebase SDK against local emulators (see test:e2e).
export default defineConfig({
 testDir: 'tests/e2e', workers: 1, timeout: 150000, outputDir: 'test-results',
 use: {baseURL: 'http://127.0.0.1:4173/', serviceWorkers: 'block', locale: 'ar'},
 webServer: {command: 'node scripts/serve-dist.mjs', port: 4173, reuseExistingServer: true},
});
