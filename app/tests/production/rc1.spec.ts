import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import raw from '../../src/data/routes.json' with { type: 'json' };

// Production JS is never replaced. Only the external SDK boundary is simulated.
// All exported evaluation records are automated rehearsals, never human results.
const out = process.env.RC1_PRODUCTION_EVIDENCE_DIR || './artifacts/production';
async function sdkBoundary(page: Page, direction: 'toCampus' | 'fromCampus' = 'fromCampus') {
  const occurrence = direction === 'fromCampus'
    ? raw.occurrences.find(item => item.tripId === 'tp-s25-from-jinwol-03' && raw.stops.find(stop => stop.stopId === item.stopId)?.displayName === '동신고')!
    : raw.occurrences.find(item => item.tripId === 'tp-s25-to-songjeong-01' && item.sequence.value === 2)!;
  const point = raw.locations.find(item => item.locationId === occurrence.locationId)!.coordinates.value!;
  const result = { id: 'rc1-synthetic', place_name: '합성 시험 장소', address_name: '광주광역시 북구 합성 시험', road_address_name: '광주광역시 북구 합성 시험', x: String(point.longitude), y: String(point.latitude) };
  await page.route('https://**/*', route => {
    if (new URL(route.request().url()).pathname !== '/v2/maps/sdk.js') return route.abort();
    return route.fulfill({ contentType: 'application/javascript', body: `
      window.__rc1Calls = [];
      const answer = (kind,q,cb) => {
        window.__rc1Calls.push(kind);
        setTimeout(()=>cb(q==='빈결과'?[]:[${JSON.stringify(result)}],q==='오류'?'ERROR':q==='빈결과'?'ZERO_RESULT':'OK',{hasNextPage:false}),30);
      };
      window.kakao={maps:{load:cb=>cb(),services:{Status:{OK:'OK',ERROR:'ERROR',ZERO_RESULT:'ZERO_RESULT'},Places:class{keywordSearch(q,cb){answer('place',q,cb)}},Geocoder:class{addressSearch(q,cb){answer('address',q,cb)}}},LatLng:class{},Map:class{constructor(){throw Error('synthetic map failure')}}}};
    ` });
  });
}
async function search(page: Page, direction: 'toCampus' | 'fromCampus' = 'fromCampus') {
  await page.goto('/');
  if (direction === 'fromCampus') await page.getByRole('button', { name: '하교 학교 → 광주', exact: true }).click();
  await page.getByLabel('이용 요일').selectOption('MON');
  await page.locator('#place-query').fill('합성 시험');
  await page.getByRole('button', { name: '장소 검색', exact: true }).click();
  await page.locator('.place-results button').first().click();
  await expect(page.locator('.candidate-card').first()).toBeVisible();
}

test('하교 거리 0건에서 좌표 없는 하차편을 찾아 학교 출발을 확인하고 원래 조건으로 돌아온다', async ({ page }) => {
  await sdkBoundary(page);
  await search(page);
  await page.getByRole('combobox', { name: '이용 요일' }).selectOption('FRI');
  await page.locator('.time-options > summary').click();
  await page.getByLabel('학교에서 출발할 수 있는 시각').fill('23:59');
  const list = page.locator('#candidate-list');
  await expect(list).toContainText('현재 비교 가능한 거리 후보는 0개입니다.');
  const coverage = list.locator('.direction-coverage');
  await expect(coverage.locator('p').first()).toBeHidden();
  await coverage.locator('summary').click();
  await expect(coverage.locator('p').first()).toBeVisible();
  await expect(coverage.locator('p').first()).toContainText('19편');
  const stop = page.getByRole('searchbox', { name: '하차 지점 이름' });
  await stop.fill('샛터코아');
  await stop.press('Enter');
  await expect(page.getByRole('searchbox')).toHaveValue('샛터코아');
  await expect(page.locator('.page-heading')).toContainText('23:59');
  await expect(page.locator('.trip-card')).toHaveCount(3);
  await expect(page.locator('.trip-card').filter({ hasText: '진월③' })).toContainText('15:30');
  const fifth = page.locator('.trip-card').filter({ hasText: '진월⑤' });
  await expect(fifth).not.toContainText('기본 운행요일 미확인');
  await fifth.click();
  await expect(page.locator('.detail-facts')).toContainText('18:20');
  await expect(page.locator('.detail-facts')).toContainText('MNU 스퀘어 앞');
  await expect(page.locator('.detail-facts')).toContainText('도착 시각은 시간표에 없어요.');
  await expect(page.locator('.location-panel')).toContainText('정확한 하차 위치는 확인되지 않았어요.');
  await page.getByRole('link', { name: '← 장소 검색 결과로' }).click();
  await expect(stop).toBeFocused();
  await expect(page.locator('.selected-place h3')).toContainText('합성 시험 장소');
  await expect(page.getByLabel('학교에서 출발할 수 있는 시각')).toHaveValue('23:59');
  await expect(list).toContainText('현재 비교 가능한 거리 후보는 0개입니다.');
  await expect(page.getByRole('combobox', { name: '이용 요일' })).toHaveValue('FRI');
});

