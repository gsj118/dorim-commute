const evidenceDir = process.env.E2E_EVIDENCE_DIR || 'artifacts/e2e';
import { test, expect, type Page } from '@playwright/test';

// Every saved record in this file is explicitly an automated rehearsal, never a human result.
async function prepare(page: Page, mode = 'tobe') {
  await page.goto('/#/evaluation');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('탐색 방식 비교 평가');
  await expect(page.getByLabel('기록 종류')).toHaveValue('rehearsal');
  await page.getByLabel('비교 방식').selectOption(mode);
  await page.getByRole('checkbox').check();
}
async function exported(page: Page, path?: string) {
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: '결과 JSON 내보내기', exact: true }).click();
  const download = await waiting;
  if (path) await download.saveAs(path);
  const stream = await download.createReadStream();
  let json = '';
  for await (const chunk of stream!) json += chunk.toString();
  return JSON.parse(json);
}

test('평가 준비 지연과 판정 입력을 제외하고 탐색 링크부터 단조시간을 측정', async ({ page }, testInfo) => {
  await prepare(page);
  await page.getByRole('button', { name: '과업 시작', exact: true }).click();
  await page.waitForTimeout(700); // Controlled preparation delay, not a human task time.
  await expect(page.getByText('탐색 시작 대기 · 0초', { exact: true })).toBeVisible();
  await page.evaluate(() => document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('.evaluation-running>a')) document.documentElement.dataset.testStart = String(performance.now());
    if (target?.closest('.evaluation-dock button')) document.documentElement.dataset.testEnd = String(performance.now());
  }, true));
  await page.getByRole('link', { name: '선택한 방식으로 탐색 시작', exact: true }).click();
  await expect(page.locator('#place-query')).toBeVisible();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: '답변 완료 · 시간 정지', exact: true }).click();
  const boundaryDuration = await page.evaluate(() => Number(document.documentElement.dataset.testEnd) - Number(document.documentElement.dataset.testStart));
  await page.waitForTimeout(700); // Judgment delay must not change frozen duration.
  await page.getByRole('link', { name: '판정 / 중단', exact: true }).click();
  await page.getByRole('combobox', { name: '관찰자 기준 판정', exact: true }).selectOption('partial');
  await page.getByRole('button', { name: '답변 완료 · 기록 종료', exact: true }).click();
  const saved = await exported(page, `${evidenceDir}/evaluation-${testInfo.project.name}-timing.json`);
  expect(saved.records).toHaveLength(1);
  expect(saved.records[0].elapsedMs).toBeGreaterThanOrEqual(300);
  expect(Math.abs(saved.records[0].elapsedMs - boundaryDuration)).toBeLessThan(20);
  expect(saved.records[0]).toMatchObject({ recordKind: 'rehearsal', mode: 'tobe', status: 'completed', sequence: 1, comparable: true, observerOutcome: 'partial', selfOutcome: 'pending', ease: null });
  await page.screenshot({ path: `${evidenceDir}/evaluation-${testInfo.project.name}-timing.png`, fullPage: true });
});

test('준비 취소·재시작 사유 초기화·순서·혼합 방식과 미판정을 구분', async ({ page }, testInfo) => {
  await prepare(page, 'asis');
  await page.getByRole('button', { name: '과업 시작', exact: true }).click();
  await expect(page.getByRole('button', { name: '탐색 종료 · 시간 멈추기', exact: true })).toBeDisabled();
  await page.getByLabel('중단 사유').selectOption('providerFailure');
  await page.getByRole('button', { name: '과업 중단 기록', exact: true }).click();
  await page.getByRole('button', { name: '과업 시작', exact: true }).click();
  await expect(page.getByLabel('중단 사유')).toHaveValue('participantStop');
  await page.getByRole('link', { name: '선택한 방식으로 탐색 시작', exact: true }).click();
  await page.locator('.comparison-tools>summary').click();
  await page.getByRole('link', { name: 'To-be · 장소로 찾기', exact: true }).click();
  await page.getByRole('button', { name: '답변 완료 · 시간 정지', exact: true }).click();
  await page.getByRole('link', { name: '판정 / 중단', exact: true }).click();
  await page.getByRole('button', { name: '답변 완료 · 기록 종료', exact: true }).click();
  const saved = await exported(page, `${evidenceDir}/evaluation-${testInfo.project.name}-restart.json`);
  expect(saved.records).toHaveLength(2);
  expect(saved.records[0]).toMatchObject({ sequence: 1, status: 'aborted', elapsedMs: 0, abortReason: 'providerFailure', comparable: false, recordKind: 'rehearsal' });
  expect(saved.records[1]).toMatchObject({ sequence: 2, status: 'completed', abortReason: 'none', mode: 'asis', observerOutcome: 'pending', comparable: false, recordKind: 'rehearsal' });
  expect(saved.records[1].modeDeviations).toBeGreaterThan(0);
});

test('중단 기록 후 동의 철회·새 시행·새로고침은 탭 메모리만 초기화', async ({ page }, testInfo) => {
  await prepare(page);
  await page.getByRole('button', { name: '과업 시작', exact: true }).click();
  await page.getByRole('link', { name: '선택한 방식으로 탐색 시작', exact: true }).click();
  await page.getByRole('link', { name: '판정 / 중단', exact: true }).click();
  await page.getByRole('button', { name: '과업 중단 기록', exact: true }).click();
  const original = await exported(page);
  expect(original.records).toHaveLength(1);
  await page.getByRole('button', { name: '전체 기록 삭제 · 동의 철회', exact: true }).click();
  await expect(page.getByRole('heading', { name: '3. 이 탭의 결과 0건' })).toBeVisible();
  await expect(page.getByRole('checkbox')).not.toBeChecked();
  await expect(page.getByRole('button', { name: '결과 JSON 내보내기', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '과업 시작', exact: true })).toBeDisabled();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: '과업 시작', exact: true }).click();
  await page.getByRole('button', { name: '과업 중단 기록', exact: true }).click();
  const next = await exported(page, `${evidenceDir}/evaluation-${testInfo.project.name}-withdrawal.json`);
  expect(next.sessionId).not.toBe(original.sessionId);
  expect(next.records).toHaveLength(1);
  expect(next.records[0]).toMatchObject({ sequence: 1, recordKind: 'rehearsal', elapsedMs: 0, comparable: false });
  await page.reload();
  await expect(page.getByRole('heading', { name: '3. 이 탭의 결과 0건' })).toBeVisible();
  await expect(page.getByRole('checkbox')).not.toBeChecked();
  await expect(page.getByRole('button', { name: '결과 JSON 내보내기', exact: true })).toBeDisabled();
});


test('As-is 전역 목록·홈은 현재 방식과 운행편 방향을 유지', async ({ page }) => {
  await page.goto('/#/routes/fromCampus');
  await page.evaluate(() => { window.location.hash = '#/asis/trip/tp-s25-to-songjeong-06'; });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('송정⑥');
  await page.getByRole('navigation', { name: '주요 메뉴' }).getByRole('link', { name: '노선 목록', exact: true }).click();
  await expect(page).toHaveURL(/#\/asis\/routes\/toCampus$/);
  await expect(page.locator('.asis-route-list>li')).toHaveCount(19);
  await page.getByRole('navigation', { name: '주요 메뉴' }).getByRole('link', { name: '홈', exact: true }).click();
  await expect(page).toHaveURL(/#\/asis$/);
});
