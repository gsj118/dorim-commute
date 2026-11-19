import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Recorded public facility coordinates; the SDK response and failure are simulated.
// The application's real data, ranking, navigation and compiled code are untouched.
const place = {
  id: 'ui-refined-recorded-fixture', place_name: '유니버시아드힐스테이트2단지아파트',
  address_name: '광주광역시 서구 화정동', road_address_name: '광주광역시 서구 화정로 211',
  x: '126.87963166633668', y: '35.14640530365541', category_name: '부동산 > 주거시설 > 아파트',
};
async function sdkBoundary(page: Page) {
  await page.route('https://**/*', route => {
    if (new URL(route.request().url()).pathname !== '/v2/maps/sdk.js') return route.abort();
    return route.fulfill({ contentType: 'application/javascript', body: `
      const answer=(q,cb)=>setTimeout(()=>cb(q.includes('빈결과')?[]:[${JSON.stringify(place)}],
        q.includes('오류')?'ERROR':q.includes('빈결과')?'ZERO_RESULT':'OK',{hasNextPage:false}),400);
      window.kakao={maps:{load:cb=>cb(),services:{Status:{OK:'OK',ERROR:'ERROR',ZERO_RESULT:'ZERO_RESULT'},
        Places:class{keywordSearch(q,cb){answer(q,cb)}},Geocoder:class{addressSearch(q,cb){answer(q,cb)}}},
        LatLng:class{},Map:class{constructor(){throw Error('mock map unavailable')}}}};
    ` });
  });
}
async function search(page: Page, direction: 'toCampus' | 'fromCampus' = 'fromCampus') {
  await page.goto('/');
  if (direction === 'fromCampus') await page.getByRole('button', { name: '하교 학교 → 광주', exact: true }).click();
  await page.locator('#place-query').fill(place.place_name);
  await page.getByRole('button', { name: '장소 검색', exact: true }).click();
  await page.locator('.place-results button').first().click();
  await expect(page.locator('.candidate-card').first()).toBeVisible();
}

test.beforeEach(async ({ page }) => { await sdkBoundary(page); });

