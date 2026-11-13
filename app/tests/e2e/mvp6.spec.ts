import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import raw from '../../src/data/routes.json' with { type: 'json' };

// Fixed before execution: official PDF p.1 has 19 rows in each direction.
// Provider replacement below is synthetic UI testing, never live Kakao evidence.
const out = process.env.E2E_EVIDENCE_DIR || 'artifacts/e2e';
const original = new Set(['to-songjeong-01', 'to-songjeong-04', 'to-songjeong-05', 'to-songjeong-06', 'to-songjeong-10', 'from-jinwol-01', 'from-jinwol-03', 'from-jinwol-04']);
const providerDisabled = 'export const isKakaoConfigured=()=>false;export const loadKakao=()=>Promise.reject(new Error("synthetic map unavailable"));export const placeProvider={search:async()=>({items:[],hasNext:false,page:1})};';
async function disableProvider(page: Page) {
  await page.route('**/src/providers/kakao.ts*', route => route.fulfill({ contentType: 'application/javascript', body: providerDisabled }));
}
function fixturePlaces() {
  const occurrence = raw.occurrences.find(item => item.tripId === 'tp-s25-from-jinwol-03' && raw.stops.find(stop => stop.stopId === item.stopId)?.displayName === '동신고')!;
  const coordinates = raw.locations.find(location => location.locationId === occurrence.locationId)!.coordinates.value;
  return ['다른 결과 · 합성 시험', '목적지 결과 · 합성 시험'].map((name, index) => ({
    provider: 'kakao', providerPlaceId: `mvp6-synthetic-${index}`, selectionId: `mvp6-synthetic-${index}`, kind: 'address', name,
    roadAddress: '광주광역시 북구 공개시설 주소 · 합성 시험', lotAddress: '광주광역시 북구 합성 시험', regionLabel: '광주광역시', detailUrl: null,
    coordinates, coordinateSource: 'synthetic UI fixture using recorded marker; not a provider place', selectedAt: null, selectionState: 'notSelected', validationState: 'checked',
  }));
}
async function mockedSearch(page: Page) {
  const places = fixturePlaces();
  await page.route('**/src/providers/kakao.ts*', route => route.fulfill({ contentType: 'application/javascript', body: `
    export const isKakaoConfigured=()=>false;
    export const loadKakao=()=>Promise.reject(new Error('synthetic unavailable map'));
    export const placeProvider={search:async(query,kind)=>{window.__mvp6SearchKind=kind;return {items:query==='없는장소_합성시험'?[]:${JSON.stringify(places)},hasNext:false,page:1}}};` }));
  await page.goto('/');
  await page.getByRole('button', { name: '하교 학교 → 광주', exact: true }).click();
  await page.getByLabel('이용 요일').selectOption('MON');
  await page.getByRole('button', { name: '주소', exact: true }).click();
  await page.locator('#place-query').fill('광주광역시 북구 공개시설 · 합성 주소시험');
  await page.getByRole('button', { name: '장소 검색', exact: true }).click();
  await expect(page.locator('.place-results button')).toHaveCount(2);
}

test('PDF 광주권19+19편을 두 방식 목록·확장편 상세·원문비고와 대조', async ({ page }) => {
  test.setTimeout(180000);
  await disableProvider(page);
  expect(raw.trips).toHaveLength(38);
  for (const direction of ['toCampus', 'fromCampus']) {
    const trips = raw.trips.filter(trip => trip.direction === direction);
    expect(trips).toHaveLength(19);
    await page.goto(`/#/routes/${direction}`);
    await expect(page.locator('.trip-card')).toHaveCount(5);
    for (const remaining of [14, 9, 4]) await page.getByRole('button', { name: `운행편 더 보기 · ${remaining}편 남음` }).click();
    await expect(page.locator('.trip-card')).toHaveCount(19);
    await page.goto(`/#/asis/routes/${direction}`);
    await expect(page.locator('.asis-route-list>li')).toHaveCount(19);
    // Existing MVP4 already traverses all As-is details. Here both modes are
    // explicitly compared for every row added beyond the original eight.
    for (const trip of trips.filter(item => !original.has(item.tripId.replace('tp-s25-', '')))) {
      const occurrences = raw.occurrences.filter(item => item.tripId === trip.tripId);
      for (const mode of ['tobe', 'asis']) {
        await page.goto(mode === 'tobe' ? `/#/trip/${trip.tripId}` : `/#/asis/trip/${trip.tripId}`);
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(trip.displayName);
        await expect(page.locator(mode === 'tobe' ? '.stop-timeline>li' : '.asis-stop-list>li')).toHaveCount(occurrences.length);
        const hasNotes = raw.serviceRules.some(rule => trip.serviceRuleIds.includes(rule.ruleId) && rule.rawNote.value);
        await expect(page.locator('.trip-conditions')).toHaveCount(hasNotes ? 1 : 0);
      }
    }
  }
});

