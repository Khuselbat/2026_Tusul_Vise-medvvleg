// docs/USER_GUIDE.md-ийн дэлгэцийн зургийг дахин үүсгэнэ (UI өөрчлөгдсөн бүрд):
//   cd client && npm run build && cd ..
//   npm run docs:screenshots        → docs/screenshots/guide/*.png
// civiz_test санг жишээ мэдүүлэгтэй (зохиомол) өгөгдлөөр цэвэрлэж ажиллана.
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT || 4100);

export default defineConfig({
  testDir: 'e2e/docs',
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: { baseURL: `http://127.0.0.1:${PORT}`, locale: 'mn-MN', ...devices['Desktop Chrome'], viewport: { width: 1360, height: 860 } },
  webServer: {
    command: 'node e2e/server.js',
    env: { E2E_DEMO_APPS: '1' },
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
