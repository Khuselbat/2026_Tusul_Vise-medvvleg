// Playwright E2E — бүтэн урсгалыг бодит сервер + MySQL (civiz_test) + build хийсэн UI дээр шалгана.
//   cd client && npm run build   (нэг удаа)
//   npm run test:e2e
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT || 4100);

export default defineConfig({
  testDir: 'e2e',
  testIgnore: ['docs/**'], // гарын авлагын дэлгэцийн зураг — playwright.docs.config.js
  fullyParallel: false,
  workers: 1, // нэг сан, дараалсан урсгал
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 120_000, // ажилтны 2FA код давтагдахгүйн тулд дараагийн 30 сек цонхыг хүлээж магадгүй
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: 'mn-MN',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } }, // ≤860px дэлгэц (CLAUDE.md)
  ],
  webServer: {
    command: 'node e2e/server.js',
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
