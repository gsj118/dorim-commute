import { defineConfig } from '@playwright/test';

const out = process.env.RC1_PRODUCTION_EVIDENCE_DIR || './artifacts/production';
export default defineConfig({
  testDir: './tests/production',
  fullyParallel: false, workers: 1, timeout: 45000,
  expect: { timeout: 8000 },
  outputDir: `${out}/failures`,
  reporter: [['list'], ['json', { outputFile: `${out}/results.json` }]],
  use: { baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173', browserName: 'chromium', channel: process.env.PLAYWRIGHT_CHANNEL || undefined, headless: true, screenshot: 'only-on-failure', locale: 'ko-KR', timezoneId: 'Asia/Seoul' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
