import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Live public-facility searches; no SDK interception or persistent browser profile.
const base = (process.argv[2] || 'http://127.0.0.1:5173/').replace(/\/?$/, '/');
const out = resolve(process.argv[3] || 'artifacts/ui-release');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const report = { base, startedAt: new Date().toISOString(), cases: [], humanEvaluation: false };
const placeName = '유니버시아드힐스테이트2단지아파트';
try {
  for (const width of [320, 390, 768, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const result = { width, scenes: [], errors };
    report.cases.push(result);
    const capture = async name => {
      await page.evaluate(() => document.fonts.ready);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      expect(overflow, `${width}px ${name}: horizontal overflow`).toBe(false);
      await page.screenshot({ path: `${out}/${width}-${name}.png`, animations: 'disabled' });
      result.scenes.push({ name, overflow });
    };
    await page.goto(base, { waitUntil: 'networkidle' });
    await expect(page.locator('.ui-refined')).toHaveCount(1);
    await expect(page.locator('.hero h1')).toHaveText('장소로 통학버스 찾기');
    await expect(page.locator('.header-project')).toHaveText('학생 프로젝트');
    await expect(page.locator('.site-header nav a')).toHaveCount(3);
    const header = await page.locator('.site-header').evaluate(element => {
      const brand = element.querySelector('.brand').getBoundingClientRect();
      return { height: element.getBoundingClientRect().height, centerError: Math.abs(brand.x + brand.width / 2 - innerWidth / 2) };
    });
    expect(header.height).toBeLessThanOrEqual(112);
    expect(header.centerError).toBeLessThan(1);
    result.header = header;
    await capture('home');

    if (width === 390 || width === 1440) {
      await page.getByRole('button', { name: '하교 학교 → 광주', exact: true }).click();
      await expect(page.locator('.hero-copy > p')).toContainText('학교 출발 시각');
      await page.getByRole('textbox', { name: '목적지 장소명', exact: true }).fill(placeName);
      await page.getByRole('button', { name: '장소 검색', exact: true }).click();
      await page.locator('.place-results button').filter({ has: page.getByText(placeName, { exact: true }) }).first().click();
      const first = page.locator('.candidate-card').first();
      await expect(first).toContainText('서광주우체국');
      await expect(first).toContainText('17:30');
      await expect(first).toContainText('18:20');
      await expect(page.locator('.selected-place-heading')).toHaveCSS('background-image', /meadow/);
      await page.locator('.selected-place-heading').evaluate(element => element.scrollIntoView({ block: 'start' }));
      await capture('homeward-results');
      await first.locator('.candidate-map-button').click();
      await expect(page.locator('#candidate-map h4')).toBeFocused();
      await expect.poll(() => page.locator('#candidate-map img').evaluateAll(images =>
        images.some(image => image.src.includes('/tile/') && image.complete && image.naturalWidth > 0))).toBe(true);
      result.mapTilesLoaded = true;
      await capture('candidate-map');
      await page.getByRole('button', { name: '하차 후보 목록으로', exact: true }).click();
      await expect(first.locator('.candidate-map-button')).toBeFocused();
      await page.getByRole('combobox', { name: '이용 요일', exact: true }).selectOption('FRI');
      await expect(first.locator('.candidate-time strong').first()).toHaveText('15:30');
      const link = first.locator('.candidate-detail-link').first();
      await link.focus();
      await page.keyboard.press('Enter');
      for (const text of ['15:30', 'MNU 스퀘어 앞', '서광주우체국', '실제 하차 위치는 확인되지 않았습니다.']) {
        await expect(page.locator('.detail-facts')).toContainText(text);
      }
      await capture('friday-detail');
      await page.getByRole('link', { name: '← 장소 검색 결과로', exact: true }).click();
      await expect(link).toBeFocused();
      await expect(page.getByRole('combobox', { name: '이용 요일', exact: true })).toHaveValue('FRI');
      await page.getByRole('button', { name: '같은 장소로 등교편 보기', exact: true }).click();
      await expect(page.locator('.trip-columns').first()).toContainText('승차 시각');
      const inbound = page.locator('.candidate-card').first();
      const boardingTime = await inbound.locator('.candidate-time strong').first().innerText();
      expect(boardingTime).toMatch(/^\d{2}:\d{2}$/);
      const inboundLink = inbound.locator('.candidate-detail-link').first();
      await inboundLink.click();
      await expect(page.locator('.detail-facts')).toContainText(boardingTime);
      await capture('inbound-detail');
      await page.getByRole('link', { name: '← 장소 검색 결과로', exact: true }).click();
      await expect(inboundLink).toBeFocused();
      result.liveSearch = { placeName, fridaySchoolDeparture: '15:30', boardingTime, keyboardReturn: true };
    }

    await page.goto(base + '#/routes/fromCampus');
    await expect(page.locator('.trip-card').first()).toBeVisible();
    await expect(page.locator('.ui-refined')).toHaveCount(1);
    await capture('routes');
    const filter = page.getByRole('searchbox', { name: '노선명 또는 정류장명', exact: true });
    await filter.fill('수록되지않은가상입력');
    await expect(page.locator('.route-empty')).toContainText('검색 결과가 없습니다.');
    await page.getByRole('button', { name: '하교 노선 전체 보기', exact: true }).click();
    await expect(filter).toHaveValue('');
    await expect(page.locator('.trip-card').first()).toBeVisible();
    await page.goto(base + '#/sources');
    await expect(page.locator('.ui-refined .usage-guide')).toBeVisible();
    await capture('guide');
    await page.goto(base + '#/compare');
    await expect(page.locator('.ui-refined')).toHaveCount(0);
    const comparison = page.locator('.submission-comparison');
    await expect(comparison.getByRole('link', { name: '직접 검색해보기', exact: true })).toHaveCount(2);
    await capture('comparison');
    await comparison.getByRole('link', { name: '직접 검색해보기', exact: true }).first().click();
    await expect(page.locator('.ui-refined .hero h1')).toHaveText('장소로 통학버스 찾기');
    await expect(page.getByRole('combobox', { name: '이용 요일', exact: true })).toHaveValue('FRI');
    await page.locator('.brand').click();
    await expect(page.locator('.demo-scenario')).toHaveCount(0);
    await expect(page.locator('#place-query')).toHaveValue('');
    expect(errors).toEqual([]);
    result.passed = true;
    console.log(`${width}px: PASS`);
    await context.close();
  }
} finally {
  await writeFile(`${out}/results.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