test('빌드 자산·첫 진입·직접 진입·새로고침·선택 화면 지연 로딩', async ({ page }) => {
  await sdkBoundary(page);
  const scripts: string[] = [], errors: string[] = [];
  page.on('request', request => { if (new URL(request.url()).pathname.endsWith('.js')) scripts.push(new URL(request.url()).pathname); });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('아는 장소로 찾는');
  expect(scripts.some(path => path.startsWith('/assets/'))).toBe(true);
  expect(scripts.some(path => path.includes('/src/') || path.includes('@vite'))).toBe(false);
  expect(scripts.some(path => /AsIsView|EvaluationPanel/.test(path))).toBe(false);
  for (const [hash, title] of [['/asis', '통학버스 노선정보'], ['/evaluation', '탐색 방식 비교 평가'], ['/routes/fromCampus', '노선 목록']]) {
    await page.goto(`/#${hash}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
  }
  expect(scripts.some(path => /AsIsView/.test(path))).toBe(true);
  expect(scripts.some(path => /EvaluationPanel/.test(path))).toBe(true);
  expect(errors).toEqual([]);
});

test('같은 38편 양방향 목록·금요일 대체·학교 위치·키보드 이동', async ({ page }) => {
  await sdkBoundary(page);
  for (const direction of ['toCampus', 'fromCampus']) {
    await page.goto(`/#/routes/${direction}`);
    await expect(page.locator('.trip-card')).toHaveCount(5);
    for (const remaining of [14, 9, 4]) await page.getByRole('button', { name: `운행편 더 보기 · ${remaining}편 남음` }).click();
    await expect(page.locator('.trip-card')).toHaveCount(19);
    await page.goto(`/#/asis/routes/${direction}`);
    await expect(page.locator('.asis-route-list>li')).toHaveCount(19);
  }
  await page.goto('/#/asis/trip/tp-s25-from-jinwol-03');
  await page.getByLabel('As-is 확인할 요일').selectOption('FRI');
  await expect(page.locator('.asis-trip-facts')).toContainText('15:30');
  await expect(page.locator('.asis-trip-facts')).toContainText('MNU 스퀘어 앞');
  await expect(page.locator('.asis-trip-facts')).toContainText('추가 편이 아닙니다');
  await page.goto('/#/routes/fromCampus');
  await page.getByRole('combobox', { name: '이용 요일', exact: true }).selectOption('FRI');
  await page.locator('.list-filter input').fill('송정①');
  await expect(page.locator('.trip-card .list-conflict')).toBeVisible();
  await expect(page.locator('.trip-card .list-conflict')).toContainText('선택 요일 운행 안 함');
  await page.locator('.trip-card').click();
  await expect(page.locator('.condition-mismatch')).toBeVisible();
  await page.goto('/#/asis');
  await page.getByRole('link', { name: '하교 노선 보기 도림캠퍼스 → 광주' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('하교 노선 목록');
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
});

test('프로덕션 SDK 경계: 거리·시간정렬·상세 왕복·상태·지도 실패 텍스트', async ({ page }, info) => {
  await sdkBoundary(page); await search(page);
  const distances = await page.locator('.candidate-card').evaluateAll(nodes => nodes.map(node => Number((node as HTMLElement).dataset.distanceMeters)));
  expect(distances).toEqual([...distances].sort((a,b)=>a-b));
  await page.locator('.candidate-map-disclosure>summary').click();
  await expect(page.getByText('지도를 표시하지 못했습니다. 위치 텍스트와 후보 목록을 확인해 주세요.', { exact: true })).toBeVisible();
  if (!(await page.locator('.time-options').getAttribute('open') === '')) await page.locator('.time-options summary').click();
  await page.getByLabel('비교할 직선거리 반경').selectOption('5000');
  await page.getByLabel('표시할 정류장 수').selectOption('5');
  await page.getByLabel('후보 정렬').selectOption('time');
  if (!(await page.locator('.time-options').getAttribute('open') === '')) await page.locator('.time-options summary').click();
  await page.getByLabel('학교에서 출발할 수 있는 시각').fill('16:00');
  const firstTimes = await page.locator('.candidate-card').evaluateAll(cards => cards.map(card => card.querySelector('.candidate-time strong')?.textContent || ''));
  expect(firstTimes.length).toBeGreaterThan(0);
  expect(firstTimes).toEqual([...firstTimes].sort());
  const evidence = page.locator('.candidate-card').first().locator('.candidate-evidence');
  await evidence.locator('summary').click();
  const button = page.getByRole('button', { name: '지도에서 1번 기준점 보기', exact: true });
  await button.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#candidate-map h4')).toBeFocused();
  await page.getByRole('button', { name: '하차 후보 목록으로', exact: true }).click();
  await expect(button).toBeFocused();
  await expect(evidence).toHaveAttribute('open', '');
  await page.locator('.candidate-detail-link').first().click();
  await expect(page.locator('.stop-timeline li.is-selected')).toHaveCount(1);
  await page.getByRole('link', { name: '← 장소 검색 결과로', exact: true }).click();
  await expect(page.locator('#place-query')).toHaveValue('합성 시험');
  await expect(page.getByLabel('이용 요일')).toHaveValue('MON');
  await expect(page.getByLabel('학교에서 출발할 수 있는 시각')).toHaveValue('16:00');
  await expect(page.getByLabel('비교할 직선거리 반경')).toHaveValue('5000');
  await expect(page.getByLabel('표시할 정류장 수')).toHaveValue('5');
  await expect(page.getByLabel('후보 정렬')).toHaveValue('time');
  await page.screenshot({ path: `${out}/${info.project.name}-candidates.png`, fullPage: true });
});

test('금요일 16시 이후 동신고의 진월⑤를 장소 검색에서 바로 찾고 같은 지점으로 돌아온다', async ({ page }) => {
  await sdkBoundary(page); await search(page);
  if (!(await page.locator('.time-options').getAttribute('open') === '')) await page.locator('.time-options summary').click();
  await page.getByLabel('학교에서 출발할 수 있는 시각').fill('16:00');
  await expect(page.locator('.candidate-relations article[data-trip-id="tp-s25-from-jinwol-03"]').first()).toBeVisible();
  await page.getByLabel('이용 요일').selectOption('FRI');
  await expect(page.locator('.candidate-relations article[data-trip-id="tp-s25-from-jinwol-01"]')).toHaveCount(0);
  await expect(page.locator('.candidate-relations article[data-trip-id="tp-s25-from-jinwol-03"]')).toHaveCount(0);
  const fifth = page.locator('.candidate-card').filter({ has: page.getByRole('heading', { name: /동신고/ }) })
    .locator('article[data-trip-id="tp-s25-from-jinwol-05"]');
  await expect(fifth).toContainText('18:20');
  await expect(fifth.locator('..').locator('..')).toContainText('정확한 하차 위치는 확인되지 않았어요.');
  await fifth.locator('.candidate-detail-link').click();
  await expect(page.locator('.detail-facts')).toContainText('18:20');
  await expect(page.locator('.stop-timeline li.is-selected')).toContainText('동신고');
  await page.getByRole('link', { name: '← 장소 검색 결과로' }).click();
  await expect(fifth.locator('.candidate-detail-link')).toBeFocused();
  await expect(page.getByLabel('학교에서 출발할 수 있는 시각')).toHaveValue('16:00');
});

test('등교 승차시각 이후 필터와 실제 운행 미확정 표시', async ({ page }) => {
  await sdkBoundary(page, 'toCampus'); await search(page, 'toCampus');
  if (!(await page.locator('.time-options').getAttribute('open') === '')) await page.locator('.time-options summary').click();
  await page.getByLabel('비교할 직선거리 반경').selectOption('5000');
  if (!(await page.locator('.time-options').getAttribute('open') === '')) await page.locator('.time-options summary').click();
  await page.getByLabel('정류장에서 승차할 시각').fill('07:15');
  await page.getByLabel('후보 정렬').selectOption('time');
  const times = await page.locator('.candidate-time strong').allTextContents();
  expect(times.length).toBeGreaterThan(0);
  for (const time of times) expect(time >= '07:15').toBe(true);
  await expect(page.locator('.comparison-footnote')).toContainText('변경될 수 있어요');
  await expect(page.getByRole('region', { name: '참고 후보', exact: true })).toContainText('실제 도로변 위치 확인 필요');
});

test('주소검색·빈 결과·통신 실패 후 재검색·목록 대안', async ({ page }) => {
  await sdkBoundary(page); await page.goto('/');
  await page.getByRole('button', { name: '주소', exact: true }).click();
  await page.locator('#place-query').fill('합성 주소');
  await page.getByRole('button', { name: '장소 검색', exact: true }).click();
  await expect(page.locator('.place-results button')).toHaveCount(1);
  expect(await page.evaluate(() => (window as unknown as { __rc1Calls: string[] }).__rc1Calls)).toEqual(['address']);
  await page.locator('#place-query').fill('빈결과');
  await page.getByRole('button', { name: '장소 검색', exact: true }).click();
  await expect(page.getByText('검색 결과가 없습니다.', { exact: true })).toBeVisible();
  await page.locator('#place-query').fill('오류');
  await page.getByRole('button', { name: '장소 검색', exact: true }).click();
  await expect(page.getByText('장소 검색에 실패했습니다. 잠시 뒤 재시도하거나 주소 검색을 이용해 주세요.', { exact: true })).toBeVisible();
  await page.locator('#place-query').fill('합성 재시도');
  await page.getByRole('button', { name: '장소 검색', exact: true }).click();
  await expect(page.locator('.place-results button')).toHaveCount(1);
  await page.getByRole('navigation', { name: '주요 메뉴' }).getByRole('link', { name: '노선 목록', exact: true }).click();
  await expect(page.locator('.trip-card')).toHaveCount(5);
    for (const remaining of [14, 9, 4]) await page.getByRole('button', { name: `운행편 더 보기 · ${remaining}편 남음` }).click();
    await expect(page.locator('.trip-card')).toHaveCount(19);
});

test('빌드 평가 화면 시작·종료·리허설JSON·삭제·새로고침', async ({ page }, info) => {
  await sdkBoundary(page); await page.goto('/#/evaluation');
  await expect(page.getByLabel('기록 종류')).toHaveValue('rehearsal');
  await expect(page.getByRole('button', { name: '과업 시작', exact: true })).toBeDisabled();
  await page.getByLabel('비교 방식').selectOption('tobe');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: '과업 시작', exact: true }).click();
  await expect(page.getByText('탐색 시작 대기 · 0초', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: '선택한 방식으로 탐색 시작', exact: true }).click();
  await expect(page.locator('#place-query')).toHaveValue('');
  await page.getByRole('button', { name: '답변 완료 · 시간 정지', exact: true }).click();
  await page.getByRole('link', { name: '판정 / 중단', exact: true }).click();
  await page.getByRole('combobox', { name: '관찰자 기준 판정', exact: true }).selectOption('partial');
  await page.getByRole('button', { name: '답변 완료 · 기록 종료', exact: true }).click();
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: '결과 JSON 내보내기', exact: true }).click();
  const download = await waiting;
  await download.saveAs(`${out}/${info.project.name}-rehearsal.json`);
  const stream = await download.createReadStream(); let json = '';
  for await (const chunk of stream!) json += chunk.toString();
  const saved = JSON.parse(json);
  expect(saved.schemaVersion).toBe('mnu-hci-evaluation.2');
  expect(saved.records).toHaveLength(1);
  expect(saved.records[0]).toMatchObject({ recordKind: 'rehearsal', mode: 'tobe', status: 'completed', observerOutcome: 'partial', timingStarted: true });
  await page.getByRole('button', { name: '전체 기록 삭제 · 동의 철회', exact: true }).click();
  await expect(page.getByRole('heading', { name: '3. 이 탭의 결과 0건' })).toBeVisible();
  await expect(page.getByRole('checkbox')).not.toBeChecked();
  await expect(page.getByRole('button', { name: '결과 JSON 내보내기', exact: true })).toBeDisabled();
  await page.reload();
  await expect(page.getByRole('heading', { name: '3. 이 탭의 결과 0건' })).toBeVisible();
});

test('선택청크 통신 실패 복구·주요화면 접근성·모바일 리플로우', async ({ page }, info) => {
  await sdkBoundary(page);
  await page.route(/\/assets\/(AsIsView|EvaluationPanel)-[^/]+\.js$/, route => route.abort('failed'));
  for (const hash of ['/asis', '/evaluation']) {
    await page.goto(`/#${hash}`);
    await expect(page.getByRole('heading', { name: '화면을 불러오지 못했어요.', exact: true })).toBeVisible();
    await page.getByRole('link', { name: '기본 탐색으로 돌아가기', exact: true }).click();
    await expect(page.locator('#place-query')).toBeVisible();
  }
  await page.unroute(/\/assets\/(AsIsView|EvaluationPanel)-[^/]+\.js$/);
  for (const hash of ['', '/asis', '/evaluation', '/routes/fromCampus']) {
    await page.goto(`/#${hash}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const scan = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
    expect(scan.violations.map(item => item.id), hash).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), hash).toBe(true);
  }
  await page.screenshot({ path: `${out}/${info.project.name}-list.png`, fullPage: true });
});