test('최종 UI는 기본 주소에 적용되고 기존 비교 주소의 홈·시연·새로고침·브라우저 왕복도 유지된다', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.ui-refined')).toHaveCount(1);
  await expect(page.locator('.hero h1')).toHaveText('장소로 통학버스 찾기');
  await page.goto('/?ui=other');
  await expect(page.locator('.ui-refined')).toHaveCount(1);
  await page.goto('/?ui=refined&demo=hwajeong&day=FRI#/search');
  await expect(page.locator('.ui-refined')).toHaveCount(1);
  await expect(page.getByLabel('이용 요일')).toHaveValue('FRI');
  await page.locator('.brand').click();
  await expect(page).toHaveURL(/\/\?ui=refined#\/$/);
  await expect(page.locator('.demo-scenario')).toHaveCount(0);
  await expect(page.locator('#place-query')).toHaveValue('');
  await expect(page.getByLabel('이용 요일')).toHaveValue('');
  await page.goBack();
  await expect(page.locator('.demo-scenario')).toBeVisible();
  await page.getByRole('link', { name: '비교 화면으로', exact: true }).click();
  await expect(page).toHaveURL(/\/\?ui=refined#\/compare$/);
  await expect(page.locator('.ui-refined')).toHaveCount(1);
  await page.getByRole('link', { name: '운행편 예시 바로 보기', exact: true }).click();
  await page.reload();
  await expect(page.locator('.ui-refined .detail-facts')).toContainText('15:30');
  await page.locator('.brand').click();
  await expect(page).toHaveURL(/\/\?ui=refined#\/$/);
  await page.goto('/?ui=refined&demo=hwajeong#/search');
  await page.getByRole('link', { name: '시연 종료', exact: true }).click();
  await expect(page).toHaveURL(/\/\?ui=refined$/);
  await expect(page.locator('.ui-refined')).toHaveCount(1);
  await expect(page.locator('.demo-scenario')).toHaveCount(0);
});

test('As-is·평가 화면에는 일반 이용 UI가 적용되지 않는다', async ({ page }) => {
  const appearance = () => page.locator('.app-shell').evaluate(root => {
    const properties = ['display', 'position', 'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing',
      'color', 'background-color', 'background-image', 'border', 'border-radius', 'padding', 'margin', 'gap',
      'box-shadow', 'outline', 'opacity', 'transform', 'transition-duration'];
    return [root, ...root.querySelectorAll('*')].filter(e => e.checkVisibility() && e.getBoundingClientRect().width > 0).map(e => {
      const style = getComputedStyle(e), box = e.getBoundingClientRect();
      return [e.tagName, ...properties.map(p => style.getPropertyValue(p)), ...[box.x, box.y, box.width, box.height].map(v => Math.round(v * 100) / 100)];
    });
  });
  for (const hash of ['#/asis', '#/evaluation']) {
    await page.goto(`/${hash}`);
    await expect(page.locator('main h1').filter({ visible: true })).toBeVisible();
    await page.locator('.brand img').evaluate((image: HTMLImageElement) => image.decode());
    await page.evaluate(() => document.fonts.ready);
    await page.mouse.move(0, 0);
    const baselineAppearance = await appearance();
    const before = await page.screenshot({ animations: 'disabled', path: test.info().outputPath(`baseline-${hash.replace(/[^a-z]/g, '') || 'home'}.png`) });
    await page.goto(`/?ui=refined${hash}`);
    await expect(page.locator('main h1').filter({ visible: true })).toBeVisible();
    await page.locator('.brand img').evaluate((image: HTMLImageElement) => image.decode());
    await expect(page.locator('.ui-refined')).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready);
    await page.mouse.move(0, 0);
    const after = await page.screenshot({ animations: 'disabled', path: test.info().outputPath(`experimental-${hash.replace(/[^a-z]/g, '') || 'home'}.png`) });
    // Avoid expanding two PNG buffers into millions of diff entries on failure.
    if (!after.equals(before)) {
      await test.info().attach(`baseline-${hash}`, { body: before, contentType: 'image/png' });
      await test.info().attach(`experimental-${hash}`, { body: after, contentType: 'image/png' });
    }
    // PNG byte equality is unstable: the external-link SVG raster differed by
    // one pixel with identical layout. Compare actual styles/geometry instead.
    expect(await appearance(), `${hash}: excluded screen styles and geometry`).toEqual(baselineAppearance);
  }
});

test('하교 시각·지도 선택·초점·더보기·조건 복구와 상세 왕복을 보존한다', async ({ page }) => {
  await search(page);
  const first = page.locator('.candidate-card').first();
  const link = first.locator('.candidate-detail-link').first();
  await expect(first).toContainText('17:30');
  await expect(first).toContainText('18:20');
  await expect(first).toContainText('금요일 15:30으로 변경');
  const summary = first.locator('.candidate-evidence > summary');
  await summary.focus();
  await page.keyboard.press('Enter');
  const geometry = await first.boundingBox();
  const mapButton = first.locator('.candidate-map-button');
  await mapButton.click();
  await expect(page.locator('#candidate-map h4')).toBeFocused();
  await page.getByRole('button', { name: '하차 후보 목록으로', exact: true }).click();
  await expect(mapButton).toBeFocused();
  await expect(mapButton).toHaveAttribute('aria-pressed', 'true');
  await expect(first.locator('.candidate-evidence')).toHaveAttribute('open', '');
  const selectedGeometry = await first.boundingBox();
  expect(selectedGeometry!.width).toBeCloseTo(geometry!.width, 2);
  expect(selectedGeometry!.height).toBeCloseTo(geometry!.height, 2);
  await summary.click();
  const count = await page.locator('.candidate-card').count();
  await page.getByRole('button', { name: /하차 지점 더 보기/ }).click();
  await expect(page.locator('.candidate-card')).toHaveCount(count + 2);
  await link.click();
  await expect(page.locator('.detail-facts')).toContainText('MNU 스퀘어 앞');
  await page.goBack();
  await expect(link).toBeFocused();
  await page.goForward();
  await expect(page.locator('.detail-facts')).toBeVisible();
  await page.getByRole('link', { name: '← 장소 검색 결과로', exact: true }).click();
  await expect(link).toBeFocused();
  await expect(page.locator('.candidate-card')).toHaveCount(count + 2);
  await page.getByRole('combobox', { name: '이용 요일', exact: true }).selectOption('FRI');
  await expect(first.locator('.candidate-time strong').first()).toHaveText('15:30');
  await page.locator('.time-options > summary').click();
  await page.getByLabel('학교에서 출발할 수 있는 시각').fill('23:59');
  await expect(page.locator('.candidate-card')).toHaveCount(0);
  await page.getByRole('button', { name: '시간 조건 해제 후 다시 비교', exact: true }).click();
  await expect(first).toBeVisible();
  await page.getByRole('link', { name: '하교 노선 전체 보기 →', exact: true }).click();
  await expect(page.locator('.ui-refined .trip-card').first()).toBeVisible();
});

test('검색 대기·실패·빈 결과 복구에서 입력 공간과 동작을 유지한다', async ({ page }) => {
  await page.goto('/');
  const input = page.locator('#place-query');
  const submit = page.locator('.search-input-row > button').first();
  await input.fill('오류');
  const before = (await submit.boundingBox())!.width;
  await submit.click();
  await expect(submit).toHaveText('검색 중…');
  expect(Math.abs((await submit.boundingBox())!.width - before)).toBeLessThan(2);
  await expect(page.locator('.notice.error')).toBeVisible();
  await input.fill('빈결과');
  await submit.click();
  await expect(page.locator('.place-results button')).toHaveCount(0);
  await expect(submit).toHaveText('장소 검색');
  await input.fill(place.place_name);
  await submit.click();
  await page.locator('.place-results button').first().click();
  await expect(page.locator('.candidate-card').first()).toBeVisible();
});

test('등교·320/390/768/1440 레이아웃·대비와 동작 줄이기를 확인한다', async ({ page }) => {
  await search(page, 'toCampus');
  await expect(page.locator('.trip-columns').first()).toContainText('승차 시각');
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const smallControls = await page.locator('.ui-refined :is(.site-header a, .direction-toggle button, .search-kind button, #place-query, .search-input-row > .primary-button, .candidate-map-button)').evaluateAll(elements =>
      elements.filter(e => e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().height > 0 && e.getBoundingClientRect().height < 44).map(e => e.outerHTML));
    expect(smallControls).toEqual([]);
  }
  const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(scan.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) }))).toEqual([]);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const summary = page.locator('.time-options > summary');
  await summary.click();
  await summary.click();
  await summary.click();
  await expect(page.locator('.time-options')).toHaveAttribute('open', '');
  expect(await summary.evaluate(e => getComputedStyle(e, '::before').transitionDuration)).toBe('0s');
  const link = page.locator('.candidate-detail-link').first();
  await link.click();
  await expect(page.locator('.detail-facts')).toContainText('승차');
  await page.getByRole('link', { name: '← 장소 검색 결과로', exact: true }).click();
  await expect(link).toBeFocused();
});


