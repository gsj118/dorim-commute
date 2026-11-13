import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import raw from '../../src/data/routes.json' with { type: 'json' };

// Synthetic place selections reuse a recorded marker only to test UI deterministically.
// No provider call or claimed real place result; live Kakao tasks have a separate script.
async function syntheticSearch(page: Page, direction: 'toCampus' | 'fromCampus') {
  const tripId = direction === 'toCampus' ? 'tp-s25-to-songjeong-01' : 'tp-s25-from-jinwol-03';
  const occurrence = raw.occurrences.find(o => o.tripId === tripId && o.sequence.value === 2)!;
  const coordinates = raw.locations.find(l => l.locationId === occurrence.locationId)!.coordinates.value;
  const place = { provider: 'kakao', providerPlaceId: 'synthetic-ui-only', selectionId: 'synthetic-ui-only', kind: 'place', name: '합성 UI 시험 장소', roadAddress: '광주광역시 시험용 주소', lotAddress: '광주광역시 시험용 주소', regionLabel: '광주광역시', detailUrl: null, coordinates, coordinateSource: 'synthetic-ui-only: recorded marker, not a real provider place', selectedAt: '2026-11-06T00:00:00+09:00', selectionState: 'notSelected', validationState: 'checked' };
  await page.route('**/src/providers/kakao.ts*', route => route.fulfill({ contentType: 'application/javascript', body: `export const isKakaoConfigured=()=>false; export const loadKakao=()=>Promise.reject(new Error('synthetic map unavailable')); export const placeProvider={search:async()=>(${JSON.stringify({ items: [place], hasNext: false, page: 1 })})};` }));
  await page.goto('/');
  if (direction === 'fromCampus') await page.getByRole('button', { name: '하교 학교 → 광주', exact: true }).click();
  await page.getByLabel('이용 요일').selectOption('MON');
  await page.locator('#place-query').fill('합성 UI 시험');
  await page.getByRole('button', { name: '장소 검색', exact: true }).click();
  await page.locator('.place-results button').first().click();
  await expect(page.locator('.candidate-card').first()).toBeVisible();
}

test('브라우저 뒤로·앞으로로 상세, 선택한 장소, 검색 결과와 입력을 다시 연다', async ({ page }) => {
  await page.goto('data:text/html,previous');
  await syntheticSearch(page, 'toCampus');
  const choice = page.locator('.place-results button').first();
  const detail = page.locator('.candidate-detail-link').first();
  await detail.click();
  await expect(page.locator('.detail-facts')).toBeVisible();
  await page.goBack();
  await expect(detail).toBeFocused();
  await page.goBack();
  await expect(choice).toBeVisible();
  await expect(page.locator('.selected-place')).toHaveCount(0);
  await page.goBack();
  await expect(choice).toHaveCount(0);
  await expect(page.locator('#place-query')).toHaveValue('합성 UI 시험');
  await page.goForward();
  await expect(choice).toBeVisible();
  await page.goForward();
  await expect(page.locator('.selected-place h3')).toHaveText('합성 UI 시험 장소');
  await page.goForward();
  await expect(page.locator('.detail-facts')).toBeVisible();
  await page.getByRole('link', { name: '← 장소 검색 결과로' }).click();
  await expect(detail).toBeFocused();
  await page.getByRole('button', { name: '장소 다시 선택' }).click();
  await expect(choice).toBeVisible();
  await page.goBack();
  await expect(choice).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL('data:text/html,previous');
});

test('후보 비교: 거리순·시간필터·지도 없는 텍스트·상세 왕복 상태 보존', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await syntheticSearch(page, 'toCampus');
  const distances = await page.locator('.candidate-card').evaluateAll(cards => cards.map(c => Number((c as HTMLElement).dataset.distanceMeters)));
  expect(distances).toEqual([...distances].sort((a, b) => a - b));
  if (!(await page.locator('.time-options').getAttribute('open') === '')) await page.locator('.time-options summary').click();
  await page.getByLabel('비교할 직선거리 반경').selectOption('5000');
  await page.getByLabel('표시할 정류장 수').selectOption('5');
  if (!(await page.locator('.time-options').getAttribute('open') === '')) await page.locator('.time-options summary').click();
  await page.getByLabel('정류장에서 승차할 시각').fill('07:15');
  const times = await page.locator('.candidate-time strong').allTextContents();
  expect(times.length).toBeGreaterThan(0);
  times.forEach(time => expect(time >= '07:15').toBe(true));
  await page.getByLabel('후보 정렬').selectOption('time');
  await page.getByRole('button', { name: '지도에서 1번 강조', exact: true }).click();
  await expect(page.getByRole('button', { name: '지도에서 1번 강조', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.candidate-card.is-highlighted')).toHaveCount(1);
  const selectedName = await page.locator('.selected-place h3').innerText();
  const href = await page.locator('.candidate-detail-link').first().getAttribute('href');
  await page.locator('.candidate-detail-link').first().click();
  await expect(page).toHaveURL(new RegExp(href!.replace('#', '\\#') + '$'));
  await expect(page.locator('.stop-timeline li.is-selected')).toHaveCount(1);
  await page.getByRole('link', { name: '← 장소 검색 결과로', exact: true }).click();
  await expect(page.locator('.selected-place h3')).toHaveText(selectedName);
  await expect(page.locator('#place-query')).toHaveValue('합성 UI 시험');
  await expect(page.getByLabel('정류장에서 승차할 시각')).toHaveValue('07:15');
  await expect(page.getByLabel('비교할 직선거리 반경')).toHaveValue('5000');
  await expect(page.getByLabel('표시할 정류장 수')).toHaveValue('5');
  await expect(page.getByLabel('후보 정렬')).toHaveValue('time');
  const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(scan.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) }))).toEqual([]);
  expect(errors).toEqual([]);
});

