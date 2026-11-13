import { useEffect, useImperativeHandle, useMemo, useRef, useState, type FormEvent, type MouseEvent, type Ref } from 'react';
import type { Direction, PlaceSelection, TimeCondition, Weekday } from '../domain/types';
import { dataset, getStopTime, getTripStops, getTripTime } from '../data';
import { candidateGroupKey, evaluateRecommendations, groupRecommendationCandidates, reasonLabels, SEARCH_SETTINGS, type ComparableCandidate } from '../domain/recommend';
import { isKakaoConfigured, placeProvider, type SearchKind } from '../providers/kakao';
import { flushSync } from 'react-dom';
import { MoreResults } from './MoreResults';
import { initialPicker, PlacePicker } from './PlacePicker';
import { MapView } from './MapView';
import { RelationEvidence } from './RelationEvidence';
import { dayNames } from './TripConditions';
import { DirectionCoverage } from './DirectionCoverage';
import { DiscoveryDistance, discoveryAnchors, distanceOrigin, markerDescription } from './DiscoveryReference';
import { fridayDepartureNote } from '../domain/time';
import { placeAreaLabel, placeRegion } from '../domain/placeRegion';
import { groupPlaceResults, missingRequestedFacility, requestedFacility, withoutApartmentPhase, type PlaceSection } from '../domain/placeResults';
import type { createVisits } from '../navigation';
const OFFICIAL = 'https://mokpo.unibus.kr/#!/index';
export const candidateHref = (item: { tripId: string; occurrenceId: string }) => `#/trip/${encodeURIComponent(item.tripId)}/${encodeURIComponent(item.occurrenceId)}`;
type Candidate = ComparableCandidate;
export interface PlaceSearchActions {
  prepare: (query: string) => void;
  clear: () => void;
  snapshot: () => () => void;
}
export function PlaceSearch({ direction, weekday, initialQuery = '', onDirectionChange, onOpenTimetable, onSelectionChange, visits, visible = true, ref }: {
  direction: Direction; weekday: Weekday | null;
  initialQuery?: string;
  onDirectionChange?: (direction: Direction) => void;
  onOpenTimetable?: (query: string, timeScope: string, trigger: HTMLElement) => void;
  onSelectionChange?: (selected: PlaceSelection | null) => void;
  visits?: ReturnType<typeof createVisits>;
  visible?: boolean;
  ref?: Ref<PlaceSearchActions>;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [kind, setKind] = useState<SearchKind>('place');
  const [places, setPlaces] = useState<PlaceSection[] | null>(null);
  const [picker, setPicker] = useState(initialPicker);
  const [expandedStopLimit, setExpandedStopLimit] = useState<number | null>(null);
  const [nationwide, setNationwide] = useState(false);
  const region = kind === 'place' ? placeRegion(query) : null;
  const placeCount = places?.reduce((sum, section) => sum + section.items.length, 0) ?? 0;
  const missingFacility = places && region && missingRequestedFacility(places, requestedFacility(region.nationwideKeyword));
  const apartmentSection = places?.find(section => section.numberedComplexes || section.title === '아파트 단지');
  const broaderQuery = apartmentSection?.numberedComplexes && region && withoutApartmentPhase(region.nationwideKeyword)
    ? withoutApartmentPhase(nationwide ? region.nationwideKeyword : query) : '';
  const scopeLabel = kind === 'address' ? '주소' : nationwide ? '전국' : region?.label;
  const [selected, setSelected] = useState<PlaceSelection | null>(null);
  useEffect(() => { onSelectionChange?.(selected); }, [selected, onSelectionChange]);
  const [radius, setRadius] = useState<number>(SEARCH_SETTINGS.radiusMeters);
  const [maxResults, setMaxResults] = useState<number>(SEARCH_SETTINGS.maxResults);
  const [sortBy, setSortBy] = useState<'distance' | 'time'>('distance');
  const [timeInput, setTimeInput] = useState('');
  const [timeMode, setTimeMode] = useState<'boardingAfter' | 'boardingBefore'>('boardingAfter');
  const [activeLocation, setActiveLocation] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [error, setError] = useState('');
  const [mapOpen, setMapOpen] = useState(false);
  const mapHeading = useRef<HTMLHeadingElement>(null);
  const mapSummary = useRef<HTMLElement>(null);
  const candidateButton = (id?: string | null) => document.querySelector<HTMLElement>(
    id ? `.candidate-card[data-location-id="${CSS.escape(id)}"] .candidate-map-button` : '.candidate-map-button');
  function moveWithinResults(from: () => HTMLElement | null, to: () => HTMLElement | null, update: () => void) {
    const entry = visits?.current;
    if (entry) {
      const top = window.scrollY;
      entry.restoreViewport = () => {
        from()?.focus({ preventScroll: true });
        window.scrollTo({ top, behavior: 'instant' });
      };
    }
    const next = visits?.pushStep();
    const reveal = () => {
      const target = to();
      target?.focus({ preventScroll: true });
      target?.scrollIntoView?.({ block: 'start', behavior: 'instant' });
    };
    if (next) next.restoreViewport = reveal;
    flushSync(update);
    reveal();
  }
  function showMap(id?: string) {
    moveWithinResults(() => id ? candidateButton(id) : mapSummary.current, () => mapHeading.current, () => {
      if (id) setActiveLocation(id);
      setMapOpen(true);
    });
  }
  const changePlace = () => {
    if (visits?.backTo(entry => entry.placeStep === 'results')) return;
    setMapOpen(false); setSelected(null); setTimeout(() => document.getElementById('place-query')?.focus(), 0);
  };
  const generation = useRef(0);
  const resultsSummary = useRef<HTMLElement>(null);
  const resultNotice = useRef<HTMLDivElement>(null);
  const selectedHeading = useRef<HTMLHeadingElement>(null);
  const restoring = useRef(false);
  const editorRef = useRef<HTMLDetailsElement>(null);
  const optionsRef = useRef<HTMLDetailsElement>(null);
  const visitId = visits?.current.id;
  useEffect(() => {
    if (!visits || !visible) return;
    const entry = visits.current;
    entry.placeStep = selected ? 'selected' : state !== 'idle' ? 'results' : 'form';
    entry.restorePlace = snapshot();
  }, [visits, visitId, visible, query, kind, places, picker, nationwide, selected, error, state, mapOpen, activeLocation,
    radius, maxResults, sortBy, timeInput, timeMode, expandedStopLimit]);
  function snapshot() {
    const optionsOpen = optionsRef.current?.open ?? false;
    return () => {
      generation.current++;
      restoring.current = true;
      setQuery(query); setKind(kind); setPlaces(places); setNationwide(nationwide); setPicker(picker);
      setSelected(selected); setError(error); setState(state === 'loading' ? 'idle' : state);
      setMapOpen(mapOpen); setActiveLocation(activeLocation); setRadius(radius); setMaxResults(maxResults);
      setSortBy(sortBy); setTimeInput(timeInput); setTimeMode(timeMode); setExpandedStopLimit(expandedStopLimit);
      if (optionsRef.current) optionsRef.current.open = optionsOpen;
    };
  }
  const oppositeDirection = direction === 'toCampus' ? 'fromCampus' : 'toCampus';
  const listLink = `#/routes/${direction}`;
  useEffect(() => {
    generation.current++;
    if (restoring.current) return;
    // The selected place is independent of the commute direction. Times and stop highlights are not.
    setState(current => current === 'loading' ? 'idle' : current);
    setTimeInput(''); setTimeMode('boardingAfter'); setActiveLocation(null); setMapOpen(false);
    return () => { generation.current++; };
  }, [direction]);
  useEffect(() => {
    if (!restoring.current) { setExpandedStopLimit(null); setActiveLocation(null); }
  }, [selected, direction, weekday, radius, maxResults, sortBy, timeInput, timeMode]);
  useEffect(() => { restoring.current = false; });
  const clearResults = () => {
    generation.current++;
    setNationwide(false); setPlaces(null); setSelected(null);
    setPicker(initialPicker);
    setState('idle'); setError(''); setActiveLocation(null);
  };
  const invalidate = () => {
    if (visits && visits.current.placeStep !== 'form') visits.pushStep();
    clearResults();
  };
  function changeKind(next: SearchKind) {
    if (kind === next) return;
    invalidate();
    setKind(next);
  }
  useImperativeHandle(ref, () => ({
    snapshot,
    clear() {
      clearResults(); setQuery(''); setKind('place'); setMapOpen(false);
      setRadius(SEARCH_SETTINGS.radiusMeters); setMaxResults(SEARCH_SETTINGS.maxResults); setSortBy('distance');
      setTimeInput(''); setTimeMode('boardingAfter'); setExpandedStopLimit(null);
      if (optionsRef.current) optionsRef.current.open = false;
      if (editorRef.current) editorRef.current.open = true;
    },
    prepare(input) {
      clearResults(); setKind('place'); setQuery(input); setMapOpen(false);
      requestAnimationFrame(() => document.querySelector<HTMLInputElement>('.search-page-preserved:not([hidden]) #place-query')?.focus());
    },
  }));
  const search = async (expand = false, input = query) => {
    if (state !== 'error' || selected) visits?.pushStep();
    setPicker(initialPicker);
    const id = ++generation.current;
    const searchRegion = kind === 'place' ? placeRegion(input) : null;
    setQuery(input);
    setNationwide(expand); setPlaces(null);
    setState('loading'); setError(''); setSelected(null); setActiveLocation(null); setMapOpen(false);
    try {
      const matches = new Map<string, PlaceSelection>();
      for (let sourcePage = 1; sourcePage <= 45; sourcePage++) {
        const batch = searchRegion && !expand
          ? await placeProvider.search(input, kind, sourcePage, searchRegion)
          : await placeProvider.search(searchRegion?.nationwideKeyword ?? input, kind, sourcePage);
        if (id !== generation.current) return;
        for (const item of batch.items) {
          if (!searchRegion || expand || searchRegion.matches(item.lotAddress || item.roadAddress || '')) matches.set(item.selectionId, item);
        }
        if (!batch.hasNext) break;
      }
      const items = Array.from(matches.values());
      const sections = searchRegion ? groupPlaceResults(searchRegion.nationwideKeyword, items) : [{ title: null, items }];
      flushSync(() => { setPlaces(sections); setState('ready'); });
    } catch (reason) {
      if (id !== generation.current) return;
      flushSync(() => {
        setError(reason instanceof Error ? reason.message : '검색에 실패했습니다. 다시 시도해 주세요.');
        setState('error');
      });
    }
    const target = resultNotice.current || resultsSummary.current;
    if (!target || target.closest('[hidden]')) return;
    target.focus({ preventScroll: true });
    target.scrollIntoView?.({ block: 'start', behavior: 'instant' });
  };
  const submit = (event: FormEvent) => { event.preventDefault(); void search(); };
  const timeCondition = useMemo<TimeCondition | null>(() => /^\d{2}:\d{2}$/.test(timeInput) ? {
    kind: direction === 'fromCampus' ? 'campusReadyAfter' : timeMode,
    minutes: Number(timeInput.slice(0, 2)) * 60 + Number(timeInput.slice(3)),
  } : null, [direction, timeMode, timeInput]);
  const timeScope = timeCondition ? `${direction === 'fromCampus' ? '학교 출발' : '지점 승차'} ${timeInput} ${timeCondition.kind === 'boardingBefore' ? '이전' : '이후'}` : '';
  const openFullTimetable = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!onOpenTimetable || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onOpenTimetable('', timeScope, event.currentTarget);
  };
  const selectedArea = selected ? placeAreaLabel(selected, nationwide) : '';
  const homeward = direction === 'fromCampus';
  const originLabel = homeward ? distanceOrigin(selected) : undefined;
  const result = useMemo(() => selected ? evaluateRecommendations(dataset, {
    direction, weekday, place: selected, radiusMeters: radius, maxResults, sortBy, timeCondition,
  }, discoveryAnchors) : null, [direction, weekday, selected, radius, maxResults, sortBy, timeCondition]);
  const nearby: Candidate[] = result ? [...result.candidates, ...result.references].sort((a, b) => (sortBy === 'time' ? (a.time || '99:99').localeCompare(b.time || '99:99') : 0) || a.distanceMeters - b.distanceMeters || a.occurrenceId.localeCompare(b.occurrenceId)) : [];
  const groups = groupRecommendationCandidates(nearby);
  const timeLabel = direction === 'fromCampus' ? '학교 출발' : '지점 승차';
  const boardingByTrip = new Map<string, string>();
  if (direction === 'fromCampus') {
    for (const tripId of new Set(nearby.map(candidate => candidate.tripId))) {
      const school = getTripStops(tripId).find(({ stop }) => stop.campusId && stop.role === 'boarding')?.stop;
      if (school?.locationDescription.value) {
        boardingByTrip.set(tripId, `학교에서 타는 곳 · ${school.locationDescription.value}`);
      }
    }
  }
  const sharedBoarding = nearby.length && nearby.every(candidate => boardingByTrip.get(candidate.tripId) === boardingByTrip.get(nearby[0].tripId))
    ? boardingByTrip.get(nearby[0].tripId) : undefined;
  const withinKm = groups.filter(group => group.distanceMeters <= 1000).length;
  const initialStopLimit = sortBy === 'time' ? 3 : withinKm ? Math.min(withinKm, 4) : 2;
  const stopStep = sortBy === 'distance' ? 2 : 3;
  const stopLimit = Math.min(groups.length, expandedStopLimit ?? initialStopLimit);
  const mapStops = groups.flatMap(group => {
    const item = group.relations[0];
    const id = candidateGroupKey(item);
    const anchor = item.anchor;
    const point = anchor?.coordinates ?? dataset.locations.find(location => location.locationId === item.locationId)?.coordinates.value;
    const stopName = dataset.stops.find(stop => stop.stopId === item.stopId)?.displayName || item.stopId;
    const label = anchor ? markerDescription(anchor) : stopName;
    return point ? [{ id, lat: point.latitude, lng: point.longitude, label, isDistanceReference: !!anchor, href: candidateHref(item) }] : [];
  });
  const selectedLocation = activeLocation && mapStops.some(point => point.id === activeLocation) ? activeLocation : null;
  function renderCandidateGroup(items: Candidate[], index: number) {
    const item = items[0];
    const id = candidateGroupKey(item);
    const anchor = item.anchor;
    const stop = dataset.stops.find(stop => stop.stopId === item.stopId)!;
    const location = dataset.locations.find(location => location.locationId === (anchor?.locationId ?? item.locationId));
    const candidateReasons = (candidate: Candidate) => ('reasons' in candidate ? candidate.reasons : []).filter(reason => !['OFFICIAL_MARKER_ONLY', 'STALE_OR_NOT_LIVE'].includes(reason));
    const reasons = candidateReasons(items[0]).filter(reason => items.every(candidate => candidateReasons(candidate).includes(reason)));
    // Only annotate similar spelling; never merge different location IDs.
    const nameKey = (name: string) => name.replace(/[\s_·]/g, '');
    const sameName = groups.filter(group => nameKey(dataset.stops.find(s => s.stopId === group.stopId)?.displayName || '') === nameKey(stop.displayName)).length > 1;
    const compactReasons = (codes: string[]) => codes.filter(code =>
      !['WEEKDAY_REQUIRED_FOR_MATCH', 'WEEKDAY_UNVERIFIED', 'DISCOVERY_ANCHOR'].includes(code) && !(anchor && code === 'POSITION_UNVERIFIED')
    ).map(code => ({ CALL_PERMISSION_UNVERIFIED: '실제 승하차 가능 여부 확인 필요', SHARED_SEQUENCE_LOCATION: '다른 편의 지도 위치를 참고 연결 · 이 편 위치 미확인', REQUIRED_TIME_UNVERIFIED: '적용 시각 확인 필요' }[code] || reasonLabels[code] || code));
    const weekdayNotes = items.map(({ tripId }) => {
      const trip = dataset.trips.find(trip => trip.tripId === tripId)!;
      return trip.serviceRuleIds.flatMap(ruleId => {
        const days = dataset.serviceRules.find(rule => rule.ruleId === ruleId)?.weekdays;
        return days?.verificationStatus === 'VERIFIED' && days.conditionCheck === 'checked' && days.value?.length
          ? [days.value.map(day => dayNames[day]).join('·')] : [];
      });
    });
    const commonCall = homeward && reasons.includes('CALL_PERMISSION_UNVERIFIED');
    const checks = compactReasons(commonCall ? reasons.filter(code => code !== 'CALL_PERMISSION_UNVERIFIED') : reasons);
    if (commonCall) checks.unshift(`${stop.displayName}에서 내릴 수 있는지는 이용 전에 확인해 주세요.`);
    if (!anchor) checks.unshift('실제 도로변 위치 확인 필요');
    const homewardReasons: Record<string, string> = {
      CALL_PERMISSION_UNVERIFIED: `${stop.displayName}에서 내릴 수 있는지는 이용 전에 확인해 주세요.`,
      DISCOVERY_ANCHOR: '시간표에는 이 지점이 나와요. 지도에는 거리를 잴 때 참고한 위치를 표시했어요.',
      POSITION_UNVERIFIED: '실제로 내릴 도로변 위치와 좌표는 확인되지 않았어요.',
    };
    const pendingTimes = items.filter(row => candidateReasons(row).includes('REQUIRED_TIME_UNVERIFIED'));
    if (homeward && !weekday && pendingTimes.length && pendingTimes.every(row => row.time && getTripTime(row.tripId, 'FRI').isOverride)) {
      homewardReasons.REQUIRED_TIME_UNVERIFIED = '이용할 요일에 맞는 출발 시각을 확인해 주세요.';
    }
    return <li key={id} className={`candidate-card ${selectedLocation === id ? 'is-highlighted' : ''}`} data-occurrence-id={item.occurrenceId} data-distance-meters={item.distanceMeters} data-location-id={id} data-distance-kind={anchor ? 'reference-point' : 'stop-marker'}>
      <div className="candidate-stop-heading"><h5><span className="candidate-number">{index + 1}</span>{stop.displayName}</h5><span className="trip-count">{homeward ? '시간표에 실린' : '운행편'} {new Set(items.map(row => row.tripId)).size}편</span></div>
      {anchor ? <>
        <DiscoveryDistance anchor={anchor} meters={item.distanceMeters} origin={originLabel}/>
        <p className="candidate-location"><strong>{homeward ? '정확한 하차 위치는 확인되지 않았어요.' : '실제 승차 위치 미확인'}</strong></p>
      </> : <>
        <p className="stop-marker-distance">선택한 장소에서 {direction === 'toCampus' ? '승차' : '하차'} 지점의 지도 표시점까지 직선 <strong>{Math.round(item.distanceMeters)}m</strong></p>
        <p className="candidate-location">{direction === 'toCampus' ? '등교 승차' : '하교 하차'}{sameName ? ' · 이름이 같은 다른 결과의 거리 기준도 확인하세요.' : ''}</p>
      </>}

      <div className="trip-columns" aria-hidden="true"><span>운행편</span><span>{timeLabel}</span></div>
      <div className="candidate-trip-list candidate-relations">{items.map((candidate, tripIndex) => {
        const trip = dataset.trips.find(trip => trip.tripId === candidate.tripId)!;

        const reference = 'reasons' in candidate;
        const base = getTripTime(trip.tripId, null), friday = getTripTime(trip.tripId, 'FRI');
        const timing = direction === 'fromCampus' ? getTripTime(trip.tripId, weekday) : getStopTime(candidate.occurrenceId, weekday);
        const fridayNote = homeward && candidate.time ? fridayDepartureNote(base.value, friday, weekday) : null;
        const specificReasons = candidateReasons(candidate).filter(reason => !reasons.includes(reason) && !(fridayNote && reason === 'REQUIRED_TIME_UNVERIFIED' && !weekday && !timeCondition && candidate.time === base.value));
        const days = weekdayNotes[tripIndex];
        return <article className="candidate-trip" key={candidate.occurrenceId} data-trip-id={candidate.tripId} data-occurrence-id={candidate.occurrenceId}>
          {!reference && <span className="candidate-status">문서 조건 일치</span>}
          <a className="candidate-detail-link" href={candidateHref(candidate)}>
            <span className="sr-only">{stop.displayName} · </span><span className="trip-name">{trip.displayName}</span>
            <span className="candidate-time"><span className="sr-only">{timeLabel} </span><span className="clock-line"><strong>{candidate.time || '시각 조건 확인 필요'}</strong>{fridayNote && !weekday && <span className="clock-qualifier">기본</span>}</span>
              {fridayNote ? <small>{fridayNote}</small> :
                candidate.time && !timing.conditionConfirmed && <small>적용 요일 확인 필요</small>}
            </span>
            <span aria-hidden="true">›</span><span className="sr-only"> 상세 보기</span>
          </a>
          {days.length > 0 && <p>문서 운행요일: {[...new Set(days)].join(' / ')}</p>}
          {direction === 'fromCampus' && !sharedBoarding && <p>{boardingByTrip.get(trip.tripId) || '학교 승차 위치 확인 필요'}</p>}

          {compactReasons(specificReasons).length > 0 && <p className="candidate-checks">{compactReasons(specificReasons).join(' · ')}</p>}
        </article>;
      })}</div>
      <p className="candidate-checks">{checks.join(' · ')}</p>
      <button className="candidate-map-button" aria-pressed={selectedLocation === id} onClick={() => showMap(id)}>지도에서 {index + 1}번 {homeward ? '기준점 보기' : '강조'}</button>
      <details className="candidate-evidence"><summary>{homeward ? '거리 기준과 위치 출처' : '위치 설명·출처'}</summary>
        {anchor && <><p>거리 기준 · {markerDescription(anchor)}. {anchor.rationale}</p><a href={anchor.sourceUrl} target="_blank" rel="noreferrer">{anchor.sourceLabel}</a></>}
        <ul className="candidate-reasons">{[...new Set(items.flatMap(candidateReasons))].filter(reason => reason !== 'WEEKDAY_UNVERIFIED').map(reason => <li key={reason}>{(homeward && homewardReasons[reason]) || reasonLabels[reason] || reason}</li>)}</ul>
        <p>{stop.locationDescription.value}</p><p>운행·시각은 S25 노선표(안)의 해당 편을 기준으로 합니다.</p>
        {location && <><p>{location.coordinates.evidence.map(ref => `${ref.sourceId} · ${ref.locator}`).join(' / ')}</p><p>좌표 확인 {location.coordinates.reviewedAt || '미기록'} · WGS84 · {location.positionKind === 'officialMapMarker' ? '공식 표시점, 실제 도로변 미검증' : '상세 근거 참조'}</p></>}
        <a href={OFFICIAL} target="_blank" rel="noreferrer">공식 Unibus에서 추가 확인</a>
      </details>
    </li>;
  }
  return <section className="place-search" aria-label="장소 기반 탐색">
    <details ref={editorRef} className="search-editor" open={!selected}><summary>다른 장소 검색</summary><div className="search-endpoints"><div><small>{direction === 'toCampus' ? '출발지' : '목적지'}</small><strong>{selected?.name || '광주권의 익숙한 장소'}</strong></div><span aria-hidden="true">{direction === 'toCampus' ? '→' : '←'}</span><div><small>{direction === 'toCampus' ? '목적지 · 고정' : '출발지 · 고정'}</small><strong>목포대학교 도림캠퍼스</strong></div></div>
    <form onSubmit={submit}>
      <div className="search-kind" role="group" aria-label="검색 종류"><button type="button" aria-pressed={kind === 'place'} onClick={() => changeKind('place')}>장소명</button><button type="button" aria-pressed={kind === 'address'} onClick={() => changeKind('address')}>주소</button></div>
      <label htmlFor="place-query">{direction === 'toCampus' ? '어디에서 출발하시나요?' : '어디로 돌아가시나요?'}</label>
      <div className="search-input-row"><input id="place-query" value={query} maxLength={100} placeholder={kind === 'place' ? '아파트, 건물, 상가, 학교 이름' : '도로명 또는 지번 주소'} autoComplete="off" onChange={event => { invalidate(); setQuery(event.target.value); }} aria-describedby={kind === 'place' ? 'search-region search-privacy search-connection' : 'search-privacy search-connection'}/><button className="primary-button" disabled={!query.trim() || state === 'loading'}>{state === 'loading' ? '검색 중…' : '장소 검색'}</button></div>
      {kind === 'place' && <p id="search-region" className="muted">장소명만 입력하면 광주에서 먼저 찾아요. 다른 지역은 ‘나주 힐스테이트’처럼 지역명을 함께 입력하세요.</p>}
      <p id="search-privacy" className="muted">검색어는 Kakao로 전송됩니다. 집주소·위치 권한 없이 검색할 수 있어요.</p>
    </form></details>
    <details ref={optionsRef} className="time-options"><summary>세부 검색 조건 <span>· {radius / 1000}km · {sortBy === 'distance' ? '직선거리순' : '시각순'}{timeInput ? ` · ${timeInput} ${direction === 'toCampus' && timeMode === 'boardingBefore' ? '이전' : '이후'}` : ''}</span></summary>      <div className="comparison-settings"><label className="candidate-radius">비교할 직선거리 반경<select value={radius} onChange={event => setRadius(Number(event.target.value))}>{SEARCH_SETTINGS.radiusChoices.map(value => <option key={value} value={value}>{value / 1000}km</option>)}</select></label><label>표시할 정류장 수<select value={maxResults} onChange={event => setMaxResults(Number(event.target.value))}>{SEARCH_SETTINGS.resultChoices.map(value => <option key={value} value={value}>최대 {value}곳</option>)}</select></label><label>후보 정렬<select value={sortBy} onChange={event => setSortBy(event.target.value as typeof sortBy)}><option value="distance">지도 기준점이 가까운 순</option><option value="time">{direction === 'toCampus' ? '승차시각순' : '학교 출발시각순'}</option></select></label></div>
<div className="time-fields"><label htmlFor="candidate-time">{direction === 'toCampus' ? '정류장에서 승차할 시각' : '학교에서 출발할 수 있는 시각'}<input id="candidate-time" type="time" value={timeInput} onChange={event => setTimeInput(event.target.value)}/></label>{direction === 'toCampus' && <label htmlFor="candidate-time-mode">시간 기준<select id="candidate-time-mode" value={timeMode} onChange={event => setTimeMode(event.target.value as typeof timeMode)}><option value="boardingAfter">입력 시각 이후 승차</option><option value="boardingBefore">입력 시각 이전 승차</option></select></label>}{timeInput && <button onClick={() => setTimeInput('')}>시간 조건 지우기</button>}</div><p className="muted">{direction === 'toCampus' ? '공식 정류장 승차시각만 비교합니다. 학교 도착 목표시각은 판정하지 않습니다.' : '공식 학교 출발시각이 입력 시각 이후인 편을 비교합니다. 하차 도착시각은 추정하지 않습니다.'} 요일에 따라 시각이 달라지는 편은 요일을 선택해야 시간조건을 확인할 수 있습니다.</p></details>
    {!isKakaoConfigured() ? <div id="search-connection" className="notice"><strong>장소 검색 연결 준비 중</strong><p>Kakao JavaScript 키가 설정되지 않아 실제 장소·주소 검색과 지도 연결을 사용할 수 없습니다. 아래 노선 목록에서 직접 찾아볼 수 있습니다.</p></div> : <span id="search-connection" className="sr-only">장소·주소 검색: Kakao</span>}
    <div aria-live="polite" aria-atomic="true">
      {state === 'loading' && <p role="status">장소를 검색하고 있습니다. 검색 범위 · {scopeLabel}</p>}
      {state === 'error' && <div className="notice error" tabIndex={-1} ref={resultNotice}><p>{error}</p><button onClick={() => void search(nationwide)}>다시 검색</button><a href={listLink}>노선 목록으로</a></div>}
      {state === 'ready' && places && !selected && <>
        {missingFacility && <div className="facility-miss" tabIndex={-1} ref={resultNotice}>
          <strong>‘{nationwide && region ? region.nationwideKeyword : query.trim()}’에 일치하는 시설을 찾지 못했어요.</strong>
          <p>{scopeLabel} 검색 결과 기준입니다.{placeCount > 0 ? ' 아래 후보의 이름과 주소를 확인해 주세요.' : ' 장소명이나 시설명을 바꿔 검색해 보세요.'}</p>
        </div>}
        {!placeCount && <div className="notice" tabIndex={-1} ref={missingFacility ? undefined : resultNotice}>
          {!missingFacility && <><strong>검색 결과가 없습니다.</strong><p>{region && !nationwide ? `‘${query.trim()}’에 맞는 ${region.label} 장소를 찾지 못했어요.` : '다른 장소명이나 주소로 검색해 주세요.'} 검색 결과 없음은 통학버스 미운행을 뜻하지 않습니다.</p></>}
          {region && !nationwide && <button onClick={() => void search(true)}>다른 지역까지 검색</button>}
          <a href={listLink}>노선 목록에서 찾기</a>
        </div>}
        {placeCount > 0 && apartmentSection?.numberedComplexes && !apartmentSection.items.length &&
          <p>{scopeLabel} 검색 결과에서 이름이 일치하는 {apartmentSection.title} 0곳 · 관련 장소를 확인해 주세요.</p>}
        {broaderQuery && <button type="button" className="secondary-button" onClick={() => {
          document.getElementById('place-query')?.focus();
          void search(nationwide, broaderQuery);
        }}>단지 번호 빼고 ‘{broaderQuery}’ 검색</button>}
      </>}
    </div>
    {places && placeCount > 0 && <PlacePicker summaryRef={resultsSummary} sections={places} query={query} scope={scopeLabel || ''} nationwide={nationwide} showDistricts={!!region?.rect && !nationwide} selected={selected} filters={picker} onFilterChange={setPicker} onSelect={item => {
      if (item.selectionId !== selected?.selectionId) visits?.pushStep();
      setSelected({ ...item, selectedAt: new Date().toISOString(), selectionState: 'explicitlySelected' });
      setActiveLocation(null);
      setTimeout(() => { selectedHeading.current?.focus(); selectedHeading.current?.scrollIntoView?.({ block: 'start' }); }, 0);
    }}/>}
    {state === 'ready' && region && !selected && <a className="kakao-search-link" href={`https://map.kakao.com/link/search/${encodeURIComponent(nationwide ? region.nationwideKeyword : region.keyword)}`} target="_blank" rel="noreferrer">카카오맵에서 같은 검색 보기 ↗</a>}
    {selected && result && <div className="selected-place">
      <div className="selected-place-heading"><div>
        <p className="garden-direction"><b>{direction === 'fromCampus' ? '하교 목적지' : '등교 출발지'}</b><span id="selected-place-area">{selectedArea}</span></p>
        <h3 ref={selectedHeading} tabIndex={-1} aria-label={`선택한 장소 · ${selected.name}`} aria-describedby={selectedArea ? 'selected-place-area' : undefined}>{selected.name}</h3><p className="selected-address">{selected.roadAddress || selected.lotAddress}</p>
        {sharedBoarding && <p className="candidate-boarding">{sharedBoarding}</p>}
      </div></div><div className="selected-place-actions">
          {onDirectionChange && <button onClick={() => onDirectionChange(oppositeDirection)}>같은 장소로 {direction === 'toCampus' ? '하교' : '등교'}편 보기</button>}
          <button onClick={changePlace}>장소 다시 선택</button>
        </div>
      <div id="candidate-list"><h4>{direction === 'toCampus' ? '주변 승차 지점·시각' : '목적지 주변 하차 후보'}</h4>
      <p role="status">{nearby.length ? `후보 ${groups.length}곳 · ${sortBy === 'distance' ? '직선거리순' : direction === 'toCampus' ? '승차시각순' : '학교 출발시각순'}` : '현재 비교 가능한 거리 후보는 0개입니다.'}</p>
      {!nearby.length && result.globalReasons.includes('WEEKEND_NO_SERVICE') && <div className="candidate-empty"><strong>주말에는 정규 통학버스가 운행하지 않아요.</strong><p>이용 요일을 평일로 바꿔 주세요.</p><a href={listLink} onClick={openFullTimetable}>전체 시간표 보기 →</a></div>}
      {!nearby.length && !result.globalReasons.includes('WEEKEND_NO_SERVICE') && <div className="candidate-empty"><strong>{result.globalReasons.includes('REGION_UNSUPPORTED') ? '선택한 장소는 현재 거리 비교 지원지역 밖입니다.' : '지금 조건으로 비교할 수 있는 지점이 없어요.'}</strong>{result.globalReasons.includes('REGION_UNSUPPORTED') && <p>{reasonLabels.REGION_UNSUPPORTED} 장소의 이름·주소를 확인하고 다시 선택해 주세요.</p>}<p>지도 위치가 없는 편도 전체 시간표에서 찾을 수 있어요.</p><a href={listLink} onClick={openFullTimetable}>{timeCondition ? `시간 조건을 풀고 ${direction === 'toCampus' ? '등교' : '하교'} 전체 시간표 보기 →` : '이 방향 노선 목록 보기 →'}</a>{radius < 5000 && !result.globalReasons.includes('REGION_UNSUPPORTED') && <button onClick={() => setRadius(5000)}>반경 5km로 넓히기</button>}{timeInput && <button onClick={() => setTimeInput('')}>시간 조건 지우고 다시 비교</button>}</div>}
      {nearby.length > 0 && <section className="reference-candidates" aria-label={result.candidates.length ? '조건 확인·참고 후보' : '참고 후보'}>
        <p className="comparison-explanation">{sortBy === 'distance'
          ? withinKm ? (homeward ? `${originLabel}에서 지도 기준점까지 직선 1km 이내인 후보는 ${withinKm}곳이에요.` : `후보 중 기준점까지 직선 1km 이내 · ${withinKm}곳`) : `직선 1km 이내 후보 없음 · ${radius / 1000}km 안에서 가까운 순`
          : `각 지점의 가장 이른 ${direction === 'toCampus' ? '승차' : '학교 출발'} 시각부터 보여줘요.`}
          {!weekday && (homeward ? ' 요일을 고르면 그날의 학교 출발 시각을 볼 수 있어요.' : ' 요일을 고르면 대체 시각과 운행 조건을 확인할 수 있어요.')}
        </p>
        <ol id="candidate-results" className="candidate-list">{groups.slice(0, stopLimit).map((group, index) => renderCandidateGroup(group.relations, index))}</ol>
        <MoreResults label={direction === 'fromCampus' ? '하차 지점' : '승차 지점'} unit="곳" total={groups.length} limit={stopLimit} step={stopStep} onChange={setExpandedStopLimit} listId="candidate-results" itemSelector=".candidate-card"/>
      </section>}
      {onOpenTimetable && <form key={direction + selected.selectionId} className="timetable-lookup" onSubmit={event => {
        event.preventDefault();
        const field = event.currentTarget.elements.namedItem('stopName') as HTMLInputElement;
        if (field.value.trim()) onOpenTimetable(field.value.trim(), timeScope, field);
      }}>
        <label htmlFor="timetable-stop-name">{homeward ? '하차 지점 이름' : '시간표에서 찾을 승차 지점명'}</label>
        <div className="search-input-row">
          <input id="timetable-stop-name" name="stopName" type="search" required maxLength={100} placeholder="기억나는 정류장 이름" aria-describedby="timetable-scope"/>
          <button className="primary-button" type="submit">시간표 검색</button>
        </div>
        <p id="timetable-scope">{timeScope ? `‘${timeScope}’ 조건을 풀고 선택한 요일의 모든 시각을 봅니다.` : '지도 위치가 없는 정류장도 찾을 수 있어요.'}</p>
      </form>}
      <DirectionCoverage direction={direction} result={result}/>
      </div>
      <details className="candidate-map-disclosure" open={mapOpen}><summary ref={mapSummary} onClick={event => {
        event.preventDefault();
        if (mapOpen) moveWithinResults(() => mapSummary.current, () => mapSummary.current, () => setMapOpen(false));
        else showMap();
      }}>주변 지점 지도 보기</summary>{mapOpen && <div id="candidate-map"><h4 ref={mapHeading} tabIndex={-1}>지도에서 위치 비교</h4><MapView coordinates={selected.coordinates ? { lat: selected.coordinates.latitude, lng: selected.coordinates.longitude } : null} label={selected.name} homeward={homeward} stops={mapStops} selectedId={selectedLocation} onSelect={id => {
        const index = groups.findIndex(group => candidateGroupKey(group.relations[0]) === id);
        moveWithinResults(() => mapHeading.current, () => candidateButton(id), () => {
          setActiveLocation(id);
          setMapOpen(false);
          if (index >= stopLimit) {
            const batches = Math.ceil((index + 1 - stopLimit) / stopStep);
            setExpandedStopLimit(Math.min(groups.length, stopLimit + batches * stopStep));
          }
        });
      }}/><button onClick={() => moveWithinResults(() => mapHeading.current, () => candidateButton(selectedLocation) || mapSummary.current, () => setMapOpen(false))}>{homeward ? '하차 후보 목록으로' : '후보 목록 보기'}</button></div>}</details>
      <details className="result-evidence"><summary>{homeward ? '검색에서 빠진 지점 보기' : '결과에 없는 편 확인'}</summary><p>운행 조건이나 위치를 확인하기 어려운 편은 시간표 목록에서 찾을 수 있어요.</p>
      <RelationEvidence items={result.excluded} href={candidateHref}/>
      </details><p className="comparison-footnote">공식 노선표(안) 기준 · 변경될 수 있어요. <a href="#/sources">이용 안내·자료 출처</a></p>
      {nearby.length > 0 && <a className="text-link" href={listLink} onClick={openFullTimetable}>{timeScope ? '시간 조건을 풀고 전체 시간표 보기 →' : '전체 시간표 보기 →'}</a>}
    </div>}
    {!selected && <a className="search-list-alternative" href={listLink}>장소 검색 없이 노선 목록 보기 →</a>}
  </section>;
}