test('방향·검색 종류의 입력 이름, 로딩 알림, 실패와 빈 결과를 구별한다', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '장소로 통학버스 찾기', exact: true })).toBeVisible();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    const wordRects = await page.locator('.hero h1 > span').evaluate(element => {
      const text = element.firstChild!;
      const range = document.createRange();
      const start = text.textContent!.indexOf('찾기');
      range.setStart(text, start); range.setEnd(text, start + 2);
      return range.getClientRects().length;
    });
    expect(wordRects).toBe(1);
  }
  for (const direction of ['등교', '하교']) {
    await page.getByRole('button', { name: direction === '등교' ? '등교 광주 → 학교' : '하교 학교 → 광주', exact: true }).click();
    await expect(page.locator('.hero-copy > p')).toContainText(direction === '등교' ? '승차 시각' : '학교 출발 시각');
    for (const kind of ['장소명', '주소']) {
      await page.getByRole('button', { name: kind, exact: true }).click();
      const label = (direction === '등교' ? '출발지 ' : '목적지 ') + kind;
      await expect(page.getByRole('textbox', { name: label, exact: true })).toBeVisible();
      await page.getByRole('textbox', { name: label, exact: true }).fill('빈결과');
      await page.getByRole('button', { name: kind === '주소' ? '주소 검색' : '장소 검색', exact: true }).click();
      await expect(page.getByRole('status').filter({ hasText: kind === '주소' ? '주소를 검색하고 있습니다.' : '장소를 검색하고 있습니다.' })).toBeVisible();
      await expect(page.locator('.place-search .notice')).toContainText(kind === '주소' ? '주소 검색 결과가 없습니다.' : '장소 검색 결과가 없습니다.');
      await expect(page.locator('.place-search .notice')).toContainText('통학버스 미운행을 뜻하지 않습니다.');
    }
  }
  await page.locator('#place-query').fill('오류');
  await page.getByRole('button', { name: '주소 검색', exact: true }).click();
  await expect(page.locator('.notice.error')).toContainText('검색 결과를 불러오지 못했습니다.');
  await expect(page.locator('.notice.error')).not.toContainText('장소 검색을 이용');
});

