import os from 'node:os';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const PORT = 3217;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'mobile', use: { ...devices['Pixel 7'] } }, { name: 'desktop', use: { viewport: { width: 1366, height: 800 } } }],
  webServer: {
    command: 'node dist/server.mjs',
    url: `http://localhost:${PORT}/healthz`,
    reuseExistingServer: false,
    timeout: 90_000,
    env: {
      NODE_ENV: 'production',
      PORT: String(PORT),
      SESSION_SECRET: 'e2e-secret-e2e-secret-e2e-secret-e2e-secret',
      ADMIN_PASSWORD: 'Admin-pass-1',
      SEED_DEMO: 'true',
      SEED_PASSWORD: 'Demo-pass-1',
      DATA_DIR: path.join(os.tmpdir(), `trafficlab-e2e-${Date.now()}`),
      PYTHON_BIN: process.platform === 'win32' ? 'python' : 'python3',
    },
  },
});
