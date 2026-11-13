import { useEffect, useRef, useState } from 'react';
import { loadKakao, isKakaoConfigured } from '../providers/kakao';
export interface MapPoint { id: string; lat: number; lng: number; label: string; number?: number; href?: string; isDistanceReference?: boolean; }
const EMPTY: MapPoint[] = [];
export function MapView({ coordinates, label, stops = EMPTY, selectedId, onSelect, centerIsReference = false, homeward = false, emptyMessage }: { coordinates: { lat: number; lng: number } | null; label: string; stops?: MapPoint[]; selectedId?: string | null; onSelect?: (id: string) => void; centerIsReference?: boolean; homeward?: boolean; emptyMessage?: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const signature = JSON.stringify(stops);
  const onSelectRef = useRef(onSelect); onSelectRef.current = onSelect;
  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    setError(null);
    if (!coordinates || !isKakaoConfigured()) return;
    loadKakao().then(sdk => {
      if (cancelled || !container.current) return;
      const markers: { setMap: (map: null) => void }[] = [];
      const listeners: (() => void)[] = [];
      let observer: ResizeObserver | undefined;
      const clear = () => { observer?.disconnect(); listeners.forEach(remove => remove()); markers.forEach(marker => marker.setMap(null)); container.current?.replaceChildren(); };
      try {
        const center = new sdk.maps.LatLng(coordinates.lat, coordinates.lng);
        const map = new sdk.maps.Map(container.current, { center, level: 4 });
        const bounds = new sdk.maps.LatLngBounds(); bounds.extend(center);
        markers.push(new sdk.maps.Marker({ map, position: center, title: `${centerIsReference ? '거리 기준점' : '선택 장소'}: ${label}` }));
        const points = JSON.parse(signature) as MapPoint[];
        if (points.length && sdk.maps.CustomOverlay) {
          const caption = document.createElement('span');
          caption.className = 'map-place-caption';
          caption.textContent = label;
          markers.push(new sdk.maps.CustomOverlay({ map, position: center, content: caption, yAnchor: 0, zIndex: 11000 }));
        }
        const palette = getComputedStyle(container.current);
        const selectedFill = palette.getPropertyValue('--accent').trim() || '#007a3b';
        const pinFill = palette.getPropertyValue('--ink').trim() || '#1f1f1f';
        points.forEach((point, index) => {
          const number = point.number ?? index + 1;
          const position = new sdk.maps.LatLng(point.lat, point.lng); bounds.extend(position);
          const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="40"><path d="M17 39 4 22A16 16 0 1 1 30 22Z" fill="${point.id === selectedId ? selectedFill : pinFill}" stroke="white" stroke-width="2"/><text x="17" y="23" fill="white" text-anchor="middle" font-family="sans-serif" font-size="15" font-weight="bold">${number}</text></svg>`;
          const marker = new sdk.maps.Marker({ map, position, title: `${point.isDistanceReference ? '거리 기준점' : '참고 정류장'} ${number}: ${point.label}`, zIndex: point.id === selectedId ? 10000 : 1000 - index, image: new sdk.maps.MarkerImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, new sdk.maps.Size(34, 40)) });
          markers.push(marker);
          if (!onSelectRef.current && !point.href) return;
          const click = () => { if (onSelectRef.current) onSelectRef.current(point.id); else if (point.href) window.location.hash = point.href.replace(/^#/, ''); };
          sdk.maps.event.addListener(marker, 'click', click);
          listeners.push(() => sdk.maps.event.removeListener(marker, 'click', click));
        });
        if (points.length) map.setBounds(bounds);
        observer = new ResizeObserver(() => map.relayout()); observer.observe(container.current);
        cleanup = clear;
      } catch { clear(); setError('지도를 표시하지 못했습니다. 위치 텍스트와 후보 목록을 확인해 주세요.'); }
    }).catch(() => { if (!cancelled) setError('지도 연결에 실패했습니다. 위치 텍스트와 노선 목록은 계속 이용할 수 있습니다.'); });
    return () => { cancelled = true; cleanup?.(); };
  }, [coordinates?.lat, coordinates?.lng, label, signature, attempt, selectedId, centerIsReference]);
  if (!coordinates) return <div className="map-placeholder"><span aria-hidden="true">⌖</span><strong>{label}</strong><p>{emptyMessage ?? '검증된 숫자 좌표가 없어 지도 핀을 표시하지 않습니다.'}</p>{!emptyMessage && <small>시설 중심이나 반대 방향의 위치로 대체하지 않았습니다.</small>}</div>;
  if (!isKakaoConfigured()) return <div className="notice">지도 연결 설정이 필요합니다. 선택 장소의 이름과 주소를 확인해 주세요.</div>;
  return <div>{error && <div className="notice error"><p role="status">{error}</p><button onClick={() => setAttempt(value => value + 1)}>지도 다시 연결</button></div>}<div ref={container} className="map-canvas" role="region" aria-label={`${label} 지도`} style={{ height: 280 }} />{stops.length > 0 && <div className="map-legend">
    <p><strong>파란 핀 · {homeward ? '목적지' : '출발지'}</strong> {label}</p>
    {stops.length === 1 && !onSelect && !stops[0].href
      ? <p><strong>{stops[0].number ?? 1}번 · {stops[0].isDistanceReference ? '거리 기준점' : '정류장 표시점'}</strong> {stops[0].label}</p>
      : <p>번호는 각 후보의 거리 기준점이에요. {onSelect ? '번호를 누르면 해당 후보를 목록에서 볼 수 있어요.' : '번호를 누르면 운행편 상세를 볼 수 있어요.'}</p>}
  </div>}</div>;
}
