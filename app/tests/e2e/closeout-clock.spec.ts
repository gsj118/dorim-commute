import { expect, test } from '@playwright/test';

test('요일 미선택의 하교 결과는 기본과 금요일 대체를 함께, 대체 없는 편은 그대로 보여준다', async ({ page }) => {
  await page.goto('/#/routes/fromCampus');
  const query = page.getByRole('searchbox');
  await query.fill('서광주우체국');
  const cards = page.locator('.trip-card');
  await expect(cards).toHaveCount(2);
  const third = cards.filter({ hasText: '송정③' });
  await expect(third).toContainText('기본 17:30');
  await expect(third).toContainText('금요일 15:30 대체');
  const seventh = cards.filter({ hasText: '송정⑦' });
  await expect(seventh).toContainText('18:20');
  await expect(seventh).not.toContainText('대체');
  await query.fill('송정 3');
  await expect(third).toContainText('금요일 15:30 대체');
  await page.getByRole('combobox', { name: '이용 요일' }).selectOption('FRI');
  await expect(third).toContainText('15:30');
  await expect(third).not.toContainText('17:30');
  await third.click();
  await page.reload();
  await expect(page.getByLabel('확인할 요일')).toHaveValue('FRI');
  await expect(page.locator('.detail-facts')).toContainText('15:30');
  await expect(page.getByRole('button', { name: /MNU 스퀘어 앞/ })).toContainText('15:30');
  await page.getByLabel('확인할 요일').selectOption('MON');
  await page.reload();
  await expect(page.locator('.detail-facts')).toContainText('17:30');
  await expect(page.getByLabel('확인할 요일')).toHaveValue('MON');
});

test('등교 상세에서 바꾼 승차 지점은 새로고침 뒤 요약·경유표·지도 이름이 모두 일치한다', async ({ page }) => {
  await page.goto('/#/routes/toCampus');
  await page.getByRole('searchbox').fill('서광주우체국');
  await page.locator('.trip-card').filter({ hasText: '송정①' }).click();
  await expect(page.locator('.detail-facts')).toContainText('07:14');
  await page.getByRole('button', { name: /염주체육관.*육교/ }).click();
  await page.reload();
  await expect(page.locator('.detail-facts')).toContainText('07:10');
  const stop = page.getByRole('button', { name: /염주체육관.*육교/ });
  await expect(stop).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.location-panel h2')).toContainText('염주체육관');
  await stop.click();
  await page.reload();
  await expect(page.locator('.detail-facts')).toContainText('첫 승차 지점 시각');
  await expect(page.locator('.stop-timeline button[aria-expanded="true"]')).toHaveCount(0);
});