test('중앙 상단과 안내·빈 상세를 네 너비에서 확인하고 기본 문구를 보존한다', async ({ page }) => {
  await page.goto('/#/sources');
  await expect(page.locator('.ui-refined')).toHaveCount(1);
  await expect(page.locator('.site-footer')).toContainText('비공식 교육용 HCI 프로토타입');
  await expect(page.getByRole('button', { name: '노선 목록 보기', exact: true })).toBeVisible();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    const boxes = await page.locator('.site-header').evaluate(header => {
      const brand = header.querySelector('.brand')!.getBoundingClientRect();
      const nav = header.querySelector('nav')!.getBoundingClientRect();
      return { center: brand.x + brand.width / 2, viewport: innerWidth, bottom: brand.bottom,
        navTop: nav.top, height: header.getBoundingClientRect().height,
        overflow: document.documentElement.scrollWidth > innerWidth + 1 };
    });
    expect(Math.abs(boxes.center - boxes.viewport / 2)).toBeLessThan(1);
    expect(boxes.height).toBeLessThanOrEqual(112);
    expect(boxes.navTop).toBeGreaterThanOrEqual(boxes.bottom);
    expect(boxes.overflow).toBe(false);
    await expect(page.locator('.site-header nav a')).toHaveCount(3);
    await expect(page.locator('.site-header nav a[aria-current=page]')).toHaveText('이용 안내');
  }
  // Simulate text-only enlargement, including fixed-pixel text, at narrow widths.
  await page.setViewportSize({ width: 320, height: 844 });
  await page.locator('.site-header').evaluate(header => {
    const sizes = [...header.querySelectorAll<HTMLElement>('*')].map(element => ({ element,
      size: parseFloat(getComputedStyle(element).fontSize), line: parseFloat(getComputedStyle(element).lineHeight) }));
    for (const { element, size, line } of sizes) {
      element.style.fontSize = (size * 2) + 'px';
      if (Number.isFinite(line)) element.style.lineHeight = (line * 2) + 'px';
    }
  });
  const enlarged = await page.locator('.site-header').evaluate(header => {
    const brand = header.querySelector('.brand')!.getBoundingClientRect();
    const project = header.querySelector('.header-project')!.getBoundingClientRect();
    const official = header.querySelector('.official-link')!.getBoundingClientRect();
    const nav = header.querySelector('nav')!.getBoundingClientRect();
    return { height: header.getBoundingClientRect().height, leftGap: brand.left - project.right,
      rightGap: official.left - brand.right, navGap: nav.top - Math.max(brand.bottom, project.bottom, official.bottom),
      overflow: document.documentElement.scrollWidth > innerWidth + 1 };
  });
  expect(enlarged.height).toBeGreaterThan(112);
  expect(enlarged.leftGap).toBeGreaterThanOrEqual(0);
  expect(enlarged.rightGap).toBeGreaterThanOrEqual(0);
  expect(enlarged.navGap).toBeGreaterThanOrEqual(0);
  expect(enlarged.overflow).toBe(false);
  await page.screenshot({ path: test.info().outputPath('header-text-200.png') });
  await page.goto('/#/trip/not-a-trip');
  await expect(page.getByRole('heading', { name: '해당 운행편을 찾을 수 없습니다.', exact: true })).toBeVisible();
  await page.goto('/');
  await expect(page.locator('.hero h1')).toHaveText('장소로 통학버스 찾기');
  await expect(page.locator('.header-project')).toHaveText('학생 프로젝트');
});

test('시간 조건 해제 링크의 동작과 범위·주말 안내를 보존한다', async ({ page }) => {
  await search(page);
  await page.getByRole('combobox', { name: '이용 요일', exact: true }).selectOption('FRI');
  await page.locator('.time-options > summary').click();
  await page.getByLabel('학교에서 출발할 수 있는 시각').fill('23:59');
  await expect(page.locator('.candidate-empty')).toContainText('현재 조건에 맞는 거리 비교 결과가 없습니다.');
  await page.getByRole('link', { name: '시간 조건 해제 후 하교 노선 전체 보기 →', exact: true }).click();
  await expect(page).toHaveURL(/#\/routes\/fromCampus$/);
  await expect(page.getByRole('combobox', { name: '이용 요일', exact: true })).toHaveValue('FRI');
  await expect(page.locator('.trip-card').first()).toBeVisible();
  await page.getByRole('link', { name: '← 장소 검색 결과로', exact: true }).click();
  await expect(page.getByLabel('학교에서 출발할 수 있는 시각')).toHaveValue('23:59');
  await page.getByRole('button', { name: '시간 조건 해제 후 다시 비교', exact: true }).click();
  await page.getByRole('combobox', { name: '이용 요일', exact: true }).selectOption('SAT');
  await expect(page.locator('.candidate-empty')).toContainText('주말에는 정규 통학버스가 운행하지 않습니다.');
  await expect(page.getByRole('link', { name: '하교 노선 전체 보기 →', exact: true })).toBeVisible();
});
