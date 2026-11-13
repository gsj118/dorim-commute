const evidenceDir = process.env.E2E_EVIDENCE_DIR || 'artifacts/e2e';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import raw from '../../src/data/routes.json' with { type: 'json' };

test('As-is 두 방향 전체 수록 동일 자료와 시각 대체, 모드 왕복', async ({ page }) => {
  await page.route('**/src/providers/kakao.ts*', route => route.fulfill({ contentType: 'application/javascript', body: 'export const isKakaoConfigured=()=>false;export const loadKakao=()=>Promise.reject();export const placeProvider={search:async()=>({items:[],hasNext:false,page:1})};' }));
  for (const direction of ['toCampus', 'fromCampus']) {
    await page.goto(`/#/asis/routes/${direction}`);
    const trips = raw.trips.filter(trip => trip.direction === direction);
    await expect(page.locator('.asis-route-list>li')).toHaveCount(trips.length);
    for (const trip of trips) {
      await page.goto(`/#/asis/trip/${trip.tripId}`);
      await expect(page.locator('.asis-stop-list>li')).toHaveCount(raw.occurrences.filter(item => item.tripId === trip.tripId).length);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(trip.displayName);
    }
  }
  await page.goto('/#/asis/trip/tp-s25-from-jinwol-03');
  await page.getByLabel('As-is 확인할 요일').selectOption('FRI');
  await expect(page.locator('.asis-trip-facts')).toContainText('15:30');
  await expect(page.locator('.asis-trip-facts')).toContainText('MNU 스퀘어 앞');
  await expect(page.locator('.asis-trip-facts')).toContainText('추가 편이 아닙니다');
  await page.locator('.comparison-tools>summary').click();
  await page.getByRole('link', { name: 'To-be · 장소로 찾기', exact: true }).click();
  await expect(page.getByLabel('이용 요일')).toHaveValue('FRI');
  await page.locator('.comparison-tools>summary').click();
  await page.getByRole('link', { name: 'As-is · 목록으로 찾기', exact: true }).click();
  await expect(page.getByLabel('As-is 확인할 요일')).toHaveValue('FRI');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('진월③');
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('아는 장소로 찾는');
});

