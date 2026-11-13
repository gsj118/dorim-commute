import { test, expect } from '@playwright/test';

test('P029 As-is first-stop label and direction announcement follow the current view', async ({ page }) => {
  await page.route('https://**/*', route => route.abort());
  await page.goto('/#/routes/fromCampus');
  await page.locator('.comparison-tools summary').click();
  await page.getByRole('link', { name: 'As-is · 목록으로 찾기', exact: true }).click();
  await page.getByRole('link', { name: '등교 노선 보기 광주 → 도림캠퍼스', exact: true }).click();
  await page.getByRole('link', { name: /^송정⑥_/ }).click();
  await expect(page.locator('.asis-trip-facts')).toContainText('첫 승차 지점 시각: 07:10');
  await expect(page.locator('.asis-trip-facts')).toContainText('첨단응암공원승강장');
  await expect(page.locator('.sr-only[aria-live]')).toContainText('등교 방향');
});

test('P029 selected boarding summary, change, collapse and campus selection', async ({ page }) => {
  await page.route('https://**/*', route => route.abort());
  await page.goto('/#/trip/tp-s25-to-songjeong-06/occ-tp-s25-to-songjeong-06-04');
  const summary = page.locator('.detail-facts > div').first();
  await expect(summary).toContainText('이 정류장에서 타는 시각');
  await expect(summary).toContainText('07:15');
  await expect(summary).toContainText('수완W여성병원');
  await page.getByRole('button', { name: /^5 어등산약국/ }).click();
  await expect(summary).toContainText('07:17');
  await page.getByRole('button', { name: /^5 어등산약국/ }).click();
  await expect(summary).toContainText('첫 승차 지점 시각');
  await expect(summary).toContainText('첨단응암공원승강장');
  await expect(summary).toContainText('07:10');
  await page.getByRole('button', { name: /^7 도림캠퍼스/ }).click();
  await expect(summary).toContainText('첫 승차 지점 시각');
  await expect(summary).not.toContainText('학교 도착');
});

test('P029 unsupported region exposes actionable recovery in the empty result', async ({ page }) => {
  await page.route('https://**/*', route => {
    if (new URL(route.request().url()).pathname !== '/v2/maps/sdk.js') return route.abort();
    return route.fulfill({ contentType: 'application/javascript', body: `window.kakao={maps:{load:cb=>cb(),services:{Status:{OK:'OK',ZERO_RESULT:'ZERO_RESULT'},Places:class{keywordSearch(q,cb){cb([{id:'outside-test',place_name:'지원지역 밖 모의 장소',road_address_name:'경기 수원시 합성 시험 주소',address_name:'경기 수원시 합성 시험 주소',x:'127.05',y:'37.28'}],'OK',{hasNextPage:false})}}},LatLng:class{},Map:class{constructor(){throw Error('simulated map failure')}}}};` });
  });
  await page.goto('/');
  await page.getByLabel('어디에서 출발하시나요?').fill('합성 시험');
  await page.getByRole('button', { name: '장소 검색', exact: true }).click();
  await page.getByRole('button', { name: '다른 지역까지 검색' }).click();
  await page.getByRole('button', { name: /지원지역 밖 모의 장소/ }).click();
  const empty = page.locator('.selected-place .candidate-empty');
  await expect(empty).toContainText('현재 거리 비교 지원지역 밖');
  await expect(empty).toContainText('장소의 이름·주소를 확인하고 다시 선택');
  await expect(empty).not.toContainText('반경 또는 시간조건을 바꿔보세요.');
  await empty.getByRole('link').click();
  await expect(page.getByRole('heading', { name: '노선 목록', exact: true })).toBeVisible();
});
