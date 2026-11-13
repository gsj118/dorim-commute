import { expect, test } from '@playwright/test';

test('화정동 비교에서 공식 자료와 금요일 하교 두 경로를 연다', async ({ page }) => {
  await page.goto('/#/');
  await page.getByRole('link', { name: '화정동 하교 예시로 두 방식 비교' }).click();
  const comparison = page.locator('.submission-comparison');
  await expect(comparison.getByRole('heading', { level: 1 })).toContainText('유니버시아드 힐스테이트 2단지');
  const unibus = comparison.getByRole('link', { name: /공식 Unibus 열기/ });
  await expect(unibus).toHaveAttribute('href', 'https://mokpo.unibus.kr/#!/index');
  await expect(unibus).toHaveAttribute('target', '_blank');
  await expect(comparison.getByRole('heading', { name: '광주권 하교 노선표 전체' })).toBeVisible();
  await comparison.getByRole('button', { name: '전체 노선표 보기' }).click();
  await expect(comparison.getByRole('heading', { name: '광주권 하교 노선표 전체' })).toBeFocused();
  const enlarge = comparison.getByRole('link', { name: /광주권 하교 노선표 크게 보기/ });
  const popup = page.waitForEvent('popup');
  await enlarge.click();
  const timetableTab = await popup;
  await expect.poll(() => timetableTab.evaluate(() => {
    const image = document.images[0];
    return image && [image.naturalWidth, image.naturalHeight];
  })).toEqual([1488, 2038]);
  await timetableTab.close();
  const pdf = await comparison.getByRole('link', { name: /전체 PDF 열기/ }).evaluate(link => (link as HTMLAnchorElement).href);
  expect((await (await page.request.get(pdf)).body()).subarray(0, 5).toString()).toBe('%PDF-');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const searchLinks = comparison.getByRole('link', { name: '직접 검색해보기', exact: true });
  await expect(searchLinks).toHaveCount(2);
  const card = comparison.locator('.dorim-method');
  await expect(card.getByRole('heading', { level: 2 })).toHaveText('내가 아는 장소로 내릴 곳 찾기');
  await card.getByRole('link', { name: '직접 검색해보기', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('내가 아는 장소로 내릴 곳 찾기');
  await expect(page.getByLabel('이용 요일')).toHaveValue('FRI');
  await expect(page.getByLabel('어디로 돌아가시나요?')).toHaveValue('유니버시아드 힐스테이트 2단지');
  await page.getByRole('link', { name: '비교 화면으로' }).click();
  await comparison.getByRole('link', { name: '운행편 예시 바로 보기' }).click();
  await expect(page.getByLabel('확인할 요일')).toHaveValue('FRI');
  for (const value of ['15:30', 'MNU 스퀘어 앞', '서광주우체국']) {
    await expect(page.locator('.detail-facts')).toContainText(value);
  }
  await page.getByRole('link', { name: '비교 화면으로' }).click();
  await expect(page).toHaveURL(/\/#\/compare$/);
});

test('로고는 같은 홈에서도 처음으로 이동하고 뒤로·앞으로에서 각 상태를 복원한다', async ({ page }) => {
  await page.goto('/#/');
  await page.getByRole('button', { name: '하교 학교 → 광주' }).click();
  await page.getByLabel('이용 요일').selectOption('FRI');
  await page.locator('#place-query').fill('힐스테이트');
  await page.locator('.time-options summary').click();
  await page.getByLabel('비교할 직선거리 반경').selectOption('5000');
  await page.locator('.brand').press('Enter');
  const firstScreen = async () => {
    await expect(page.locator('#place-query')).toHaveValue('');
    await expect(page.getByLabel('이용 요일')).toHaveValue('');
    await expect(page.getByRole('button', { name: '등교 광주 → 학교' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.time-options')).not.toHaveAttribute('open', '');
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  };
  await firstScreen();
  await expect(page.locator('.hero h1')).toBeFocused();
  await page.goBack();
  await expect(page.locator('#place-query')).toHaveValue('힐스테이트');
  await expect(page.getByLabel('이용 요일')).toHaveValue('FRI');
  await expect(page.getByLabel('비교할 직선거리 반경')).toHaveValue('5000');
  await page.goForward();
  await firstScreen();
});

test('시연 상세와 비교 화면에서 로고를 누르면 일반 홈 첫 화면으로 간다', async ({ page }) => {
  await page.goto('/?demo=hwajeong#/trip/tp-s25-from-songjeong-03');
  await page.getByLabel('확인할 요일').selectOption('FRI');
  await page.locator('.brand').click();
  await expect(page).toHaveURL(/\/#\/$/);
  await expect(page.locator('.demo-scenario')).toHaveCount(0);
  await expect(page.locator('#place-query')).toHaveValue('');
  await page.goBack();
  await expect(page.locator('.demo-scenario')).toBeVisible();
  await expect(page.getByLabel('확인할 요일')).toHaveValue('FRI');
  await page.goto('/#/asis/routes/fromCampus');
  await page.locator('.brand').click();
  await expect(page.locator('.hero h1')).toBeFocused();
  await expect(page.locator('#place-query')).toHaveValue('');
});

test('하교 시연 목적지를 상세에서도 읽고 일반 홈으로 종료한다', async ({ page }) => {
  await page.goto('/');
  await page.locator('.comparison-tools summary').click();
  const popup = page.waitForEvent('popup');
  await page.getByRole('link', { name: /화정동 2단지 하교 시연/ }).click();
  const demo = await popup;
  const scenario = demo.getByRole('complementary', { name: '하교 시연 시나리오' });
  await expect(scenario).toContainText('광주 서구 화정동 유니버시아드 힐스테이트 2단지');
  await expect(demo.getByRole('button', { name: '하교 학교 → 광주' })).toHaveAttribute('aria-pressed', 'true');
  await expect(demo.locator('#place-query')).toHaveValue('유니버시아드 힐스테이트 2단지');
  await demo.getByRole('link', { name: '노선 목록', exact: true }).click();
  await demo.locator('.trip-card').first().click();
  await expect(demo.locator('.detail-facts')).toBeVisible();
  await scenario.locator('summary').click();
  await expect(scenario.locator('p')).toBeInViewport();
  await demo.reload();
  await expect(scenario.locator('summary')).toBeVisible();
  await scenario.getByRole('link', { name: '시연 종료' }).click();
  await expect(scenario).toHaveCount(0);
  await expect(demo.locator('#place-query')).toHaveValue('');
});

for (const mode of ['asis', 'tobe']) {
  test(`평가 탐색 중 시나리오를 다시 읽는다 (${mode})`, async ({ page }) => {
    await page.goto('/#/evaluation');
    await page.getByRole('combobox', { name: /^과업/ }).selectOption('B');
    await page.getByLabel('비교 방식').selectOption(mode);
    const instruction = await page.locator('.evaluation-task p').innerText();
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: '과업 시작', exact: true }).click();
    await page.getByRole('link', { name: '선택한 방식으로 탐색 시작' }).click();
    const reminder = page.locator('.evaluation-reminder');
    await reminder.locator('summary').click();
    await expect(reminder.locator('p')).toHaveText(instruction);
    await expect(reminder.locator('p')).toBeInViewport();
    await reminder.locator('summary').click();
    await page.getByRole('button', { name: '답변 완료 · 시간 정지' }).click();
    await expect(page.getByRole('button', { name: '시간 정지됨' })).toBeDisabled();
  });
}
