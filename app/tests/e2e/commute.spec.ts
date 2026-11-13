const evidenceDir = process.env.E2E_EVIDENCE_DIR || 'artifacts/e2e';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('등교 문서 탐색: 홈 → 목록 → 지점별 시각 → 위치 부족 → 복귀', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('아는 장소로 찾는');
  await page.getByRole('button', { name: /등교 노선/ }).click();
  await expect(page.getByRole('heading', { name: '노선 목록', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /송정①/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('송정①');
  for (const time of ['07:10', '07:14', '07:18', '07:21', '07:27', '07:30']) await expect(page.locator('.stop-time').filter({ hasText: time })).toHaveCount(1);
  await expect(page.locator('.detail-facts')).toContainText('시간표에 나온 승차 지점');
  await expect(page.locator('.inline-notice').first()).toContainText('정류장을 선택해 승차 시각을 확인하세요');
  await page.getByRole('button', { name: /서광주우체국/ }).click();
  await expect(page.locator('.stop-disclosure')).toContainText('실제로 타는 도로변은 이용 전에 확인해 주세요.');
  await page.getByRole('button', { name: '등교 목록으로' }).click();
  await expect(page.getByRole('heading', { name: '노선 목록', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('나의 통학편');
  await page.goForward();
  await expect(page.getByRole('heading', { name: '노선 목록', exact: true })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('송정①');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('송정①');
  expect(errors).toEqual([]);
});

test('하교 학교 출발·금요일 replace·하차 시각 미제공', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /하교 노선/ }).click();
  await page.getByRole('button', { name: /진월③/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('진월③');
  await expect(page.locator('.detail-facts')).toContainText('학교 출발 시각');
  await expect(page.locator('.detail-facts')).toContainText('17:30');
  await expect(page.locator('.detail-facts')).toContainText('MNU 스퀘어 앞');
  await expect(page.locator('.detail-facts')).not.toContainText('사용자가 확인한 승차 장소예요.');
  await page.getByLabel('확인할 요일').selectOption('FRI');
  await expect(page.locator('.detail-facts')).toContainText('15:30');
  await expect(page.locator('.detail-facts > div:first-child > strong')).toHaveText('15:30');
  await expect(page.locator('.detail-facts')).toContainText('금요일 · 17:30에서 변경');
  await expect(page.locator('.stop-timeline')).toContainText(/문흥동\s*샛터코아/);
  const alighting = page.locator('.stop-timeline li').filter({ hasText: '하차 지점' });
  await expect(alighting).toHaveCount(10);
  await expect(alighting.filter({ hasText: /도착 시각\s*시간표에 없음/ })).toHaveCount(10);
});

test('미수록 검색은 미운행으로 해석하지 않고 복구된다', async ({ page }) => {
  await page.goto('data:text/html,previous');
  await page.goto('/#/routes/toCampus');
  await page.getByRole('searchbox').fill('수록되지않은가상입력');
  await expect(page.getByText('등교 시간표에서 ‘수록되지않은가상입력’을 찾지 못했어요.')).toBeVisible();
  await expect(page.locator('.route-empty').getByRole('link', { name: '장소 검색' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('searchbox')).toHaveValue('');
  await expect(page.getByRole('button', { name: /송정①/ })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('searchbox')).toHaveValue('수록되지않은가상입력');
  await page.locator('.route-empty').getByRole('link', { name: '장소 검색' }).click();
  await expect(page.locator('#place-query')).toHaveValue('수록되지않은가상입력');
  await expect(page.locator('#place-query')).toBeFocused();
  await page.goBack();
  await expect(page.locator('.route-empty h3')).toContainText('수록되지않은가상입력');
  await page.getByRole('button', { name: '등교 노선 전체 보기' }).click();
  await expect(page.getByRole('button', { name: /송정①/ })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('searchbox')).toHaveValue('수록되지않은가상입력');
});

test('API 미설정 시 실제 검색을 위장하지 않고 하교 목록으로 복구한다', async ({ page }) => {
  // Remove only the injected client env key in this test page. Never change .env.local.
  await page.route('**/src/providers/kakao.ts*', async route => {
    const response = await route.fetch();
    const source = (await response.text()).replace(/"VITE_KAKAO_MAP_JS_KEY"\s*:\s*"[^"]*"/g, '"VITE_KAKAO_MAP_JS_KEY":""');
    await route.fulfill({ response, body: source });
  });
  const externalRequests: string[] = [];
  page.on('request', request => { if (!new URL(request.url()).hostname.match(/^(127\.0\.0\.1|localhost)$/)) externalRequests.push(request.url()); });
  await page.goto('/');
  await page.getByRole('button', { name: '하교 학교 → 광주', exact: true }).click();
  await expect(page.getByText('장소 검색 연결 준비 중')).toBeVisible();
  await page.getByLabel('어디로 돌아가시나요?').fill('수록되지않은가상입력');
  await page.getByRole('button', { name: '장소 검색', exact: true }).click();
  await expect(page.getByText('장소·주소 검색이 연결되지 않았습니다. 노선 목록을 이용해 주세요.')).toBeVisible();
  await page.getByRole('link', { name: '노선 목록으로', exact: true }).click();
  await expect(page.getByRole('button', { name: /진월③/ })).toBeVisible();
  expect(externalRequests).toEqual([]);
});

test('잘못된 운행편 링크 및 잘못된 percent encoding이 앱을 종료하지 않는다', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/#/trip/not-in-dataset');
  await expect(page.getByRole('heading', { name: '해당 운행편을 찾을 수 없어요.' })).toBeVisible();
  await page.goto('/#/trip/%E0%A4%A');
  await expect(page.getByRole('heading', { name: '해당 운행편을 찾을 수 없어요.' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('화면 크기·키보드·주요 화면 접근성과 실제 스크린샷', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('아는 장소로 찾는');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: '본문으로 건너뛰기' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
  for (const hash of ['/', '/routes/toCampus', '/trip/tp-s25-to-songjeong-01', '/trip/tp-s25-from-jinwol-03', '/sources']) {
    await page.goto(`/#${hash}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    if (hash === '/routes/toCampus') {
      const routeUrl = page.url();
      await page.getByRole('link', { name: '본문으로 건너뛰기' }).focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('main')).toBeFocused();
      expect(page.url()).toBe(routeUrl);
    }
    const size = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: window.innerWidth }));
    expect(size.scroll, `${hash} 가로 넘침`).toBeLessThanOrEqual(size.viewport + 1);
    const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(scan.violations.map(item => ({ id: item.id, impact: item.impact, nodes: item.nodes.map(node => node.target) })), `${hash} axe`).toEqual([]);
  }
  await page.goto('/');
  await page.screenshot({ path: `${evidenceDir}/after-${testInfo.project.name}-home.png`, fullPage: true });
});
