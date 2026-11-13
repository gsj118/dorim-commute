import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPlaceProvider, loadKakao, normalizePlace, type KakaoSdk, type RawPlace } from '../src/providers/kakao';
import { placeRegion } from '../src/domain/placeRegion';

function mockSdk(status = 'OK', rows: RawPlace[] = [{ id: 'fixture', place_name: '테스트 전용 장소', x: '126', y: '35', address_name: '테스트 주소' }], respond = true): KakaoSdk {
  const run = (_query: string, callback: (items: RawPlace[], status: string, pagination: { hasNextPage: boolean }) => void) => { if (respond) callback(rows, status, { hasNextPage: true }); };
  return { maps: { load: (callback: () => void) => callback(), services: { Status: { OK: 'OK', ERROR: 'ERROR', ZERO_RESULT: 'ZERO_RESULT' }, Places: class { keywordSearch = run; }, Geocoder: class { addressSearch = run; } } } } as unknown as KakaoSdk;
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
describe('Kakao adapter contract (synthetic SDK, not live API)', () => {
  it('applies the Gwangju envelope only to scoped place requests', async () => {
    const sdk = mockSdk();
    const record = vi.fn(new sdk.maps.services.Places().keywordSearch);
    sdk.maps.services.Places = class { keywordSearch = record; };
    const provider = createPlaceProvider(async () => sdk);
    await provider.search('힐스테이트', 'place', 1, placeRegion('힐스테이트'));
    await provider.search('나주 힐스테이트', 'place', 1, placeRegion('나주 힐스테이트'));
    await provider.search('힐스테이트', 'place');
    expect(record.mock.calls.map(([keyword, , options]) => [keyword, options.rect])).toEqual([
      ['광주 힐스테이트', '126.63,35.04,127.02,35.28'], ['나주 힐스테이트', undefined], ['힐스테이트', undefined],
    ]);
  });
  it('rejects absent key without inserting a script or sending a query', async () => {
    vi.stubEnv('VITE_KAKAO_MAP_JS_KEY', '');
    const scripts = document.scripts.length;
    await expect(loadKakao()).rejects.toMatchObject({ code: 'unavailable' });
    expect(document.scripts.length).toBe(scripts);
  });
  it('normalizes x=longitude/y=latitude and preserves explicit selection boundary', () => {
    const place = normalizePlace({ place_name: '테스트', x: '126.7', y: '35.1', place_url: 'javascript:alert(1)' }, 'place');
    expect(place?.coordinates).toEqual({ longitude: 126.7, latitude: 35.1, crs: 'WGS84' });
    expect(place?.detailUrl).toBeNull(); expect(place?.selectionState).toBe('notSelected');
    expect(normalizePlace({ place_name: '테스트', x: '', y: '35' }, 'place')).toBeNull();
    expect(normalizePlace({ place_name: '테스트', x: '126', y: '91' }, 'place')).toBeNull();
  });
  it('supports keyword and address modes with pagination and empty results', async () => {
    const provider = createPlaceProvider(async () => mockSdk());
    const result = await provider.search('테스트', 'place', 2);
    expect(result).toMatchObject({ page: 2, hasNext: true }); expect(result.items).toHaveLength(1);
    expect((await provider.search('테스트 주소', 'address')).items[0].kind).toBe('address');
    expect((await createPlaceProvider(async () => mockSdk('ZERO_RESULT', [])).search('테스트', 'place')).items).toEqual([]);
  });
  it('preserves the geocoder lot address separately from its road address', () => {
    const road = '광주 서구 합성로 10';
    const raw = { x: '126', y: '35', address_name: road, road_address: { address_name: road } };
    expect(normalizePlace(raw, 'address')?.lotAddress).toBeNull();
    expect(normalizePlace({ ...raw, address: { address_name: '광주 서구 시험동 1' } }, 'address'))
      .toMatchObject({ lotAddress: '광주 서구 시험동 1', roadAddress: road });
  });
  it('distinguishes provider failure, invalid coordinates, invalid input and timeout', async () => {
    await expect(createPlaceProvider(async () => mockSdk('ERROR')).search('테스트', 'place')).rejects.toMatchObject({ code: 'error' });
    await expect(createPlaceProvider(async () => mockSdk('OK', [{ place_name: 'bad', x: 'NaN', y: '35' }])).search('테스트', 'place')).rejects.toMatchObject({ code: 'error' });
    const load = vi.fn(async () => mockSdk());
    await expect(createPlaceProvider(load).search(' ', 'place')).rejects.toMatchObject({ code: 'invalid' }); expect(load).not.toHaveBeenCalled();
    vi.useFakeTimers();
    const delayed = createPlaceProvider(async () => mockSdk('OK', [], false)).search('테스트', 'place');
    const assertion = expect(delayed).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(10001); await assertion;
  });
});
