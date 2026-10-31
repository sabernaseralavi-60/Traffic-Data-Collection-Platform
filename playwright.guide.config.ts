import os from 'node:os';
import path from 'node:path';
import { defineConfig } from '@playwright/test';

// Regenerates the screenshots of the user guide from a local production build (never from the live database):
//   npm run build && npx playwright test -c playwright.guide.config.ts
const PORT = 3218;

export default defineConfig({
  testDir: './docs/guide',
  testMatch: /capture\.spec\.ts/,
  timeout: 300_000,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}`, viewport: { width: 1280, height: 900 }, permissions: ['microphone'], launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } },
  webServer: {
    command: 'node dist/server.mjs',
    url: `http://localhost:${PORT}/healthz`,
    reuseExistingServer: false,
    timeout: 90_000,
    env: {
      NODE_ENV: 'production', PORT: String(PORT), SESSION_SECRET: 'guide-secret-guide-secret-guide-secret-guide', ADMIN_PASSWORD: 'Admin-pass-1', SEED_DEMO: 'true', SEED_PASSWORD: 'Demo-pass-1',
      DATA_DIR: path.join(os.tmpdir(), `trafficlab-guide-${Date.now()}`), PYTHON_BIN: process.platform === 'win32' ? 'python' : 'python3',
    },
  },
});