test('동일 하차지점 복수편·하교 출발시각·금요일 불일치·0건 복구', async ({ page }) => {
  await syntheticSearch(page, 'fromCampus');
  const grouped = page.locator('.candidate-card').filter({ has: page.locator('article[data-trip-id="tp-s25-from-jinwol-01"]') }).first();
  await expect(grouped.locator('article[data-trip-id="tp-s25-from-jinwol-03"]')).toHaveCount(1);
  await expect(grouped).toContainText('15:30');
  await expect(grouped).toContainText('17:30');
  if (!(await page.locator('.time-options').getAttribute('open') === '')) await page.locator('.time-options summary').click();
  await page.getByLabel('학교에서 출발할 수 있는 시각').fill('16:00');
  await expect(page.locator('.candidate-relations article[data-trip-id="tp-s25-from-jinwol-01"]')).toHaveCount(0);
  await expect(page.locator('.candidate-relations article[data-trip-id="tp-s25-from-jinwol-03"]').first()).toBeVisible();
  await page.getByLabel('이용 요일').selectOption('FRI');
  await expect(page.locator('.selected-place')).toBeVisible();
  await expect(page.locator('.candidate-relations article[data-trip-id="tp-s25-from-jinwol-01"]')).toHaveCount(0);
  await expect(page.locator('.candidate-relations article[data-trip-id="tp-s25-from-jinwol-03"]')).toHaveCount(0);
  await page.getByLabel('학교에서 출발할 수 있는 시각').fill('23:59');
  await expect(page.getByText('현재 비교 가능한 거리 후보는 0개입니다.', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: '시간 조건을 풀고 하교 전체 시간표 보기 →', exact: true })).toBeVisible();
  await page.locator('.result-evidence>summary').click();
  const excluded = page.locator('.result-evidence>details').filter({ has: page.locator('summary').filter({ hasText: '현재 조건에서 제외' }) });
  await excluded.locator('summary').click();
  await expect(excluded).toContainText('확인된 문서 조건에 맞지 않습니다.');
  await page.getByRole('button', { name: '시간 조건 지우고 다시 비교', exact: true }).click();
  await expect(page.locator('.candidate-card').first()).toBeVisible();
  await expect(page.locator('.candidate-relations article[data-trip-id="tp-s25-from-jinwol-01"]')).toHaveCount(0);
});


test('지도 강조 후 키보드 초점·펼친 근거를 보존하고 후보 집계 단위를 구분', async ({ page }) => {
  await syntheticSearch(page, 'fromCampus');
  const card = page.locator('.candidate-card').first();
  const evidence = card.locator('.candidate-evidence');
  await evidence.locator('summary').click();
  const button = card.getByRole('button', { name: '지도에서 1번 기준점 보기', exact: true });
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#candidate-map h4')).toBeFocused();
  await page.goBack();
  await expect(button).toBeFocused();
  await expect(page.locator('#candidate-map h4')).toHaveCount(0);
  await expect(page.locator('.selected-place h3')).toHaveText('합성 UI 시험 장소');
  await page.goForward();
  await expect(page.locator('#candidate-map h4')).toBeFocused();
  await page.getByRole('button', { name: '하차 후보 목록으로', exact: true }).click();
  await expect(button).toBeFocused();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect(evidence).toHaveAttribute('open', '');
  await page.goBack();
  await expect(page.locator('#candidate-map h4')).toBeFocused();
  await page.goForward();
  await expect(button).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(evidence.locator('summary')).toBeFocused();
  while (await page.getByRole('button', { name: /하차 지점 더 보기/ }).count()) {
    await page.getByRole('button', { name: /하차 지점 더 보기/ }).click();
  }
  const stops = await page.locator('.candidate-card').count();
  await expect(page.locator('#candidate-list [role="status"]')).toHaveText(`후보 ${stops}곳 · 직선거리순`);
});

test('지연 검색 중 라이브 상태를 알리고 빈 결과로 전환', async ({ page }) => {
  await page.route('**/src/providers/kakao.ts*', route => route.fulfill({ contentType: 'application/javascript', body: "export const isKakaoConfigured=()=>false; export const loadKakao=()=>Promise.reject(); export const placeProvider={search:()=>new Promise(resolve=>setTimeout(()=>resolve({items:[],hasNext:false,page:1}),1500))};" }));
  await page.goto('/');
  await page.locator('#place-query').fill('합성 지연 검색');
  await page.getByRole('button', { name: '장소 검색', exact: true }).click();
  await expect(page.locator('.place-search [aria-live] [role="status"]')).toContainText('장소를 검색하고 있습니다');
  await expect(page.getByRole('button', { name: '검색 중…', exact: true })).toBeDisabled();
  await expect(page.getByText('검색 결과가 없습니다.', { exact: true })).toBeVisible();
});