test('기존8편 밖 송정②등교·송정⑦하교를 목록에서 직접 선택', async ({ page }, info) => {
  await disableProvider(page);
  for (const item of [{ direction: 'toCampus', id: 'tp-s25-to-songjeong-02', name: '송정②' }, { direction: 'fromCampus', id: 'tp-s25-from-songjeong-07', name: '송정⑦' }]) {
    await page.goto(`/#/routes/${item.direction}`);
    await page.locator('.list-filter input').fill(item.name);
    await expect(page.locator('.trip-card')).toHaveCount(1);
    await page.locator('.trip-card').click();
    await expect(page).toHaveURL(new RegExp(`${item.id}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(item.name);
    await expect(page.locator('.stop-timeline li').first()).toBeVisible();
    if (item.direction === 'fromCampus') {
      await expect(page.locator('.detail-facts')).toContainText('18:20');
      await expect(page.locator('.detail-facts')).toContainText('MNU 스퀘어 앞');
      await expect(page.locator('.detail-facts')).not.toContainText('정확한 지도 위치는 아직 확인되지 않았어요.');
    }
    await page.screenshot({ path: `${out}/mvp6-${info.project.name}-${item.id}.png`, fullPage: true });
  }
});

test('두 방식에서 미확정 지점에만 짧은 안내를 표시', async ({ page }) => {
  await disableProvider(page);
  for (const id of ['tp-s25-to-songjeong-09', 'tp-s25-to-jinwol-06', 'tp-s25-to-jinwol-08']) {
    for (const mode of ['tobe', 'asis']) {
      await page.goto(mode === 'tobe' ? `/#/trip/${id}` : `/#/asis/trip/${id}`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(raw.trips.find(trip => trip.tripId === id)!.displayName);
      await expect(page.getByRole('main')).not.toContainText(/CF01|CF02|CF13/);
      await expect(page.locator(mode === 'tobe' ? '.stop-timeline' : '.asis-stop-list')).toContainText('학교 확인 필요');
      await expect(page.locator(mode === 'tobe' ? '.stop-timeline li' : '.asis-stop-list li').first()).toBeVisible();
    }
  }
});

test('합성 주소결과 오선택·재선택과 월금16시·정렬·브라우저뒤로 조건보존', async ({ page }, info) => {
  await mockedSearch(page);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __mvp6SearchKind: string }).__mvp6SearchKind)).toBe('address');
  await page.locator('.place-results button').first().click();
  await expect(page.locator('.selected-place h3')).toContainText('다른 결과');
  await page.locator('.place-choice>summary').click();
  await page.locator('.place-results button').nth(1).click();
  await expect(page.locator('.selected-place h3')).toContainText('목적지 결과');
  if (!(await page.locator('.time-options').getAttribute('open') === '')) await page.locator('.time-options>summary').click();
  await page.getByLabel('학교에서 출발할 수 있는 시각').fill('16:00');
  await page.getByLabel('후보 정렬').selectOption('time');
  const monday = page.locator('.candidate-relations article[data-trip-id="tp-s25-from-jinwol-03"]');
  await expect(monday.first()).toBeVisible();
  const byStop = await page.locator('.candidate-card').evaluateAll(cards =>
    cards.map(card => Array.from(card.querySelectorAll('.candidate-time strong'), el => el.textContent!)));
  expect(byStop.flat().every(time => time >= '16:00')).toBe(true);
  for (const times of byStop) expect(times).toEqual([...times].sort());
  const earliest = byStop.map(times => times[0]);
  expect(earliest).toEqual([...earliest].sort());
  if (!(await page.locator('.time-options').getAttribute('open') === '')) await page.locator('.time-options summary').click();
  await page.getByLabel('비교할 직선거리 반경').selectOption('5000');
  await page.getByLabel('표시할 정류장 수').selectOption('20');
  await page.locator('.candidate-detail-link').first().click();
  await expect(page.locator('.stop-timeline li.is-selected')).toHaveCount(1);
  await page.goBack();
  await expect(page.getByLabel('학교에서 출발할 수 있는 시각')).toHaveValue('16:00');
  await expect(page.getByLabel('후보 정렬')).toHaveValue('time');
  await expect(page.getByLabel('비교할 직선거리 반경')).toHaveValue('5000');
  await expect(page.getByLabel('표시할 정류장 수')).toHaveValue('20');
  await expect(page.locator('.selected-place h3')).toContainText('목적지 결과');
  await page.getByLabel('이용 요일').selectOption('FRI');
  await expect(page.locator('.candidate-relations article[data-trip-id="tp-s25-from-jinwol-03"]')).toHaveCount(0);
  await expect(page.locator('.candidate-relations article[data-trip-id="tp-s25-from-jinwol-01"]')).toHaveCount(0);
  // Friday 16:00 may have other newly transcribed routes. Never force a global
  // zero based on the old eight-trip sample; 23:59 is a separate empty case.
  await page.getByLabel('학교에서 출발할 수 있는 시각').fill('23:59');
  await expect(page.getByText('현재 비교 가능한 거리 후보는 0개입니다.', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: '시간 조건을 풀고 하교 전체 시간표 보기 →', exact: true })).toBeVisible();
  await page.screenshot({ path: `${out}/mvp6-${info.project.name}-time-empty.png`, fullPage: true });
  await page.getByRole('button', { name: '시간 조건 지우고 다시 비교', exact: true }).click();
  await expect(page.locator('.candidate-card').first()).toBeVisible();
  await page.getByRole('button', { name: '장소 다시 선택', exact: true }).click();
  await page.locator('#place-query').fill('없는장소_합성시험');
  await page.getByRole('button', { name: '장소 검색', exact: true }).click();
  await expect(page.getByText('검색 결과가 없습니다.', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: '노선 목록에서 찾기', exact: true })).toBeVisible();
});

