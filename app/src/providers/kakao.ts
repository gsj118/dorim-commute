import type { PlaceSelection } from '../domain/types';
import type { PlaceRegion } from '../domain/placeRegion';

export type SearchKind = 'place' | 'address';
export interface SearchPage { items: PlaceSelection[]; hasNext: boolean; page: number }
export class SearchError extends Error {
  constructor(public code: 'unavailable' | 'timeout' | 'error' | 'invalid', message: string) { super(message); }
}
export interface RawPlace { id?: string; place_name?: string; category_name?: string; address_name?: string; road_address_name?: string; place_url?: string; x?: string; y?: string; road_address?: { address_name?: string }; address?: { address_name?: string } }
type Callback = (items: RawPlace[], status: string, pagination?: { hasNextPage: boolean }) => void;
export interface KakaoSdk {
  maps: {
    load: (callback: () => void) => void;
    services: {
      Status: { OK: string; ZERO_RESULT: string; ERROR: string };
      Places: new () => { keywordSearch: (query: string, callback: Callback, options: { page: number; size: number; rect?: string }) => void };
      Geocoder: new () => { addressSearch: (query: string, callback: Callback, options: { page: number; size: number }) => void };
    };
    LatLng: new (lat: number, lng: number) => object;
    Map: new (element: HTMLElement, options: { center: object; level: number }) => { relayout: () => void; setBounds: (bounds: object) => void };
    LatLngBounds: new () => { extend: (position: object) => void };
    CustomOverlay?: new (options: { map: object; position: object; content: HTMLElement; yAnchor: number; zIndex: number }) => { setMap: (map: null) => void };
    Size: new (width: number, height: number) => object;
    MarkerImage: new (url: string, size: object) => object;
    event: { addListener: (target: object, event: string, callback: () => void) => void; removeListener: (target: object, event: string, callback: () => void) => void };
    Marker: new (options: { map: object; position: object; title: string; image?: object; zIndex?: number }) => { setMap: (map: null) => void };
  };
}
declare global { interface Window { kakao?: KakaoSdk } }
export const isKakaoConfigured = () => Boolean(import.meta.env.VITE_KAKAO_MAP_JS_KEY?.trim());
let pending: Promise<KakaoSdk> | null = null;
export function loadKakao(): Promise<KakaoSdk> {
  if (!isKakaoConfigured()) return Promise.reject(new SearchError('unavailable', '장소·주소 검색이 연결되지 않았습니다. 노선 목록을 이용해 주세요.'));
  if (pending) return pending;
  pending = new Promise<KakaoSdk>((resolve, reject) => {
    const script = document.createElement('script');
    let finished = false;
    const finish = (sdk?: KakaoSdk) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (sdk) resolve(sdk);
      else { script.remove(); reject(new SearchError('unavailable', '지도 서비스를 연결하지 못했습니다. 앱 권한·등록 도메인·네트워크 설정을 확인해 주세요.')); }
    };
    const timer = setTimeout(() => { if (!finished) { finished = true; script.remove(); reject(new SearchError('timeout', '지도 서비스 연결이 지연되고 있습니다. 다시 시도해 주세요.')); } }, 10000);
    script.async = true;
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(import.meta.env.VITE_KAKAO_MAP_JS_KEY)}&libraries=services&autoload=false`;
    script.onerror = () => finish();
    script.onload = () => {
      try { window.kakao?.maps.load(() => finish(window.kakao?.maps.services ? window.kakao : undefined)); }
      catch { finish(); }
    };
    document.head.append(script);
  }).catch(error => { pending = null; throw error; });
  return pending;
}

export function normalizePlace(raw: RawPlace, kind: SearchKind): PlaceSelection | null {
  const latitude = Number(raw.y), longitude = Number(raw.x);
  if (!raw.x?.trim() || !raw.y?.trim() || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  const name = raw.place_name || raw.address_name;
  if (!name) return null;
  let detailUrl: string | null = null;
  try { const url = new URL(raw.place_url || ''); if (url.protocol === 'https:' && (url.hostname === 'place.map.kakao.com' || url.hostname === 'map.kakao.com')) detailUrl = url.href; } catch { /* No detail link for address results. */ }
  const roadAddress = raw.road_address_name || raw.road_address?.address_name || null;
  const lotAddress = raw.address?.address_name || (raw.address_name !== roadAddress ? raw.address_name : null) || null;
  const fallbackId = kind === 'place' ? JSON.stringify([longitude, latitude, name, lotAddress, roadAddress]) : `${longitude},${latitude}`;
  return { provider: 'kakao', providerPlaceId: raw.id || null, selectionId: `${kind}:${raw.id || fallbackId}`, kind, name, categoryName: raw.category_name, roadAddress, lotAddress, regionLabel: (lotAddress || roadAddress || '').split(' ').slice(0, 2).join(' ') || null, detailUrl, coordinates: { latitude, longitude, crs: 'WGS84' }, coordinateSource: 'Kakao Web SDK services (x=경도, y=위도)', selectedAt: new Date().toISOString(), selectionState: 'notSelected', validationState: 'checked' };
}

export function createPlaceProvider(load: () => Promise<KakaoSdk> = loadKakao) {
  return {
    async search(query: string, kind: SearchKind, page = 1, region?: PlaceRegion): Promise<SearchPage> {
      if (!query.trim() || query.trim().length > 100 || !Number.isInteger(page) || page < 1 || page > 45) throw new SearchError('invalid', '검색어는 1~100자로 입력해 주세요.');
      const sdk = await load();
      return new Promise<SearchPage>((resolve, reject) => {
        let finished = false;
        const timer = setTimeout(() => { finished = true; reject(new SearchError('timeout', '검색 응답이 지연되고 있습니다. 다시 시도하거나 노선 목록을 이용해 주세요.')); }, 10000);
        const callback: Callback = (rows, status, pagination) => {
          if (finished) return;
          finished = true; clearTimeout(timer);
          if (status === sdk.maps.services.Status.ZERO_RESULT) return resolve({ items: [], hasNext: false, page });
          if (status !== sdk.maps.services.Status.OK) return reject(new SearchError('error', '장소 검색에 실패했습니다. 잠시 뒤 재시도하거나 주소 검색을 이용해 주세요.'));
          const items = rows.map(row => normalizePlace(row, kind)).filter((row): row is PlaceSelection => row !== null);
          if (rows.length && !items.length) return reject(new SearchError('error', '검색 결과의 좌표를 확인하지 못했습니다. 장소를 다시 검색해 주세요.'));
          resolve({ items, hasNext: Boolean(pagination?.hasNextPage), page });
        };
        try {
          if (kind === 'place') new sdk.maps.services.Places().keywordSearch(region?.keyword ?? query.trim(), callback, { page, size: 15, ...(region?.rect && { rect: region.rect }) });
          else new sdk.maps.services.Geocoder().addressSearch(query.trim(), callback, { page, size: 10 });
        } catch { if (!finished) { finished = true; clearTimeout(timer); reject(new SearchError('error', '검색 서비스 호출에 실패했습니다. 다시 시도해 주세요.')); } }
      });
    }
  };
}
export const placeProvider = createPlaceProvider();
