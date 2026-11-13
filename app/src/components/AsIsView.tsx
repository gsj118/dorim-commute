import { useEffect, useRef } from 'react';
import { dataset, getTripStops, getTripTime } from '../data';
import type { Weekday } from '../domain/types';
import { getRouteStopContext } from '../domain/routeStopContext';
import { usableLocation } from '../domain/recommend';
import { MapView } from './MapView';
import { TripConditions, tripConditionSummary } from './TripConditions';
import './asis.css';

const days: [Weekday, string][] = [['MON', '월요일'], ['TUE', '화요일'], ['WED', '수요일'], ['THU', '목요일'], ['FRI', '금요일'], ['SAT', '토요일'], ['SUN', '일요일']];
const home = '#/asis';
const tripHref = (id: string, stopId?: string) => `${home}/trip/${encodeURIComponent(id)}${stopId ? `/${encodeURIComponent(stopId)}` : ''}`;
const decode = (value: string | undefined) => { try { return decodeURIComponent(value || ''); } catch { return ''; } };

/** Own reimplementation of observed list exploration; official assets/code are not used. */
export function AsIsView({ path, weekday, onWeekday }: { path: string; weekday: Weekday | null; onWeekday: (value: Weekday | null) => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const locationHeadingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { (locationHeadingRef.current || headingRef.current)?.focus(); }, [path]);
  const pieces = path.replace(/^#?\/?/, '').split('/');
  const route = pieces[0] === 'asis' ? pieces.slice(1) : pieces;
  const isDetail = route[0] === 'trip';
  const trip = isDetail ? dataset.trips.find(item => item.tripId === decode(route[1])) : undefined;
  const direction = trip?.direction || (route[1] === 'fromCampus' ? 'fromCampus' : 'toCampus');
  const directionName = direction === 'toCampus' ? '등교' : '하교';
  const isHome = !route[0];
  const trips = dataset.trips.filter(item => item.direction === direction);
  const stops = trip ? getTripStops(trip.tripId) : [];
  const selectedId = decode(route[2]);
  const selected = stops.find(item => item.occurrence.tripStopId === selectedId);
  const coordinates = usableLocation(selected?.location) ? selected!.location!.coordinates.value : null;
  const timing = trip ? getTripTime(trip.tripId, weekday) : null;
  const rules = trip ? dataset.serviceRules.filter(rule => trip.serviceRuleIds.includes(rule.ruleId)) : [];
  const boarding = stops.find(item => item.stop.campusId && item.stop.role === 'boarding');

  return <section className="asis-view" aria-label="As-is 목록 탐색 재현">
    <div className="asis-disclaimer"><strong>As-is · 비교용 자체 재현</strong><p>기존 Unibus의 목록 → 운행편 → 정류장 위치 확인 구조를 참고했습니다. 실제 공식 서비스가 아닙니다. 두 방식은 같은 광주권 {dataset.trips.length}편·공식 PDF·표시점 데이터를 사용합니다.</p><p>원본 하교 공개 목록은 2항목만 관찰됐으나, 공정한 비교를 위해 이 화면은 PDF 광주권의 하교 {dataset.trips.filter(item => item.direction === 'fromCampus').length}편으로 보완했습니다. 좌표 미확보도 목록에 표시하며 현재 실제 운행을 보장하지 않습니다.</p></div>
    <div className="asis-sheet">
      <div className="asis-masthead">목포대학교 <span>노선정보 · 재현 화면</span></div>
      {isHome ? <div className="asis-home"><h1 tabIndex={-1} ref={headingRef}>통학버스 노선정보</h1><p>방향을 선택한 뒤 운행편 목록과 정류장을 순서대로 확인하세요.</p><div className="asis-home-actions"><a href={`${home}/routes/toCampus`}>등교 노선 보기 <span>광주 → 도림캠퍼스</span></a><a href={`${home}/routes/fromCampus`}>하교 노선 보기 <span>도림캠퍼스 → 광주</span></a></div><p className="asis-note">원본 로그인·예약·이용내역은 재현하지 않습니다.</p></div> : <>
        <nav className="asis-directions" aria-label="As-is 통학 방향"><a href={`${home}/routes/toCampus`} aria-current={direction === 'toCampus' ? 'page' : undefined}>등교</a><a href={`${home}/routes/fromCampus`} aria-current={direction === 'fromCampus' ? 'page' : undefined}>하교</a></nav>
        <div className="asis-page-title"><h1 tabIndex={-1} ref={headingRef}>{isDetail ? trip?.displayName || '수록되지 않은 운행편' : `${directionName} 노선 목록`}</h1><label>확인할 요일<select aria-label="As-is 확인할 요일" value={weekday || ''} onChange={event => onWeekday(event.target.value as Weekday || null)}><option value="">전체 자료 보기</option>{days.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label></div>
        {!isDetail ? <><ul className="asis-route-list" aria-label={`${directionName} 수록 운행편`}>{trips.map(item => { const first = getTripStops(item.tripId)[0]; const time = getTripTime(item.tripId, weekday); const condition = tripConditionSummary(item, weekday).text; return <li key={item.tripId} data-trip-id={item.tripId}><a href={tripHref(item.tripId)}><span><strong>{item.displayName}</strong>_{first.stop.displayName}_{time.value || '시각 미제공'}<small>{time.label}{time.isOverride ? ' · 금요일 대체' : ''}{condition && ` · ${condition}` }</small></span><span aria-hidden="true">›</span></a></li>; })}</ul><p className="asis-note">목록 시각은 등교 첫 지점 승차 / 하교 학교 출발 시각입니다. 상세에서 각 지점과 조건을 확인하세요.</p></> : trip ? <>
          <label className="asis-trip-select">운행편 선택<select aria-label="As-is 운행편 선택" value={trip.tripId} onChange={event => { window.location.hash = tripHref(event.target.value).slice(1); }}>{trips.map(item => <option value={item.tripId} key={item.tripId}>{item.displayName} · {getTripStops(item.tripId)[0].stop.displayName} · {getTripTime(item.tripId, weekday).value || '시각 미제공'}</option>)}</select></label>
          <div className="asis-trip-facts"><p>{trip.summary}</p><p><strong>{trip.direction === 'toCampus' ? '첫 승차 지점 시각' : timing?.label}: {timing?.value || '공식 시각 미제공'}</strong>{trip.direction === 'toCampus' && <span> · {stops.find(item => item.stop.role === 'boarding')?.stop.displayName || '승차 지점 확인 필요'}</span>}{timing?.isOverride && ' · 금요일 대체'}</p>{trip.direction === 'fromCampus' ? <p>학교 승차 위치: <strong>{boarding?.stop.locationDescription.value || '확인 필요'}</strong> · 광주 하차시각은 제공되지 않습니다.</p> : <p>각 지점의 시각은 승차 시각입니다. 학교 도착시각·소요시간은 제공되지 않습니다.</p>}{rules.filter(rule => rule.rawNote.value).map(rule => <p key={rule.ruleId}>{rule.rawNote.value}{rule.rawNote.value?.includes('금요일') && ' · 대체 시각이며 추가 편이 아닙니다.'}</p>)}{timing?.reason && <p>{timing.reason}</p>}</div>
          <TripConditions trip={trip} weekday={weekday}/><h2 className="asis-stops-heading">정류장과 위치</h2>
          <ol className="asis-stop-list">{stops.map((row, index) => { const { occurrence, stop } = row; const { time, viaCondition, conflictNote } = getRouteStopContext(dataset, row, weekday); const active = selectedId === occurrence.tripStopId; return <li key={occurrence.tripStopId} data-occurrence-id={occurrence.tripStopId} className={active ? 'asis-selected' : ''}><a href={tripHref(trip.tripId, occurrence.tripStopId)} aria-current={active ? 'location' : undefined}><span><strong>{index + 1}. {stop.displayName}</strong><span className="asis-location-copy">- {stop.locationDescription.value || '위치 설명 미확보'}</span><small>{stop.role === 'boarding' ? '승차' : stop.role === 'alighting' ? '하차' : '경유·종착'} · {time.value || conflictNote || viaCondition || '시각 미제공'} · {time.label}</small></span><span className="asis-location-action">위치 보기 <span aria-hidden="true">⌖</span></span></a></li>; })}</ol>
          {selected && <section className="asis-location" aria-labelledby="asis-location-heading"><h2 id="asis-location-heading" tabIndex={-1} ref={locationHeadingRef}>{selected.stop.displayName} 위치</h2><p>{selected.stop.locationDescription.value || '위치 설명 미확보'}</p><MapView coordinates={coordinates ? { lat: coordinates.latitude, lng: coordinates.longitude } : null} label={selected.stop.displayName}/>{coordinates && <><p>공식 Unibus 지도 표시점 · WGS84. 실제 도로변 승하차 위치·현재성은 확인이 필요합니다.</p><p>{selected.location?.coordinates.evidence.map(ref => `${ref.sourceId} · ${ref.locator}`).join(' / ')}</p><p>확인: {selected.location?.coordinates.reviewedAt}</p></>}{selected.occurrence.locationMapping && <p>이 편의 위치는 PDF 동일 방향·경유 순서에 따른 진월③ 표시점 참고 연결입니다. 진월① 자체 지도 확인은 미수행입니다.</p>}<p>실제 도로변 승하차 위치는 확인이 필요합니다.</p><a className="asis-text-link" href="https://mokpo.unibus.kr/#!/index" target="_blank" rel="noreferrer">공식 Unibus에서 확인 (새 창)</a></section>}
          <a className="asis-block-link" href={`${home}/routes/${trip.direction}`}>{directionName} 노선 목록으로</a>
        </> : <p className="asis-note">주소가 잘못되었거나 수록 범위 밖입니다. 방향별 목록에서 다시 선택하세요.</p>}
        <a className="asis-block-link" href={home}>재현 홈으로 가기</a>
      </>}
      <div className="asis-source-note"><strong>자료와 확인 수준</strong><p>S25 · 2026학년도 2학기 노선표(안) · 변경 가능. 적용 기간 2026.09.01~12.18. 공식 지도 표시점은 실제 도로변 검증과 다릅니다. 정확한 승하차 위치는 학교 안내를 확인하세요.</p><a className="asis-text-link" href="#/sources">출처와 한계 보기</a></div>
    </div>
  </section>;
}
