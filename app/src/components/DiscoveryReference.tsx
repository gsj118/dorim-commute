import { dataset } from '../data';
import { resolveDiscoveryAnchors, type DiscoveryAnchor } from '../data/discoveryAnchors';
import { isApartment } from '../domain/placeResults';
import type { PlaceSelection } from '../domain/types';

export const discoveryAnchors = resolveDiscoveryAnchors(dataset);

export function markerDescription(anchor: DiscoveryAnchor) {
  if (anchor.kind === 'facility') return `‘${anchor.label}’ 시설 위치`;
  const direction = anchor.direction === 'toCampus' ? '등교' : '하교';
  return `${direction} ${anchor.tripName} ‘${anchor.label}’ 표시점`;
}

export function approximateDistance(meters: number) {
  if (meters < 10) return '10m 미만';
  return `약 ${(Math.round(meters / 10) * 10).toLocaleString('ko-KR')}m`;
}

export function distanceOrigin(place: PlaceSelection | null) {
  return place?.kind === 'place' && isApartment(place) ? '단지' : '목적지';
}

export function DiscoveryDistance({ anchor, meters, origin }: { anchor: DiscoveryAnchor; meters: number; origin?: string }) {
  if (origin && anchor.kind === 'timetableMarker') {
    return <p className="discovery-distance">
      {origin}에서 <strong>‘{anchor.label}’</strong>까지 직선 <strong>{approximateDistance(meters)}</strong>
      <br/>거리 기준 · {anchor.direction === 'toCampus' ? '등교' : '하교'} {anchor.tripName} 지도 표시점
    </p>;
  }
  return <p className="discovery-distance">
    {origin || '선택한 장소'}에서 <strong>{markerDescription(anchor)}</strong>까지 직선 <strong>{approximateDistance(meters)}</strong>
  </p>;
}
