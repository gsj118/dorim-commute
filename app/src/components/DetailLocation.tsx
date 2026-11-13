import { dataset, getTripStops } from '../data';
import { usableLocation } from '../domain/recommend';
import { discoveryAnchors, markerDescription } from './DiscoveryReference';
import { Icon } from './Icon';
import { MapView } from './MapView';

type StopRow = ReturnType<typeof getTripStops>[number];

export function DetailLocation({ row, held, disputedCall, place, candidateNumber }: {
  row?: StopRow;
  place?: { name: string; coordinates: { latitude: number; longitude: number } | null } | null;
  candidateNumber?: number;
  held: boolean;
  disputedCall: boolean;
}) {
  const location = row?.location;
  const official = usableLocation(location) ? location.coordinates.value : null;
  const anchor = row && !official && !held ? discoveryAnchors.get(row.occurrence.tripStopId) : undefined;
  const point = official ?? anchor?.coordinates;
  const mapLabel = anchor ? markerDescription(anchor) : row?.stop.displayName || '정류장 위치';
  const homeward = row?.stop.direction === 'fromCampus';
  const referenceLabel = homeward && anchor?.kind === 'timetableMarker'
    ? `${anchor.direction === 'toCampus' ? '등교' : '하교'} ${anchor.tripName} 지도에 표시된 ‘${anchor.label}’`
    : mapLabel;
  const mapping = row?.occurrence.locationMapping;
  const sharedSource = mapping && dataset.trips.find(trip => trip.tripId === mapping.sourceTripId);
  const boarding = row?.stop.direction === 'toCampus' && row.stop.role === 'boarding';
  if (homeward && row?.stop.campusId && row.stop.role === 'boarding' && !point) {
    return <div className="location-panel"><h2 tabIndex={-1}>학교 승차 위치</h2><p>{row.stop.locationDescription.value || row.stop.displayName}</p></div>;
  }
  let locationNote = '실제 도로변 승하차 위치는 확인이 필요합니다.';
  if (sharedSource) locationNote = `${sharedSource.displayName}의 같은 방향·경유 순서를 참고한 지도 표시점입니다. 실제 도로변 위치는 확인이 필요합니다.`;
  else if (boarding && disputedCall) locationNote = `${row.stop.displayName}에서 탈 수 있는지 학교에 먼저 확인해 주세요.`;
  else if (boarding && official) locationNote = '공식 Unibus 지도에 표시된 위치예요.';
  return <div className="location-panel">
    <h2 tabIndex={-1}>{row ? row.stop.displayName : '정류장 위치 확인'}</h2>
    {anchor ? <div className="detail-reference" data-distance-kind="reference-point">
      <p><strong>{homeward ? '정확한 하차 위치는 확인되지 않았어요.' : '실제 승차 위치 미확인'}</strong></p>
      <p>{homeward ? '거리를 잰 기준점' : '지도에 표시한 거리 기준점'} · <strong>{referenceLabel}</strong></p>
    </div> : <p>{row ? locationNote : '정류장을 선택하면 위치 설명을 확인할 수 있어요.'}</p>}
    <MapView coordinates={point && place?.coordinates ? { lat: place.coordinates.latitude, lng: place.coordinates.longitude }
      : point ? { lat: point.latitude, lng: point.longitude } : null}
      label={point && place?.coordinates ? place.name : mapLabel}
      stops={point && place?.coordinates && row ? [{ id: row.occurrence.tripStopId, lat: point.latitude, lng: point.longitude, label: mapLabel, number: candidateNumber, isDistanceReference: !!anchor }] : undefined}
      homeward={homeward} centerIsReference={!!anchor && !place?.coordinates}
      emptyMessage={boarding ? '정확한 위치를 확인할 수 없어 지도에 표시하지 않았어요.' : undefined}/>
    {anchor && <details className="stop-coordinate-evidence">
      <summary>거리 기준점의 출처</summary>
      <p>{anchor.rationale}</p><a href={anchor.sourceUrl} target="_blank" rel="noreferrer">{anchor.sourceLabel}</a>
    </details>}
    {official && location && <details className="stop-coordinate-evidence">
      <summary>지도 위치의 출처</summary>
      <p>공식 Unibus 지도 표시 좌표 · WGS84. 실제 도로변 승하차 위치·현재성은 미확인입니다.</p>
      <p>{location.coordinates.evidence.map(ref => `${ref.sourceId} · ${ref.locator}`).join(' / ')}</p>
      <p>확인 {location.coordinates.reviewedAt}</p><a href="https://mokpo.unibus.kr/#!/index" target="_blank" rel="noreferrer">공식 Unibus에서 확인</a>
    </details>}
    {(boarding || anchor || sharedSource) && <div className="location-footnote"><Icon name="info"/><p>{boarding
      ? disputedCall ? '이 정류장을 이용한다면 승차 시각과 타는 곳을 함께 문의해 주세요.' : '타기 전에 어느 쪽 도로변인지 확인해 주세요.'
      : homeward && row?.stop.role === 'alighting' ? '정확히 어느 쪽 도로변에서 내리는지 확인해 주세요.' : '실제 도로변 승하차 위치는 확인이 필요합니다.'}</p></div>}
  </div>;
}