test('320·390·640·1440 CSS뷰포트의 확장목록·충돌상세 리플로우·axe·키보드', async ({ page }, info) => {
  test.setTimeout(120000);
  await disableProvider(page);
  for (const width of [320, 390, 640, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/#/routes/toCampus', '/#/trip/tp-s25-to-songjeong-09', '/#/asis/trip/tp-s25-to-jinwol-08']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}:${path}`).toBe(true);
      const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(scan.violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) })), `${width}:${path}`).toEqual([]);
    }
    // CSS viewport640 is a reflow approximation, not a claim that browser zoom
    // UI, a screen reader or a physical mobile device was tested.
    await page.screenshot({ path: `${out}/mvp6-${info.project.name}-reflow-${width}.png`, fullPage: true });
  }
  await page.goto('/#/asis');
  const homeward = page.getByRole('link', { name: '하교 노선 보기 도림캠퍼스 → 광주' });
  await homeward.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  await page.locator('.asis-route-list li[data-trip-id="tp-s25-from-songjeong-07"] a').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('송정⑦');
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
});

test('잘못된URL 복구와 페이지로드후 인터넷차단에서도 확장목록·상세 유지', async ({ page, context }) => {
  await disableProvider(page);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const path of ['/#/trip/%E0%A4%A', '/#/trip/not-in-pdf', '/#/asis/trip/%E0%A4%A']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/찾을 수|수록되지 않은/);
    await expect(page.getByRole('navigation', { name: '주요 메뉴' }).getByRole('link', { name: '노선 목록', exact: true })).toBeVisible();
  }
  await page.goto('/#/routes/fromCampus');
  await expect(page.locator('.trip-card')).toHaveCount(5);
    for (const remaining of [14, 9, 4]) await page.getByRole('button', { name: `운행편 더 보기 · ${remaining}편 남음` }).click();
    await expect(page.locator('.trip-card')).toHaveCount(19);
  await context.setOffline(true);
  try {
    await page.locator('.trip-card').filter({ hasText: '송정⑦' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('송정⑦');
    await expect(page.locator('.detail-facts')).toContainText('18:20');
    await expect(page.locator('.detail-facts')).toContainText('MNU 스퀘어 앞');
    await page.getByRole('button', { name: '하교 목록으로', exact: true }).click();
    await expect(page.locator('.trip-card')).toHaveCount(19);
  } finally { await context.setOffline(false); }
  expect(errors).toEqual([]);
});
