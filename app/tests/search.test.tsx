import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlaceSearch } from '../src/components/PlaceSearch';
import { placeProvider } from '../src/providers/kakao';
import type { SearchPage } from '../src/providers/kakao';
import type { PlaceSelection } from '../src/domain/types';
import { dataset, getTripStops } from '../src/data';
import App from '../src/App';
import { placeAreaLabel, placeRegion } from '../src/domain/placeRegion';
import { normalizePlace } from '../src/providers/kakao';
vi.mock('../src/providers/kakao', async importOriginal => ({
  ...await importOriginal<typeof import('../src/providers/kakao')>(),
  isKakaoConfigured: () => false, placeProvider: { search: vi.fn() },
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); window.location.hash = ''; });
describe('address context on place cards', () => {
  it('keeps results when the active search kind is clicked again', async () => {
    const place = normalizePlace({ place_name: '시험 장소', address_name: '광주 서구 시험동', x: '126', y: '35' }, 'place')!;
    vi.mocked(placeProvider.search).mockResolvedValueOnce({ items: [place], page: 1, hasNext: false });
    render(<PlaceSearch direction="toCampus" weekday={null} initialQuery="시험 장소"/>);
    fireEvent.click(screen.getByRole('button', { name: '장소 검색' }));
    const result = await screen.findByRole('button', { name: /시험 장소.*시험동/ });
    fireEvent.click(screen.getByRole('button', { name: '장소명' }));
    expect(document.body.contains(result)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '주소' }));
    expect(document.body.contains(result)).toBe(false);
  });
  it('narrows loaded results by district and category and clears a category absent from the next district', async () => {
    const make = (place_name: string, address_name: string, category_name: string) =>
      normalizePlace({ place_name, address_name, category_name, x: '126', y: '35' }, 'place')!;
    const items = [make('푸른마을아파트', '광주 서구 화정동 1', '주거 > 아파트'),
      ...['정문', '후문', '동문', '서문'].map(gate => make('푸른마을 ' + gate, '광주 서구 화정동 1', '교통 > 입출구')),
      make('푸른마을아파트', '광주 북구 연제동 2', '주거 > 아파트')];
    vi.mocked(placeProvider.search).mockResolvedValueOnce({ items, page: 1, hasNext: false });
    render(<PlaceSearch direction="fromCampus" weekday={null}/>);
    fireEvent.change(screen.getByLabelText('어디로 돌아가시나요?'), { target: { value: '푸른마을' } });
    fireEvent.click(screen.getByRole('button', { name: '장소 검색' }));
    const district = await screen.findByLabelText('검색 결과 내 지역');
    fireEvent.change(screen.getByLabelText('검색 결과 내 장소 종류'), { target: { value: '입출구' } });
    expect(screen.queryByRole('list', { name: '아파트 단지' })).toBeNull();
    expect(screen.getAllByRole('button', { name: /푸른마을.*서구 · 화정동/ })).toHaveLength(4);
    expect(screen.queryByRole('button', { name: /나머지 장소/ })).toBeNull();
    fireEvent.change(district, { target: { value: '북구' } });
    expect(screen.getByRole('status').textContent).toContain('북구 검색 결과 1곳');
    expect(screen.getByRole('button', { name: /푸른마을아파트.*북구 · 연제동/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /서구 · 화정동/ })).toBeNull();
    expect(screen.getByRole('link', { name: /카카오맵에서 같은 검색/ }).getAttribute('href')).toBe(
      'https://map.kakao.com/link/search/' + encodeURIComponent('광주 푸른마을'));
    expect(placeProvider.search).toHaveBeenCalledTimes(1);
  });
  it('broadens a numbered search without losing the district or selecting a place', async () => {
    const row = (place_name: string, address_name: string) => normalizePlace({ place_name, address_name, x: '126', y: '35' }, 'place')!;
    const facility = row('푸른마을 1단지 게이트2', '광주 북구 가상동');
    const apartment = row('푸른마을아파트', '광주 북구 가상동');
    const outside = row('푸른마을아파트', '광주 서구 가상동');
    const search = vi.mocked(placeProvider.search);
    search.mockResolvedValueOnce({ items: [facility], page: 1, hasNext: false })
      .mockResolvedValueOnce({ items: [outside, apartment], page: 1, hasNext: false });
    render(<PlaceSearch direction="fromCampus" weekday={null}/>);
    const input = screen.getByLabelText('어디로 돌아가시나요?') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '북구 푸른마을 2단지' } });
    fireEvent.click(screen.getByRole('button', { name: '장소 검색' }));
    const broader = await screen.findByRole('button', { name: '단지 번호 빼고 ‘북구 푸른마을’ 검색' });
    expect(screen.getByText(/2단지 아파트 0곳/)).toBeTruthy();
    fireEvent.click(broader);
    await screen.findByRole('list', { name: '아파트 단지' });
    expect(input.value).toBe('북구 푸른마을');
    expect(search).toHaveBeenLastCalledWith('북구 푸른마을', 'place', 1, expect.objectContaining({ keyword: '광주 북구 푸른마을' }));
    expect(screen.queryByRole('button', { name: /푸른마을아파트.*서구/ })).toBeNull();
    expect(screen.queryByRole('heading', { name: /선택한 장소/ })).toBeNull();
  });
  it.each([
    ['전남광주통합특별시 서구 쌍촌동 123', null, false, '서구 · 쌍촌동'],
    ['전남광주통합특별시 나주시 빛가람동 123', null, false, '나주시 · 빛가람동'],
    ['광주 북구 임동 123', null, true, '광주 · 북구 · 임동'],
    ['경기 수원시 영통구 이의동 123', null, true, '경기 · 수원시 · 영통구 · 이의동'],
    ['전남 무안군 청계면 도림리 123', null, true, '전남 · 무안군 · 청계면 · 도림리'],
    [null, '광주 광산구 시험로 12 101동', false, '광산구'],
    ['광주 남구 101동', null, false, '남구'],
    [null, null, false, ''],
  ])('formats available address components for %s / %s', (lotAddress, roadAddress, nationwide, expected) => {
    expect(placeAreaLabel({ lotAddress, roadAddress, regionLabel: null }, nationwide)).toBe(expected);
  });
  it('shows separately selectable same-brand places and keeps the chosen neighborhood in the summary', async () => {
    const items = [
      ['시험아파트1단지', '광주 북구 시험동'], ['시험아파트2단지', '광주 북구 시험동'],
      ['시험아파트1단지', '광주 서구 다른동'], ['시험아파트1단지 정문', '광주 북구 시험동'],
    ].map(([place_name, address_name]) => normalizePlace({ place_name, address_name, x: '126', y: '35' }, 'place')!);
    vi.mocked(placeProvider.search).mockResolvedValueOnce({ items, page: 1, hasNext: false });
    render(<PlaceSearch direction="fromCampus" weekday={null}/>);
    fireEvent.change(screen.getByLabelText('어디로 돌아가시나요?'), { target: { value: '시험아파트' } });
    fireEvent.click(screen.getByRole('button', { name: '장소 검색' }));
    const list = await screen.findByRole('list', { name: '아파트 단지' });
    expect(within(list).getAllByRole('button')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: '나머지 장소 1곳 모두 보기' }));
    expect(within(screen.getByRole('list', { name: '출입구·시설 등 다른 장소' })).getByRole('button', { name: /정문/ })).toBeTruthy();
    fireEvent.click(within(list).getByRole('button', { name: /시험아파트1단지.*서구 · 다른동/ }));
    const heading = screen.getByRole('heading', { name: '선택한 장소 · 시험아파트1단지' });
    expect(document.getElementById(heading.getAttribute('aria-describedby')!)?.textContent).toBe('서구 · 다른동');
  });
});
it('shows the unsupported region recovery reason without opening a disclosure', async () => {
  const place: PlaceSelection = { provider: 'kakao', providerPlaceId: 'outside-test', selectionId: 'outside-test', kind: 'place', name: '지원지역 밖 모의 장소', roadAddress: '경기 수원시 합성 시험 주소', lotAddress: null, regionLabel: '경기 수원시', detailUrl: null, coordinates: { latitude: 37.28, longitude: 127.05, crs: 'WGS84' }, coordinateSource: 'synthetic test only', selectedAt: '', selectionState: 'notSelected', validationState: 'checked' };
  vi.mocked(placeProvider.search).mockResolvedValueOnce({ items: [place], hasNext: false, page: 1 });
  const { container } = render(<PlaceSearch direction="toCampus" weekday="MON"/>);
  fireEvent.change(screen.getByLabelText('어디에서 출발하시나요?'), { target: { value: '수원 합성 시험' } });
  fireEvent.click(screen.getByRole('button', { name: '장소 검색' }));
  fireEvent.click(await screen.findByRole('button', { name: /지원지역 밖 모의 장소/ }));
  const empty = container.querySelector('.selected-place .candidate-empty')!;
  expect(empty.textContent).toContain('선택한 장소는 현재 거리 비교 지원지역 밖입니다.');
  expect(empty.textContent).toContain('장소의 이름·주소를 확인하고 다시 선택');
  expect(empty.textContent).not.toContain('반경 또는 시간조건을 바꿔보세요.');
});
describe('search UI asynchronous boundaries', () => {
  it('keeps the explicitly selected place across directions and clears the directional time constraint', async () => {
    window.location.hash = '#/search';
    const place = normalizePlace({ place_name: '시립박물관', address_name: '광주 북구 시험동', x: '126', y: '35' }, 'place')!;
    vi.mocked(placeProvider.search).mockResolvedValueOnce({ items: [place], page: 1, hasNext: false });
    render(<App/>);
    fireEvent.change(screen.getByLabelText('어디에서 출발하시나요?'), { target: { value: '시립박물관' } });
    fireEvent.click(screen.getByRole('button', { name: '장소 검색' }));
    fireEvent.click(await screen.findByRole('button', { name: /시립박물관.*북구 · 시험동/ }));
    fireEvent.change(screen.getByLabelText('정류장에서 승차할 시각'), { target: { value: '07:30' } });
    fireEvent.click(screen.getByRole('button', { name: '같은 장소로 하교편 보기' }));
    expect(screen.getByRole('heading', { name: '선택한 장소 · 시립박물관' })).toBeTruthy();
    const departure = screen.getByLabelText('학교에서 출발할 수 있는 시각') as HTMLInputElement;
    expect(departure.value).toBe('');
    fireEvent.change(departure, { target: { value: '23:59' } });
    expect(screen.getByRole('link', { name: '시간 조건을 풀고 하교 전체 시간표 보기 →' }).getAttribute('href')).toBe('#/routes/fromCampus');
    fireEvent.click(screen.getByRole('button', { name: /^등교\s*광주 → 학교$/ }));
    expect(screen.getByRole('heading', { name: '주변 승차 지점·시각' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: '선택한 장소 · 시립박물관' })).toBeTruthy();
    expect(vi.mocked(placeProvider.search)).toHaveBeenCalledTimes(1);
  });
  it.each([
    ['센트럴자이', '광주 센트럴자이', '전남광주통합특별시 서구 합성로', '경기 광주시 합성로'],
    ['나주 힐스테이트', '나주 힐스테이트', '전남광주통합특별시 나주시 합성로', '광주 북구 합성로'],
    ['경기도 광주 자이', '경기도 광주 자이', '경기 광주시 합성로', '광주 서구 합성로'],
    ['목포시 아파트', '목포시 아파트', '전남 목포시 합성로', '전남 나주시 합성로'],
  ])('searches and checks the address for %s', (input, keyword, match, other) => {
    const region = placeRegion(input);
    expect(region.keyword).toBe(keyword);
    expect(region.matches(match)).toBe(true);
    expect(region.matches(other)).toBe(false);
  });

  it('finds later regional matches, deduplicates and reveals all remaining places without another request', async () => {
    const fixture = (id: number, address: string) => normalizePlace({
      id: String(id), place_name: '시험 단지 ' + id, address_name: address, x: '126', y: '35',
    }, 'place')!;
    const local = Array.from({ length: 11 }, (_, index) => fixture(index, '광주 서구 합성 주소'));
    const api = vi.mocked(placeProvider.search);
    api.mockResolvedValueOnce({ items: [fixture(99, '경기 광주시 합성 주소')], page: 1, hasNext: true })
      .mockResolvedValueOnce({ items: local.slice(0, 10), page: 2, hasNext: true })
      .mockResolvedValueOnce({ items: local.slice(9), page: 3, hasNext: false });
    render(<PlaceSearch direction="fromCampus" weekday={null}/>);
    fireEvent.change(screen.getByLabelText('어디로 돌아가시나요?'), { target: { value: '시험 단지' } });
    fireEvent.click(screen.getByRole('button', { name: '장소 검색' }));
    const next = await screen.findByRole('button', { name: '나머지 장소 8곳 모두 보기' });
    expect(screen.queryByText('시험 단지 99')).toBeNull();
    fireEvent.click(next);
    expect(document.activeElement?.textContent).toContain('시험 단지 3');
    expect(await screen.findByText('시험 단지 10')).toBeTruthy();
    expect(screen.getByText('시험 단지 9')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /나머지 장소/ })).toBeNull();
    expect(api).toHaveBeenCalledTimes(3);
  });

  it('widens only on request, retries nationwide and resets the scope on the next query', async () => {
    const api = vi.mocked(placeProvider.search);
    api.mockResolvedValueOnce({ items: [], page: 1, hasNext: false })
      .mockRejectedValueOnce(new Error('통신 오류'))
      .mockResolvedValue({ items: [], page: 1, hasNext: false });
    render(<PlaceSearch direction="toCampus" weekday={null}/>);
    const field = screen.getByLabelText('어디에서 출발하시나요?');
    fireEvent.change(field, { target: { value: '나주 시험 단지' } });
    fireEvent.click(screen.getByRole('button', { name: '장소 검색' }));
    const widen = await screen.findByRole('button', { name: '다른 지역까지 검색' });
    expect(api.mock.calls[0][3]?.label).toBe('나주');
    expect(api).toHaveBeenCalledTimes(1);
    fireEvent.click(widen);
    fireEvent.click(await screen.findByRole('button', { name: '다시 검색' }));
    await screen.findByText('검색 결과가 없습니다.');
    expect(api.mock.calls.slice(1)).toEqual([['시험 단지', 'place', 1], ['시험 단지', 'place', 1]]);
    fireEvent.change(field, { target: { value: '새 단지' } });
    fireEvent.click(screen.getByRole('button', { name: '장소 검색' }));
    await screen.findByRole('button', { name: '다른 지역까지 검색' });
    expect(api.mock.calls.at(-1)?.[3]?.keyword).toBe('광주 새 단지');
  });
  it('shows missing connection and keeps an independent list recovery path', () => {
    render(<PlaceSearch direction="fromCampus" weekday={null}/>);
    expect(screen.getByText('장소 검색 연결 준비 중')).toBeTruthy();
    expect(screen.getByLabelText('어디로 돌아가시나요?')).toBeTruthy();
    expect(screen.queryByText(/추천 1위/)).toBeNull();
  });
  it('discards an old response when direction changes', async () => {
    let resolve!: (page: SearchPage) => void;
    vi.mocked(placeProvider.search).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const { rerender } = render(<PlaceSearch direction="toCampus" weekday="MON"/>);
    fireEvent.change(screen.getByLabelText('어디에서 출발하시나요?'), { target: { value: '테스트' } });
    fireEvent.click(screen.getByRole('button', { name: '장소 검색' }));
    rerender(<PlaceSearch direction="fromCampus" weekday="MON"/>);
    await act(async () => resolve({ items: [], page: 1, hasNext: false }));
    expect(screen.queryByText('검색 결과가 없습니다.')).toBeNull();
  });
  it('reports error and allows a successful retry with a distinct empty state', async () => {
    vi.mocked(placeProvider.search).mockRejectedValueOnce(new Error('테스트 API 오류')).mockResolvedValueOnce({ items: [], hasNext: false, page: 1 });
    render(<PlaceSearch direction="toCampus" weekday={null}/>);
    fireEvent.change(screen.getByLabelText('어디에서 출발하시나요?'), { target: { value: '테스트' } });
    fireEvent.click(screen.getByRole('button', { name: '장소 검색' }));
    await waitFor(() => expect(screen.getByText('테스트 API 오류')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '다시 검색' }));
    await waitFor(() => expect(screen.getByText('검색 결과가 없습니다.')).toBeTruthy());
  });
  it('requires explicit place selection and explains zero real-data candidates', async () => {
    const place: PlaceSelection = { provider: 'kakao', providerPlaceId: 'mock-only', selectionId: 'mock-only', kind: 'place', name: '모의 장소', roadAddress: '모의 주소', lotAddress: null, regionLabel: '모의 지역', detailUrl: null, coordinates: { latitude: 35, longitude: 126, crs: 'WGS84' }, coordinateSource: 'synthetic-test-only', selectedAt: '2026-11-06T00:00:00+09:00', selectionState: 'notSelected', validationState: 'checked' };
    vi.mocked(placeProvider.search).mockResolvedValueOnce({ items: [], page: 1, hasNext: false }).mockResolvedValueOnce({ items: [place], hasNext: false, page: 1 });
    render(<PlaceSearch direction="fromCampus" weekday="FRI"/>);
    fireEvent.change(screen.getByLabelText('어디로 돌아가시나요?'), { target: { value: '모의' } });
    fireEvent.click(screen.getByRole('button', { name: '장소 검색' }));
    fireEvent.click(await screen.findByRole('button', { name: '다른 지역까지 검색' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /모의 장소/ })).toBeTruthy());
    expect(screen.queryByText('현재 비교 가능한 거리 후보는 0개입니다.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /모의 장소/ }));
    expect(screen.getByText('현재 비교 가능한 거리 후보는 0개입니다.')).toBeTruthy();
    expect(screen.getByText('검색에서 빠진 지점 보기')).toBeTruthy();
    expect(screen.getByRole('link', { name: '이 방향 노선 목록 보기 →' })).toBeTruthy();
  });
  it.each([
    { lat: 35.108, lng: 126.868, withinKm: 0, first: 2 },
    { lat: 35.108, lng: 126.892, withinKm: 1, first: 1 },
    { lat: 35.126, lng: 126.865, withinKm: 2, first: 2 },
    { lat: 35.108, lng: 126.871, withinKm: 3, first: 3 },
    { lat: 35.111, lng: 126.892, withinKm: 4, first: 4 },
    { lat: 35.117, lng: 126.898, withinKm: 5, first: 4 },
  ])('shows $first stops initially for $withinKm groups within 1 km, then adds two', async ({ lat, lng, withinKm, first }) => {
    const place = normalizePlace({ place_name: '시험 지점', address_name: '광주 서구 시험동', x: String(lng), y: String(lat) }, 'place')!;
    vi.mocked(placeProvider.search).mockResolvedValueOnce({ items: [place], page: 1, hasNext: false });
    const { container } = render(<PlaceSearch direction="fromCampus" weekday={null} initialQuery="시험 지점"/>);
    fireEvent.click(screen.getByRole('button', { name: '장소 검색' }));
    fireEvent.click(await screen.findByRole('button', { name: /시험 지점.*서구/ }));
    const cards = () => container.querySelectorAll<HTMLElement>('.candidate-card');
    expect(cards()).toHaveLength(first);
    for (const card of cards()) expect(Number(card.dataset.distanceMeters) <= 1000).toBe(withinKm > 0);
    expect(container.querySelector('.comparison-explanation')?.textContent).toContain(
      withinKm ? `목적지에서 지도 기준점까지 직선 1km 이내인 후보는 ${withinKm}곳` : '1km 이내 후보 없음'
    );
    fireEvent.click(screen.getByRole('button', { name: /하차 지점 더 보기/ }));
    expect(cards()).toHaveLength(first + 2);
  });
  it('shows recorded coordinates as reference candidates with distance, source, and exact-stop navigation', async () => {
    const stop = getTripStops('tp-s25-to-songjeong-01')[1];
    const place: PlaceSelection = { provider: 'kakao', providerPlaceId: 'test-only', selectionId: 'test-only', kind: 'place', name: '선택 검증용 가상 장소', roadAddress: '광주광역시 서구 시험용 주소', lotAddress: '광주광역시 서구 시험용 주소', regionLabel: '광주광역시 서구', detailUrl: null, coordinates: stop.location!.coordinates.value, coordinateSource: 'test fixture at recorded marker, not live API', selectedAt: '2026-11-06T00:00:00+09:00', selectionState: 'notSelected', validationState: 'checked' };
    vi.mocked(placeProvider.search).mockResolvedValueOnce({ items: [place], hasNext: false, page: 1 });
    render(<PlaceSearch direction="toCampus" weekday="MON"/>);
    fireEvent.change(screen.getByLabelText('어디에서 출발하시나요?'), { target: { value: '검증용' } });
    fireEvent.click(screen.getByRole('button', { name: '장소 검색' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /선택 검증용/ })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /선택 검증용/ }));
    const region = screen.getByRole('region', { name: '참고 후보' });
    expect(region.textContent).toContain('0m');
    expect(region.textContent).toContain('S50');
    expect(region.textContent).not.toContain('기본 운행요일 근거가 부족합니다.');
    expect(screen.queryByRole('region', { name: '추천 가능 후보' })).toBeNull();
    const link = region.querySelector('.candidate-detail-link')!;
    expect(link.getAttribute('href')).toBe(`#/trip/${dataset.trips[0].tripId}/${stop.occurrence.tripStopId}`);
    fireEvent.change(screen.getByLabelText('비교할 직선거리 반경'), { target: { value: '1000' } });
    expect(screen.getByRole('region', { name: '참고 후보' }).textContent).toContain('0m');
  });
  it('keeps Friday replacement visible on homeward reference cards when no weekday is selected', async () => {
    const stop = getTripStops('tp-s25-from-jinwol-03')[4];
    const place: PlaceSelection = { provider: 'kakao', providerPlaceId: 'test-homeward', selectionId: 'test-homeward', kind: 'place', name: '하교 검증용 가상 장소', roadAddress: '광주광역시 남구 시험용 주소', lotAddress: '광주광역시 남구 시험용 주소', regionLabel: '광주광역시 남구', detailUrl: null, coordinates: stop.location!.coordinates.value, coordinateSource: 'synthetic place selection at recorded marker, not live API', selectedAt: '2026-11-06T00:00:00+09:00', selectionState: 'notSelected', validationState: 'checked' };
    vi.mocked(placeProvider.search).mockResolvedValueOnce({ items: [place], hasNext: false, page: 1 });
    render(<PlaceSearch direction="fromCampus" weekday={null}/>);
    fireEvent.change(screen.getByLabelText('어디로 돌아가시나요?'), { target: { value: '검증용' } });
    fireEvent.click(screen.getByRole('button', { name: '장소 검색' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /하교 검증용/ })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /하교 검증용/ }));
    const cards = screen.getByRole('region', { name: '참고 후보' }).querySelectorAll('.candidate-card');
    expect(cards.length).toBeGreaterThan(0);
    const replacementTrip = screen.getByRole('region', { name: '참고 후보' }).querySelector('[data-trip-id="tp-s25-from-jinwol-03"]');
    expect(replacementTrip?.querySelector('.candidate-time strong')?.textContent).toBe('17:30');
    expect(replacementTrip?.querySelector('.candidate-time small')?.textContent).toBe('금요일 15:30으로 변경');
    const lateTrip = screen.getByRole('region', { name: '참고 후보' }).querySelector('[data-trip-id="tp-s25-from-jinwol-06"]');
    expect(lateTrip?.textContent).toContain('18:20');
    expect(lateTrip?.textContent).not.toContain('금요일');
    expect(screen.getAllByText('학교에서 타는 곳 · MNU 스퀘어 앞')).toHaveLength(1);
    cards.forEach(card => {
      expect(card.textContent).not.toContain('학교에서 타는 곳 · MNU 스퀘어 앞');
      expect(card.textContent).toContain('비교할 요일을 선택해 주세요.');
    });
  });
  it('recalculates optional boarding-time filters without clearing the selected place on weekday changes', async () => {
    const stop = getTripStops('tp-s25-to-songjeong-01')[1];
    const place: PlaceSelection = { provider: 'kakao', providerPlaceId: 'time-ui', selectionId: 'time-ui', kind: 'place', name: '시간조건 검사용 장소', roadAddress: '광주광역시 서구 시험 주소', lotAddress: null, regionLabel: '광주광역시 서구', detailUrl: null, coordinates: stop.location!.coordinates.value, coordinateSource: 'synthetic test, not real search', selectedAt: '', selectionState: 'notSelected', validationState: 'checked' };
    vi.mocked(placeProvider.search).mockResolvedValueOnce({ items: [place], hasNext: false, page: 1 });
    const { rerender } = render(<PlaceSearch direction="toCampus" weekday="MON"/>);
    fireEvent.change(screen.getByLabelText('어디에서 출발하시나요?'), { target: { value: '검사용' } });
    fireEvent.click(screen.getByRole('button', { name: '장소 검색' }));
    fireEvent.click(await screen.findByRole('button', { name: /시간조건 검사용 장소/ }));
    expect(screen.getByRole('region', { name: '참고 후보' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('정류장에서 승차할 시각'), { target: { value: '23:59' } });
    expect(screen.getByText('현재 비교 가능한 거리 후보는 0개입니다.')).toBeTruthy();
    expect(screen.getByText(/현재 조건에서 제외·생략한/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '시간 조건 지우고 다시 비교' }));
    expect(screen.getByRole('region', { name: '참고 후보' })).toBeTruthy();
    rerender(<PlaceSearch direction="toCampus" weekday="FRI"/>);
    expect(screen.getByRole('heading', { name: '선택한 장소 · 시간조건 검사용 장소' })).toBeTruthy();
    expect(vi.mocked(placeProvider.search)).toHaveBeenCalledTimes(1);
  });
  it('groups homeward trips at one recorded stop while keeping each trip weekday evidence distinct', async () => {
    const stop = getTripStops('tp-s25-from-jinwol-03')[4];
    const place: PlaceSelection = { provider: 'kakao', providerPlaceId: 'group-ui', selectionId: 'group-ui', kind: 'place', name: '복수편 검사용 장소', roadAddress: '광주광역시 남구 시험 주소', lotAddress: null, regionLabel: '광주광역시 남구', detailUrl: null, coordinates: stop.location!.coordinates.value, coordinateSource: 'synthetic test at recorded marker', selectedAt: '', selectionState: 'notSelected', validationState: 'checked' };
    vi.mocked(placeProvider.search).mockResolvedValueOnce({ items: [place], hasNext: false, page: 1 });
    render(<PlaceSearch direction="fromCampus" weekday="MON"/>);
    fireEvent.change(screen.getByLabelText('어디로 돌아가시나요?'), { target: { value: '복수편' } });
    fireEvent.click(screen.getByRole('button', { name: '장소 검색' }));
    fireEvent.click(await screen.findByRole('button', { name: /복수편 검사용 장소/ }));
    const group = Array.from(document.querySelectorAll('.candidate-card')).find(card => card.querySelector('[data-trip-id="tp-s25-from-jinwol-01"]') && card.querySelector('[data-trip-id="tp-s25-from-jinwol-03"]'))!;
    expect(group).toBeTruthy();
    expect(group.querySelectorAll('.candidate-relations .candidate-trip')).toHaveLength(2);
    const early = group.querySelector('[data-trip-id="tp-s25-from-jinwol-01"]')!, later = group.querySelector('[data-trip-id="tp-s25-from-jinwol-03"]')!;
    expect(early.textContent).toContain('문서 운행요일: 월·화·수·목');
    expect(early.textContent).not.toContain('기본 운행요일 근거가 부족합니다.');
    expect(later.textContent).not.toContain('기본 운행요일 미확인');
    expect(early.textContent).toContain('15:30'); expect(later.textContent).toContain('17:30');
  });
  it('preserves query, selected place and comparison settings through exact-stop detail and return', async () => {
    window.location.hash = '#/search';
    const stop = getTripStops('tp-s25-to-songjeong-01')[1];
    const place: PlaceSelection = { provider: 'kakao', providerPlaceId: 'return-ui', selectionId: 'return-ui', kind: 'place', name: '복귀 검사용 장소', roadAddress: '광주광역시 서구 시험 주소', lotAddress: null, regionLabel: '광주광역시 서구', detailUrl: null, coordinates: stop.location!.coordinates.value, coordinateSource: 'synthetic test, not real search', selectedAt: '', selectionState: 'notSelected', validationState: 'checked' };
    vi.mocked(placeProvider.search).mockResolvedValueOnce({ items: [place], hasNext: false, page: 1 });
    const { container } = render(<App/>);
    fireEvent.change(screen.getByLabelText('이용 요일'), { target: { value: 'MON' } });
    fireEvent.change(screen.getByLabelText('어디에서 출발하시나요?'), { target: { value: '복귀 검사용' } });
    fireEvent.click(screen.getByRole('button', { name: '장소 검색' }));
    fireEvent.click(await screen.findByRole('button', { name: /복귀 검사용 장소/ }));
    fireEvent.change(screen.getByLabelText('비교할 직선거리 반경'), { target: { value: '1000' } });
    fireEvent.change(screen.getByLabelText('표시할 정류장 수'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('정류장에서 승차할 시각'), { target: { value: '06:00' } });
    const link = within(container.querySelector('.reference-candidates') as HTMLElement).getAllByRole('link', { name: /지점 승차.*상세 보기/ })[0];
    const openedTrip = dataset.trips.find(trip => trip.tripId === decodeURIComponent(link.getAttribute('href')!.split('/')[2]))!;
    await act(async () => { window.location.hash = link.getAttribute('href')!; window.dispatchEvent(new Event('hashchange')); });
    expect(within(container.querySelector('.page-section') as HTMLElement).getByRole('heading', { name: openedTrip.displayName, level: 1 })).toBeTruthy();
    const back = within(container.querySelector('.page-section') as HTMLElement).getByRole('link', { name: '← 장소 검색 결과로' });
    await act(async () => { window.location.hash = back.getAttribute('href')!; window.dispatchEvent(new Event('hashchange')); });
    expect(screen.getByRole('heading', { name: '선택한 장소 · 복귀 검사용 장소' })).toBeTruthy();
    expect((screen.getByLabelText('어디에서 출발하시나요?') as HTMLInputElement).value).toBe('복귀 검사용');
    expect((screen.getByLabelText('비교할 직선거리 반경') as HTMLSelectElement).value).toBe('1000');
    expect((screen.getByLabelText('표시할 정류장 수') as HTMLSelectElement).value).toBe('5');
    expect((screen.getByLabelText('정류장에서 승차할 시각') as HTMLInputElement).value).toBe('06:00');
    expect(vi.mocked(placeProvider.search)).toHaveBeenCalledTimes(1);
  });
  it('searches the full homeward timetable by a stop name and restores the original place conditions', async () => {
    window.location.hash = '#/search';
    const place = normalizePlace({ place_name: '모의 문화센터', address_name: '광주 서구 시험동', x: '126', y: '35' }, 'place')!;
    vi.mocked(placeProvider.search).mockResolvedValueOnce({ items: [place], hasNext: false, page: 1 });
    const { container } = render(<App/>);
    const placePanel = within(container.querySelector('.search-panel') as HTMLElement);
    fireEvent.click(placePanel.getByRole('button', { name: /^하교\s*학교 → 광주$/ }));
    fireEvent.change(placePanel.getByLabelText('이용 요일'), { target: { value: 'FRI' } });
    fireEvent.change(placePanel.getByLabelText('어디로 돌아가시나요?'), { target: { value: '문화센터' } });
    fireEvent.click(placePanel.getByRole('button', { name: '장소 검색' }));
    fireEvent.click(await placePanel.findByText('모의 문화센터'));
    fireEvent.change(placePanel.getByLabelText('학교에서 출발할 수 있는 시각'), { target: { value: '16:00' } });
    const stopField = placePanel.getByLabelText('하차 지점 이름') as HTMLInputElement;
    expect(stopField.value).toBe('');
    fireEvent.change(stopField, { target: { value: '서광주우체국' } });
    fireEvent.submit(stopField.form!);
    await waitFor(() => expect(container.querySelector('.page-heading h1')?.textContent).toBe('노선 목록'));
    expect(container.querySelector('.page-heading')?.textContent).toMatch(/학교 출발 16:00 이후.*조건을 풀어 모든 시각/);
    const list = container.querySelector('.trip-list')!;
    expect(list.children).toHaveLength(2);
    expect(list.children[1].textContent).toMatch(/송정⑦.*18:20/);
    expect(list.children[0].textContent).toContain('15:30');
    const routes = within(container.querySelector('.list-layout') as HTMLElement);
    fireEvent.change(routes.getByLabelText('이용 요일'), { target: { value: 'MON' } });
    fireEvent.click(routes.getByRole('button', { name: /^등교\s*광주 → 학교$/ }));
    await waitFor(() => expect(window.location.hash).toBe('#/routes/toCampus'));
    fireEvent.click(within(container.querySelector('.page-section') as HTMLElement).getByRole('link', { name: '← 장소 검색 결과로' }));
    await waitFor(() => expect(container.querySelector('.search-page-preserved[hidden]')).toBeNull());
    expect((placePanel.getByLabelText('이용 요일') as HTMLSelectElement).value).toBe('FRI');
    expect((placePanel.getByLabelText('학교에서 출발할 수 있는 시각') as HTMLInputElement).value).toBe('16:00');
    expect(document.activeElement).toBe(stopField);
    expect(stopField.value).toBe('서광주우체국');
    expect(vi.mocked(placeProvider.search)).toHaveBeenCalledTimes(1);
  });
});
