import { expect, test, type Page } from '@playwright/test';

async function openList(page: Page, direction: '등교' | '하교') {
  await page.goto('/');
  await page.getByRole('button', { name: new RegExp(direction + ' 노선') }).click();
  await expect(page.getByRole('heading', { name: '노선 목록', exact: true })).toBeVisible();
}

function tripCard(page: Page, name: string) {
  return page.locator('.trip-card').filter({ has: page.getByText(name, { exact: true }) });
}

test('등교 중간 정류장의 두 승차 시각을 카드에서 비교하고 같은 지점으로 상세를 연다', async ({ page }) => {
  await openList(page, '등교');
  await page.getByRole('combobox', { name: '이용 요일' }).selectOption('MON');
  const query = page.getByRole('searchbox');
  await query.fill('추선회관');
  await expect(page.locator('.trip-card')).toHaveCount(2);
  await expect(tripCard(page, '송정③')).toContainText('07:10');
  const fourth = tripCard(page, '송정④');
  await expect(fourth).toContainText('추선회관');
  await expect(fourth).toContainText('07:15');
  await fourth.click();
  await expect(page.locator('.detail-facts')).toContainText('추선회관');
  await expect(page.locator('.detail-facts')).toContainText('07:15');
  await expect(page.getByRole('button', { name: /추선회관/ })).toHaveAttribute('aria-expanded', 'true');

  await page.getByRole('button', { name: '등교 목록으로' }).click();
  await expect(query).toHaveValue('추선회관');
  await tripCard(page, '송정③').click();
  await expect(page.locator('.detail-facts')).toContainText('07:10');
  await expect(page.getByRole('button', { name: /추선회관/ })).toHaveAttribute('aria-expanded', 'true');
});

test('하교 검색의 공백을 바꿔도 늦은 편을 포함하며, 하차지 상세에는 금요일 학교 출발을 표시한다', async ({ page }) => {
  await openList(page, '하교');
  await page.getByRole('combobox', { name: '이용 요일' }).selectOption('FRI');
  const query = page.getByRole('searchbox');
  for (const word of ['문흥동 샛터코아', '문흥동샛터코아', '샛터코아']) {
    await query.fill(word);
    await expect(page.locator('.trip-card')).toHaveCount(3);
    await expect(tripCard(page, '진월①')).toContainText('선택 요일 운행 안 함');
    await expect(tripCard(page, '진월③')).toContainText('15:30');
    await expect(tripCard(page, '진월⑤')).toContainText('18:20');
  }

  const third = tripCard(page, '진월③');
  const school = third.locator('.matched-departure');
  await expect(school).toContainText('학교 출발');
  await expect(school).toContainText('MNU 스퀘어 앞');
  await expect(school).toContainText('15:30');
  await expect(school).toContainText('금요일 대체');
  const destination = third.locator('.matched-stop');
  await expect(destination).toContainText(/문흥동\s*샛터코아/);
  await expect(destination).toContainText('하차');
  await expect(destination).toContainText('도착 시각 미제공');
  await third.click();
  const facts = page.locator('.detail-facts');
  await expect(facts).toContainText('학교 출발');
  await expect(facts).toContainText('15:30');
  await expect(facts).toContainText('MNU 스퀘어 앞');
  const dropOff = page.getByRole('button', { name: /문흥동\s*샛터코아/ });
  await expect(dropOff).toHaveAttribute('aria-expanded', 'true');
  await expect(dropOff).toContainText('하차');
  await expect(dropOff).toContainText(/도착 시각\s*시간표에 없음/);
});

test('학교 승차 위치로 찾은 하교편에 학교 출발 정보를 간결하게 표시한다', async ({ page }) => {
  await openList(page, '하교');
  await page.getByRole('combobox', { name: '이용 요일' }).selectOption('FRI');
  await page.getByRole('searchbox').fill('MNU 스퀘어 앞');
  const second = tripCard(page, '송정②');
  const departure = second.locator('.matched-departure');
  await expect(departure).toContainText('학교 출발');
  await expect(departure).toContainText('MNU 스퀘어 앞');
  await expect(departure).toContainText('16:30');
  await expect(second).not.toContainText('기본 운행요일 미확인');
  await expect(departure).not.toContainText('이용 판단 보류');
  await expect(second).toContainText('용두주공');
});

test('미확정 효천역 승차 시각 대신 학교 확인 안내를 표시한다', async ({ page }) => {
  await openList(page, '등교');
  await page.getByRole('combobox', { name: '이용 요일' }).selectOption('MON');
  await page.getByRole('searchbox').fill('효천역승강장');
  const more = page.getByRole('button', { name: '운행편 더 보기 · 1편 남음' });
  await more.focus();
  await page.keyboard.press('Enter');
  const eighth = tripCard(page, '진월⑧');
  await expect(eighth).toBeFocused();
  await expect(more).toHaveCount(0);
  const matchedStop = eighth.locator('.matched-stop');
  await expect(matchedStop).not.toContainText('09:32');
  await expect(matchedStop).toContainText('학교 확인 필요');
  await eighth.click();
  const timing = page.locator('.detail-facts > div').filter({ hasText: '이 정류장에서 타는 시각' });
  await expect(timing).toContainText('효천역승강장');
  await expect(timing).toContainText('시각 미확인');
  await expect(page.locator('.detail-facts + .inline-notice')).toContainText('효천역승강장에서 탈 수 있는지');
});

test('같은 편의 두 정류장이 부분 일치하면 직접 고른 지점의 시각으로 상세를 연다', async ({ page }) => {
  await openList(page, '등교');
  await page.getByRole('combobox', { name: '이용 요일' }).selectOption('MON');
  await page.getByRole('searchbox').fill('운남주공');
  const eleventh = tripCard(page, '송정⑪');
  const firstComplex = eleventh.getByRole('button', { name: /운남주공1단지육교/ });
  const fifthComplex = eleventh.getByRole('button', { name: /운남주공5단지육교/ });
  await expect(firstComplex).toContainText('09:29');
  await expect(fifthComplex).toContainText('09:30');
  await fifthComplex.click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('송정⑪');
  const facts = page.locator('.detail-facts');
  await expect(facts).toContainText('운남주공5단지육교');
  await expect(facts).toContainText('09:30');
  await expect(page.getByRole('button', { name: /운남주공5단지육교/ })).toHaveAttribute('aria-expanded', 'true');
});

test('편 번호를 일반 숫자로 입력해도 일치하고 1번과 10·11번을 구분한다', async ({ page }) => {
  await openList(page, '등교');
  const query = page.getByRole('searchbox');
  for (const [word, expected] of [
    ['진월③', '진월③'], ['진월3', '진월③'], ['진월 3', '진월③'],
    ['송정1', '송정①'], ['송정 10', '송정⑩'], ['송정11', '송정⑪'],
  ]) {
    await query.fill(word);
    await expect(page.locator('.trip-card')).toHaveCount(1);
    await expect(tripCard(page, expected)).toBeVisible();
  }
  await tripCard(page, '송정⑪').click();
  await expect(page.locator('.detail-facts')).toContainText('첫 승차 지점');
  await expect(page.locator('.detail-facts')).toContainText('남부대정문');
});