test('기준·평가 주요 화면 접근성·키보드·동일 뷰포트 캡처', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/src/providers/kakao.ts*', route => route.fulfill({ contentType: 'application/javascript', body: 'export const isKakaoConfigured=()=>false;export const loadKakao=()=>Promise.reject();export const placeProvider={search:async()=>({items:[],hasNext:false,page:1})};' }));
  for (const [name, hash] of [['asis-home', '/asis'], ['asis-routes', '/asis/routes/fromCampus'], ['asis-trip', '/asis/trip/tp-s25-from-jinwol-03'], ['evaluation', '/evaluation'], ['routes', '/routes/fromCampus']]) {
    await page.goto(`/#${hash}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(scan.violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) })), hash).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), hash).toBe(true);
    await page.screenshot({ path: `${evidenceDir}/after-${testInfo.project.name}-${name}.png`, fullPage: true });
  }
  await page.goto('/#/asis');
  await page.getByRole('link', { name: '하교 노선 보기 도림캠퍼스 → 광주' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('하교 노선 목록');
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  await page.goto('/#/asis/trip/%E0%A4%A');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('수록되지 않은 운행편');
  expect(errors).toEqual([]);
});

test('동의·평가 초기화·최종답변 정지·관찰 분리·JSON·혼합/중단·철회', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: '하교 학교 → 광주', exact: true }).click();
  await page.getByLabel('이용 요일').selectOption('FRI');
  await page.locator('#place-query').fill('저장하지않는시험검색어');
  await page.locator('.comparison-tools>summary').click();
  await page.getByRole('link', { name: '사용성 평가 도구', exact: true }).click();
  await expect(page.getByRole('button', { name: '과업 시작', exact: true })).toBeDisabled();
  await page.getByLabel('비교 방식').selectOption('tobe');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: '과업 시작', exact: true }).click();
  await page.getByRole('link', { name: '선택한 방식으로 탐색 시작', exact: true }).click();
  await expect(page.locator('#place-query')).toHaveValue('');
  await expect(page.getByLabel('이용 요일')).toHaveValue('');
  await expect(page.getByRole('button', { name: '등교 광주 → 학교', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '하교 학교 → 광주', exact: true }).click();
  const dockScan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(dockScan.violations.map(v => v.id)).toEqual([]);
  await page.screenshot({ path: `${evidenceDir}/evaluation-active-${testInfo.project.name}.png` });
  await page.getByRole('button', { name: '답변 완료 · 시간 정지', exact: true }).click();
  await page.getByRole('link', { name: '판정 / 중단', exact: true }).click();
  await page.getByLabel('참여자 자기판정').selectOption('partial');
  await page.getByLabel('관찰자 기준 판정').selectOption('success');
  await page.getByLabel('남은 불확실성').selectOption('operation');
  await page.getByLabel('주관적 사용 편의성').selectOption('5');
  await page.getByRole('button', { name: '잘못된 선택 +1 1회 추가', exact: true }).click();
  await page.getByRole('button', { name: '답변 완료 · 기록 종료', exact: true }).click();
  await expect(page.getByRole('heading', { name: '3. 이 탭의 결과 1건' })).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '결과 JSON 내보내기', exact: true }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  let downloadedJson = '';
  for await (const chunk of stream!) downloadedJson += chunk.toString();
  const saved = JSON.parse(downloadedJson);
  expect(saved.records).toHaveLength(1);
  expect(saved.records[0]).toMatchObject({ recordKind: 'rehearsal', consent: true, mode: 'tobe', comparable: true, selfOutcome: 'partial', observerOutcome: 'success', wrongSelections: 1, ease: 5 });
  expect(saved.records[0].elapsedMs).toBeGreaterThan(0);
  expect(JSON.stringify(saved)).not.toContain('저장하지않는시험검색어');
  await page.getByLabel('비교 방식').selectOption('asis');
  await page.getByRole('button', { name: '과업 시작', exact: true }).click();
  await page.getByRole('link', { name: '선택한 방식으로 탐색 시작', exact: true }).click();
  await page.locator('.comparison-tools>summary').click();
  await page.getByRole('link', { name: 'To-be · 장소로 찾기', exact: true }).click();
  await page.getByRole('link', { name: '판정 / 중단', exact: true }).click();
  await page.getByLabel('중단 사유').selectOption('providerFailure');
  await page.getByRole('button', { name: '과업 중단 기록', exact: true }).click();
  await expect(page.locator('.evaluation-results')).toContainText('혼합 방식 이동');
  const finalScan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(finalScan.violations.map(v => ({ id: v.id, nodes: v.nodes.map(node => ({ target: node.target, issue: node.failureSummary })) }))).toEqual([]);
  await page.getByRole('heading', { name: '3. 이 탭의 결과 2건' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${evidenceDir}/evaluation-rehearsal-${testInfo.project.name}.png` });
  await page.getByRole('button', { name: '전체 기록 삭제 · 동의 철회', exact: true }).click();
  await expect(page.getByRole('heading', { name: '3. 이 탭의 결과 0건' })).toBeVisible();
  await expect(page.getByRole('checkbox')).not.toBeChecked();
});

test('비교·평가 화면 지연로딩 실패에서 기본 탐색으로 복구', async ({ page }) => {
  await page.route(/\/src\/components\/(AsIsView|EvaluationPanel)\.tsx/, route => route.abort('failed'));
  for (const hash of ['/asis', '/evaluation']) {
    await page.goto(`/#${hash}`);
    await expect(page.getByRole('heading', { name: '화면을 불러오지 못했어요.', exact: true })).toBeVisible();
    await page.getByRole('link', { name: '기본 탐색으로 돌아가기', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('아는 장소로 찾는');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.locator('#place-query')).toBeVisible();
  }
});
