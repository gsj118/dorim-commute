import { MoreResults } from './components/MoreResults';
import { exampleDestination, officialUnibus, SubmissionComparison } from './components/SubmissionComparison';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { dataset, getTripStops } from './data';
import { searchRoutes } from './domain/routeSearch';
import { getRouteStopContext } from './domain/routeStopContext';
import { MatchedStop, RouteTripCard } from './components/RouteTripCard';
import { Icon } from './components/Icon';
import type { Direction, PlaceSelection, Weekday } from './domain/types';
import { PlaceSearch, type PlaceSearchActions } from './components/PlaceSearch';
import { DetailLocation } from './components/DetailLocation';
import { discoveryAnchors, DiscoveryDistance, distanceOrigin, markerDescription } from './components/DiscoveryReference';
import { fridayDepartureNote, resolveTime } from './domain/time';
import { OptionalScreen } from './components/OptionalScreen';
import { haversineMeters, usableLocation } from './domain/recommend';
import { TripConditions } from './components/TripConditions';
import { createVisits } from './navigation';
import './styles.css';
import './garden.css';
import universitySymbol from './mnu-symbol.png';

const AsIsView = lazy(() => import('./components/AsIsView').then(module => ({ default: module.AsIsView })));
const EvaluationPanel = lazy(() => import('./components/EvaluationPanel').then(module => ({ default: module.EvaluationPanel })));
type Page = { kind: 'home' | 'search' | 'routes' | 'sources' | 'compare'; direction?: Direction } | { kind: 'trip'; id: string; occurrenceId?: string } | { kind: 'asis'; path: string } | { kind: 'evaluation' };
const weekdays: [Weekday, string][] = [['MON', '월요일'], ['TUE', '화요일'], ['WED', '수요일'], ['THU', '목요일'], ['FRI', '금요일'], ['SAT', '토요일'], ['SUN', '일요일']];
const directionName = (direction: Direction) => direction === 'toCampus' ? '등교' : '하교';
const demoDestination = '유니버시아드 힐스테이트 2단지';
const demoHref = '?demo=hwajeong#/search';
const schoolBusNotice = 'https://www.mokpo.ac.kr/www/276/subview.do?enc=Zm5jdDF8QEB8JTJGYmJzJTJGd3d3JTJGMTM5JTJGMTczNDM2JTJGYXJ0Y2xWaWV3LmRvJTNG';
function missingRouteTitle(direction: Direction, input: string) {
  const query = input.trim();
  const last = query.charCodeAt(query.length - 1);
  if (last >= 0xac00 && last <= 0xd7a3) {
    const particle = (last - 0xac00) % 28 === 0 ? '를' : '을';
    return `${directionName(direction)} 시간표에서 ‘${query}’${particle} 찾지 못했어요.`;
  }
  return `${directionName(direction)} 시간표에 ‘${query}’ 검색 결과가 없어요.`;
}
function readPage(): Page {
  const pieces = window.location.hash.replace(/^#\/?/, '').split('/');
  if (pieces[0] === 'asis') return { kind: 'asis', path: window.location.hash };
  if (pieces[0] === 'evaluation') return { kind: 'evaluation' };
  if (pieces[0] === 'trip') { try { return { kind: 'trip', id: decodeURIComponent(pieces[1] || ''), occurrenceId: pieces[2] ? decodeURIComponent(pieces[2]) : undefined }; } catch { return { kind: 'trip', id: '' }; } }
  if (pieces[0] === 'routes') return { kind: 'routes', direction: pieces[1] === 'fromCampus' ? 'fromCampus' : pieces[1] === 'toCampus' ? 'toCampus' : undefined };
  if (pieces[0] === 'search' || pieces[0] === 'sources' || pieces[0] === 'compare') return { kind: pieces[0] };
  return { kind: 'home' };
}

function detailEntryWeekday(page: Page): Weekday | null | undefined {
  if (page.kind !== 'trip') return undefined;
  const entry = window.history.state?.dorimTrip;
  if (entry?.id !== page.id) return undefined;
  if (entry.weekday === null || weekdays.some(([id]) => id === entry.weekday)) return entry.weekday;
}

function Conditions({ direction, weekday, onDirection, onWeekday }: { direction: Direction; weekday: Weekday | null; onDirection: (value: Direction) => void; onWeekday: (value: Weekday | null) => void }) {
  return <div className="conditions-bar"><div className="direction-toggle" role="group" aria-label="통학 방향"><button type="button" aria-pressed={direction === 'toCampus'} onClick={() => onDirection('toCampus')}><span>등교</span><small>광주 → 학교</small></button><button type="button" aria-pressed={direction === 'fromCampus'} onClick={() => onDirection('fromCampus')}><span>하교</span><small>학교 → 광주</small></button></div><label className="day-select">이용 요일<select value={weekday || ''} onChange={event => onWeekday(event.target.value as Weekday || null)}><option value="">요일 미선택</option>{weekdays.map(([id, name]) => <option value={id} key={id}>{name}</option>)}</select></label></div>;
}

export default function App() {
  const [page, setPage] = useState<Page>(readPage);
  const [visits] = useState(createVisits);
  const params = new URLSearchParams(window.location.search);
  const demo = params.get('demo') === 'hwajeong';
  const fridayExample = demo && params.get('day') === 'FRI';
  const [direction, setDirection] = useState<Direction>(() =>
    (page.kind === 'routes' && page.direction) || (demo ? 'fromCampus' : 'toCampus'));
  const [weekday, setWeekday] = useState<Weekday | null>(() => {
    const saved = detailEntryWeekday(page);
    return saved === undefined ? (fridayExample ? 'FRI' : null) : saved;
  });
  const [filter, setFilter] = useState('');
  const [routeLimit, setRouteLimit] = useState(5);
  const [searchEpoch, setSearchEpoch] = useState(0);
  const [selectedPlace, setSelectedPlace] = useState<PlaceSelection | null>(null);
  const [selectedStop, setSelectedStop] = useState<string | null>(() => { const initial = readPage(); return initial.kind === 'trip' ? initial.occurrenceId || null : null; });
  const headingRef = useRef<HTMLHeadingElement>(null);
  const comparisonRef = useRef<HTMLDetailsElement>(null);
  const navigationPending = useRef(false);
  const freshHomePending = useRef(false);
  const homeHeading = useRef<HTMLHeadingElement>(null);
  const placeForm = useRef<PlaceSearchActions>(null);
  const pendingPlaceQuery = useRef<string | null>(null);
  const searchReturn = useRef<{ href: string; link: HTMLElement; scrollY: number; candidate?: { occurrenceId: string; number: number } } | null>(null);
  const timetableOrigin = useRef<{
    direction: Direction; weekday: Weekday | null; timeScope: string; href: string; link: HTMLElement; scrollY: number;
  } | null>(null);
  const routeReturn = useRef<{ buttonId: string; direction: Direction; scrollY: number } | null>(null);
  const lastToBe = useRef('#/');
  const lastAsIs = useRef('#/asis');
  const [evaluationLoaded, setEvaluationLoaded] = useState(() => readPage().kind === 'evaluation');
  useEffect(() => {
    visits.mark();
    const change = () => {
      const entry = visits.enter();
      if (!entry) return;
      const next = readPage();
      if (next.kind === 'trip' && !entry.restored) {
        const searchLink = searchReturn.current;
        const listLink = routeReturn.current;
        const source = timetableOrigin.current;
        entry.visit.restorePage = () => {
          searchReturn.current = searchLink; routeReturn.current = listLink; timetableOrigin.current = source;
        };
      }
      const origin = timetableOrigin.current;
      if (origin && pendingPlaceQuery.current === null && (next.kind === 'home' || next.kind === 'search')) {
        setDirection(origin.direction);
        setWeekday(origin.weekday);
        searchReturn.current = origin;
      }
      if (next.kind !== 'routes' && next.kind !== 'trip') timetableOrigin.current = null;
      if (next.kind === 'routes' && next.direction) {
        setDirection(next.direction);
        if (!entry.restored) setRouteLimit(5);
      }
      if (entry.restored) {
        entry.visit.restorePage?.();
        if (next.kind === 'home' || next.kind === 'search') entry.visit.restorePlace?.();
      }
      const storedDay = detailEntryWeekday(next);
      if (storedDay !== undefined) setWeekday(storedDay);
      navigationPending.current = true;
      setSelectedStop(next.kind === 'trip' ? next.occurrenceId || null : null);
      setPage(next);
    };
    const resetTrial = () => { visits.reset(); timetableOrigin.current = null; searchReturn.current = null; routeReturn.current = null; setDirection('toCampus'); setWeekday(null); setFilter(''); setRouteLimit(5); setSelectedStop(null); setSearchEpoch(value => value + 1); lastToBe.current = '#/'; lastAsIs.current = '#/asis'; };
    window.addEventListener('hashchange', change);
    window.addEventListener('popstate', change);
    window.addEventListener('hci-evaluation-reset', resetTrial);
    return () => { window.removeEventListener('hashchange', change); window.removeEventListener('popstate', change); window.removeEventListener('hci-evaluation-reset', resetTrial); };
  }, [visits]);
  useEffect(() => {
    if (page.kind === 'trip') {
      window.history.replaceState({ ...window.history.state, dorimTrip: { id: page.id, weekday } }, '');
    }
  }, [page, weekday]);
  useEffect(() => {
    if (comparisonRef.current) comparisonRef.current.open = false;
    if (page.kind === 'evaluation') setEvaluationLoaded(true);
    else if (page.kind === 'asis') lastAsIs.current = page.path;
    else if (page.kind !== 'sources' && page.kind !== 'compare') lastToBe.current = window.location.hash || '#/';
    if (navigationPending.current) {
      const placeQuery = pendingPlaceQuery.current;
      pendingPlaceQuery.current = null;
      const saved = searchReturn.current;
      const resultLink = saved?.link.isConnected ? saved.link : saved?.link instanceof HTMLAnchorElement
        ? Array.from(document.querySelectorAll<HTMLAnchorElement>('.selected-place a')).find(link => link.getAttribute('href') === saved.link.getAttribute('href'))
        : null;
      const listEntry = page.kind === 'routes' && routeReturn.current;
      const listButton = page.kind === 'routes' && listEntry && (!page.direction || page.direction === listEntry.direction) && document.getElementById(listEntry.buttonId);
      if (freshHomePending.current && page.kind === 'home') {
        homeHeading.current?.focus({ preventScroll: true });
        window.scrollTo({ top: 0, behavior: 'instant' });
      } else if (page.kind === 'search' && placeQuery !== null) {
        placeForm.current?.prepare(placeQuery);
      } else if ((page.kind === 'search' || page.kind === 'home') && saved && resultLink && !resultLink.closest('[hidden]')) {
        resultLink.focus({ preventScroll: true });
        window.scrollTo({ top: saved.scrollY, behavior: 'instant' });
      } else if (listEntry && listButton) {
        listButton.focus({ preventScroll: true });
        window.scrollTo({ top: listEntry.scrollY, behavior: 'instant' });
      } else if (visits.current.restoreViewport) {
        visits.current.restoreViewport();
      } else {
        const target = document.querySelector<HTMLElement>('.search-page-preserved:not([hidden]) .selected-place h3, .search-page-preserved:not([hidden]) .place-choice[open] summary')
          || (visits.current.restorePlace && (page.kind === 'home' || page.kind === 'search') && document.getElementById('place-query'))
          || (page.kind === 'routes' && visits.current.restorePage && document.querySelector<HTMLElement>('.list-filter input'))
          || Array.from(document.querySelectorAll<HTMLHeadingElement>('main h1')).find(heading => !heading.closest('[hidden]'));
        target?.focus({ preventScroll: true });
        const scrollTarget = page.kind === 'trip' ? target?.closest('.page-section') || target : target;
        scrollTarget?.scrollIntoView?.({ block: 'start' });
      }
      if (page.kind !== 'trip') searchReturn.current = null;
      if (page.kind !== 'trip') routeReturn.current = null;
    }
    navigationPending.current = false;
    freshHomePending.current = false;
    document.title = `${page.kind === 'compare' ? '화정동 하교 비교' : page.kind === 'asis' ? 'As-is 비교용 기준 화면' : page.kind === 'evaluation' ? '사용성 평가 도구' : page.kind === 'home' ? '나의 통학길' : page.kind === 'trip' ? '운행편 상세' : page.kind === 'sources' ? '정보와 출처' : page.kind === 'search' ? '장소로 찾기' : '노선 목록'} · 도림 통학`;
  }, [page, visits]);
  const navigate = (path: string) => { window.location.hash = path; };
  const brandHref = window.location.pathname + '#/';
  const openFreshHome = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    // A trip/list visit can also have a place search mounted behind it.
    const restorePlace = placeForm.current?.snapshot();
    const restorePage = visits.current.restorePage;
    visits.current.restorePage = () => {
      setDirection(direction); setWeekday(weekday); setFilter(filter); setRouteLimit(routeLimit);
      restorePage?.();
      restorePlace?.();
    };
    const oldURL = window.location.href;
    window.history.pushState(null, '', brandHref);
    visits.enter();
    timetableOrigin.current = null; searchReturn.current = null; routeReturn.current = null;
    pendingPlaceQuery.current = null;
    placeForm.current?.clear();
    setSelectedPlace(null); setSelectedStop(null); setDirection('toCampus'); setWeekday(null);
    setFilter(''); setRouteLimit(5);
    freshHomePending.current = true;
    navigationPending.current = true;
    setPage({ kind: 'home' });
    if (new URL(oldURL).hash !== window.location.hash) {
      window.dispatchEvent(new HashChangeEvent('hashchange', { oldURL, newURL: window.location.href }));
    }
  };
  const trip = page.kind === 'trip' ? dataset.trips.find(item => item.tripId === page.id) : undefined;
  const activeDirection = trip?.direction || direction;
  const asisTripId = page.kind === 'asis' ? page.path.split('/')[3] : undefined;
  const asisDirection = page.kind === 'asis' ? dataset.trips.find(item => item.tripId === asisTripId)?.direction || (page.path.includes('/fromCampus') ? 'fromCampus' : 'toCampus') : direction;
  const homeHref = page.kind === 'asis' ? '#/asis' : '#/';
  const routesHref = page.kind === 'asis' ? `#/asis/routes/${asisDirection}` : `#/routes/${activeDirection}`;
  const tripStops = trip ? getTripStops(trip.tripId) : [];
  const campusBoarding = tripStops.find(item => item.stop.role === 'boarding' && item.stop.campusId !== null)?.stop;
  const departureRule = tripStops.find(item => item.timeRule?.timeKind === 'departureFromCampus')?.timeRule;
  const overrideNotes = departureRule?.overrides.map(item => dataset.serviceRules.find(rule => rule.ruleId === item.conditionRuleId)?.rawNote.value).filter(Boolean).join(' · ');
  const focusedStop = tripStops.find(item => item.occurrence.tripStopId === selectedStop);
  const selectedVia = trip?.direction === 'toCampus' && focusedStop?.stop.role === 'via';
  const summaryStop = (selectedVia || focusedStop?.stop.role === 'boarding') ? focusedStop :
    tripStops.find(row => row.stop.role === 'boarding');
  const focusedContext = focusedStop && getRouteStopContext(dataset, focusedStop, weekday);
  const timingContext = summaryStop && getRouteStopContext(dataset, summaryStop, weekday);
  const detailTiming = timingContext?.time;
  const homewardDetail = trip?.direction === 'fromCampus';
  const baseDeparture = resolveTime(dataset, departureRule, null).value;
  const fridayDeparture = resolveTime(dataset, departureRule, 'FRI');
  const hasFridayChange = homewardDetail && !timingContext?.conflictNote && fridayDepartureNote(baseDeparture, fridayDeparture, null);
  const departureNote = hasFridayChange && detailTiming?.value ? fridayDepartureNote(baseDeparture, fridayDeparture, weekday) : null;
  let tripTimingNote = '다른 정류장에서 타려면 아래 목록에서 정류장을 선택해 승차 시각을 확인하세요.';
  if (homewardDetail) tripTimingNote = '하차 지점 도착 시각은 시간표에 없어요.';
  else if (summaryStop && timingContext?.disputedCall) {
    tripTimingNote = `시간표마다 경유지가 달라요. ${summaryStop.stop.displayName}에서 탈 수 있는지, 몇 시에 타는지 학교에 문의해 주세요.`;
  }
  const detailTimeLabel = trip?.direction === 'fromCampus' ? '학교 출발 시각' :
    selectedVia ? '선택한 지점 경유 시각' :
    focusedStop?.stop.role === 'boarding' ? '이 정류장에서 타는 시각' : '첫 승차 지점 시각';
  const focusedAnchor = focusedStop && !usableLocation(focusedStop.location) && !focusedContext?.conflictNote
    ? discoveryAnchors.get(focusedStop.occurrence.tripStopId) : undefined;
  const detailPlace = (searchReturn.current || timetableOrigin.current) && selectedPlace ? selectedPlace :
    fridayExample && params.get('example') === 'trip' && trip?.tripId === 'tp-s25-from-songjeong-03' ? exampleDestination : null;
  const searchCoordinates = detailPlace?.coordinates;
  const candidate = searchReturn.current?.candidate;
  const detailCandidateNumber = candidate && candidate.occurrenceId === selectedStop ? candidate.number : undefined;
  const visibleTrips = page.kind === 'routes' ? searchRoutes(direction, filter) : [];
  const origin = timetableOrigin.current;
  useEffect(() => {
    if (page.kind !== 'routes' && page.kind !== 'home' && page.kind !== 'search') return;
    visits.current.restorePage = () => {
      setDirection(direction); setWeekday(weekday);
      if (page.kind === 'routes') {
        setFilter(filter); setRouteLimit(routeLimit); timetableOrigin.current = origin;
      }
    };
  }, [page, visits, direction, weekday, filter, routeLimit, origin]);
  const editFilter = (value: string) => {
    if (!!value.trim() !== !!filter.trim()) visits.pushStep();
    setFilter(value); setRouteLimit(5);
  };
  const returnSearchHref = origin?.href || (selectedPlace && searchReturn.current?.href) || '#/search';
  const onReturnSearch = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = event.currentTarget.hash;
    if (selectedPlace && visits.backTo(entry => entry.placeStep === 'selected' && (entry.hash === target || (!entry.hash && target === '#/')))) event.preventDefault();
  };
  const openTimetable = (query: string, timeScope: string, link: HTMLElement) => {
    timetableOrigin.current = { direction, weekday, timeScope, link, href: window.location.hash || '#/', scrollY: window.scrollY };
    setFilter(query); setRouteLimit(5);
    navigate(`/routes/${direction}`);
  };
  const setTravelDirection = (value: Direction) => {
    if (page.kind === 'routes' && value !== direction) navigate(`/routes/${value}`);
    else setDirection(value);
    setSelectedStop(null);
  };
  const openTrip = (tripId: string, occurrenceId?: string) => {
    routeReturn.current = { direction, buttonId: `route-result-${occurrenceId || tripId}`, scrollY: window.scrollY };
    const path = `/trip/${encodeURIComponent(tripId)}`;
    navigate(occurrenceId ? `${path}/${encodeURIComponent(occurrenceId)}` : path);
  };
  const selectDetailStop = (occurrenceId: string, trigger: HTMLButtonElement) => {
    if (page.kind !== 'trip') return;
    const next = selectedStop === occurrenceId ? null : occurrenceId;
    const path = `#/trip/${encodeURIComponent(page.id)}`;
    const scrollY = window.scrollY;
    visits.current.restoreViewport = () => {
      document.getElementById(trigger.id)?.focus({ preventScroll: true });
      window.scrollTo({ top: scrollY, behavior: 'instant' });
    };
    const entry = visits.pushStep(next ? `${path}/${encodeURIComponent(next)}` : path);
    entry.restoreViewport = () => {
      const target = next ? document.querySelector<HTMLElement>('.location-panel h2') : document.getElementById(trigger.id);
      target?.focus({ preventScroll: true });
      target?.scrollIntoView?.({ block: 'start', behavior: 'instant' });
    };
    navigationPending.current = true;
    setPage(readPage());
    setSelectedStop(next);
  };
  return <div className={page.kind === 'asis' || page.kind === 'evaluation' ? 'app-shell' : 'app-shell garden-ui'}>
    <a className="skip-link" href="#main" onClick={event => { event.preventDefault(); document.getElementById('main')?.focus(); }}>본문으로 건너뛰기</a>
    <header className="site-header">
      <a className="brand" href={brandHref} onClick={openFreshHome}>
        <img className="university-symbol" src={universitySymbol} alt="국립목포대학교" width="70" height="52"/>
        <span>도림통학<small>광주권 통학버스 · 학생 프로젝트</small></span>
        <span className="sr-only">홈으로</span>
      </a>
      <nav aria-label="주요 메뉴">
        <a href={page.kind === 'asis' ? homeHref : brandHref} onClick={page.kind === 'asis' ? undefined : openFreshHome} aria-current={page.kind === 'home' ? 'page' : undefined}>홈</a>
        <a href={routesHref} aria-current={page.kind === 'routes' || page.kind === 'trip' ? 'page' : undefined}>노선 목록</a>
        <a href="#/sources" aria-current={page.kind === 'sources' ? 'page' : undefined}>이용 안내</a>
      </nav>
      <a className="official-link" href={officialUnibus} target="_blank" rel="noreferrer">공식 Unibus <Icon name="external"/></a>
    </header>
    <main id="main" tabIndex={-1} className="main-content">
      {demo && page.kind !== 'evaluation' && page.kind !== 'asis' && <aside className="demo-scenario" aria-label="하교 시연 시나리오">
        <details><summary><strong>{fridayExample ? '금요일 하교 예시' : '하교 시연'}</strong> 광주 서구 화정동 {demoDestination} 가기</summary>
          <p>도림캠퍼스에서 이 단지로 가려고 합니다. 단지명으로 검색해 하차 지점 후보를 비교하고, 학교에서 어디서 몇 시에 타는지 확인하세요.</p>
        </details>
        <a href={window.location.pathname + (fridayExample ? '#/compare' : '')}>{fridayExample ? '비교 화면으로' : '시연 종료'}</a>
      </aside>}
      {page.kind === 'compare' && <SubmissionComparison/>}
      {page.kind === 'asis' && <OptionalScreen key={page.path}><Suspense fallback={<p role="status">기준 화면을 불러오고 있습니다.</p>}><AsIsView path={page.path} weekday={weekday} onWeekday={setWeekday}/></Suspense></OptionalScreen>}
      {evaluationLoaded && <OptionalScreen active={page.kind === 'evaluation'}><Suspense fallback={<p role="status">평가 도구를 불러오고 있습니다.</p>}><EvaluationPanel/></Suspense></OptionalScreen>}
      <div hidden={page.kind !== 'home' && page.kind !== 'search'} className="search-page-preserved" onClickCapture={event => {
        if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href^="#/trip/"]') : null;
        if (link) {
          const candidate = link.closest<HTMLElement>('.candidate-trip');
          const badge = link.closest('.candidate-card')?.querySelector('.candidate-number');
          searchReturn.current = {
            href: window.location.hash || '#/', link, scrollY: window.scrollY,
            candidate: candidate?.dataset.occurrenceId && badge ? { occurrenceId: candidate.dataset.occurrenceId, number: Number(badge.textContent) } : undefined,
          };
        }
      }}>
        <section className="hero"><div className="hero-copy">
          <div className="eyebrow">{fridayExample ? '도림캠퍼스 → 화정동' : '광주권 ↔ 도림캠퍼스'}</div>
          <h1 tabIndex={-1} ref={homeHeading}>{fridayExample ? '단지 이름으로 하교편 찾기' : <>아는 장소로 찾는 <br/><span>나의 통학편.</span></>}</h1>
          <p>{fridayExample ? '‘장소 검색’을 누르고 결과에서 2단지 아파트를 선택하세요.' : '아파트·건물 이름으로 가까운 정류장과 시각을 확인하세요.'}</p>{page.kind === 'home' && !demo && <a className="home-comparison-link" href="#/compare">화정동 하교 예시로 두 방식 비교 <Icon name="arrow"/></a>}</div><div className="search-panel"><div className="panel-heading"><h2>어디서 통학하시나요?</h2></div><Conditions direction={direction} weekday={weekday} onDirection={setTravelDirection} onWeekday={setWeekday}/><PlaceSearch ref={placeForm} key={searchEpoch} visits={visits} visible={page.kind === 'home' || page.kind === 'search'} initialQuery={demo ? demoDestination : ''} direction={origin?.direction || direction} weekday={origin ? origin.weekday : weekday} onDirectionChange={setTravelDirection} onOpenTimetable={openTimetable} onSelectionChange={setSelectedPlace}/></div></section>
        {!fridayExample && <section className="home-list-section" aria-labelledby="quick-heading"><div className="section-heading"><div><h2 id="quick-heading">익숙한 노선, 바로 확인하기</h2><p>장소 검색 없이도 운행편과 정류장을 살펴볼 수 있어요.</p></div><button className="text-button" onClick={() => navigate(`/routes/${direction}`)}>노선 목록 보기 <Icon name="arrow"/></button></div><div className="quick-direction-grid">{(['toCampus', 'fromCampus'] as Direction[]).map(value => <button className={`quick-direction ${value === 'fromCampus' ? 'homeward' : ''}`} key={value} onClick={() => { setDirection(value); navigate(`/routes/${value}`); }}><span className="quick-icon"><Icon name="route"/></span><span><strong>{directionName(value)} 노선</strong><small>{value === 'toCampus' ? '광주권 승차 지점 → 도림캠퍼스' : 'MNU 스퀘어 앞 → 광주권 하차 지점'}</small><span className="mini-badge">{dataset.trips.filter(t => t.direction === value).length}편 수록</span></span><Icon name="arrow"/></button>)}</div></section>}

      </div>
      {page.kind === 'routes' && <section className="page-section">
        {origin && <a className="back-button search-return" href={origin.href} onClick={onReturnSearch}>← 장소 검색 결과로</a>}
        <div className="page-heading"><h1 tabIndex={-1} ref={headingRef}>노선 목록</h1>{origin?.timeScope && <p>장소 검색의 ‘{origin.timeScope}’ 조건을 풀어 모든 시각을 표시합니다.</p>}</div>
        <div className="list-layout"><aside className="list-sidebar"><Conditions direction={direction} weekday={weekday} onDirection={setTravelDirection} onWeekday={day => { setWeekday(day); setRouteLimit(5); }}/><a className="sidebar-search" href="#/search"><Icon name="pin"/><span>정류장 이름을 모르겠다면?<strong>장소로 찾아보기 <Icon name="arrow"/></strong></span></a></aside><div className="list-main"><label className="list-filter">수록 노선·정류장 이름<input id="route-filter" type="search" value={filter} onChange={event => editFilter(event.target.value)} placeholder="예: 서광주우체국, 문흥동"/></label><div className="list-caption" role="status"><h2>{directionName(direction)} 운행편 <span>{visibleTrips.length}편</span></h2></div><div id="route-results" className="trip-list">{visibleTrips.slice(0, routeLimit).map(result => <RouteTripCard key={result.trip.tripId} result={result} weekday={weekday} onOpen={openTrip}/>)}</div>
        <MoreResults label="운행편" unit="편" total={visibleTrips.length} limit={routeLimit} step={5} onChange={setRouteLimit} listId="route-results" itemSelector=".trip-card"/>
        {!visibleTrips.length && <div className="empty-state route-empty">
          <Icon name="route"/><h3>{missingRouteTitle(direction, filter)}</h3>
          <p>노선은 ‘송정1’, 정류장은 ‘서광주우체국’처럼 입력해 보세요. 아파트나 건물 이름은 홈에서 ‘<a href="#/search" onClick={event => {
            if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) pendingPlaceQuery.current = filter.trim();
          }}>장소 검색</a>’으로 찾을 수 있어요.</p>
          <button className="secondary-button" onClick={() => { editFilter(''); document.getElementById('route-filter')?.focus(); }}>{directionName(direction)} 노선 전체 보기</button>
        </div>}<div className="inline-notice"><Icon name="info"/><p>지도 위치가 없는 편도 포함한 노선표(안) 목록입니다.</p></div></div></div></section>}
      {page.kind === 'trip' && trip && <section className="page-section"><a className="back-button search-return" href={returnSearchHref} onClick={onReturnSearch}>{selectedPlace ? '← 장소 검색 결과로' : '장소로 찾기'}</a><button className="back-button" onClick={() => { if (!visits.backTo(entry => entry.hash === `#/routes/${trip.direction}` || (entry.hash === '#/routes' && routeReturn.current?.direction === trip.direction))) navigate(`/routes/${trip.direction}`); }}><Icon name="back"/>{directionName(trip.direction)} 목록으로</button><div className="detail-heading"><div><span className="eyebrow">{directionName(trip.direction)} · 노선표(안) 기준</span><h1 tabIndex={-1} ref={headingRef}>{trip.displayName}</h1><p>{homewardDetail && focusedStop?.stop.role === 'alighting' ? '이 편의 전체 노선 · ' : ''}{trip.summary}</p></div></div>
        <div className={`detail-facts ${trip.direction === 'fromCampus' ? 'school-departure' : ''}`}>
          <div>
            <span>{detailTimeLabel}</span>
            <strong>{detailTiming?.value || (timingContext?.disputedCall ? '시각 미확인' : timingContext?.conflictNote) || (selectedVia && focusedContext?.viaCondition) || '공식 시각 미제공'}</strong>
            {trip.direction === 'toCampus' && <small>{summaryStop?.stop.displayName || '지점 확인 필요'}</small>}
            {departureNote && <small>{departureNote}</small>}
            {!weekday && !departureNote && overrideNotes && <small>시간표 비고 · {overrideNotes}</small>}
            {selectedVia && detailTiming?.value && focusedContext?.viaCondition && <small>{focusedContext.viaCondition}</small>}
            {trip.direction === 'fromCampus' && <div className="school-pickup">
              <span>학교 승차 위치</span>
              <strong className="location-fact">{campusBoarding?.locationDescription.value || '학교 승차 위치 확인 필요'}</strong>
            </div>}
          </div>
          {trip.direction === 'toCampus' && <div>
            <span>{selectedVia ? '경유 지점' : '시간표에 나온 승차 지점'}</span>
            <strong className="location-fact">{summaryStop?.stop.displayName || '지점 확인 필요'}</strong>
            <small>{usableLocation(summaryStop?.location) ? (selectedVia ? '지도에 표시된 경유 지점이에요.' : '지도는 참고용이에요. 타기 전에 어느 쪽 도로변인지 확인해 주세요.') : '이곳의 지도 위치는 확인되지 않았어요.'}</small>
          </div>}
          {focusedStop && ((trip.direction === 'fromCampus' && focusedStop.stop.role !== 'boarding') || focusedStop.stop.role === 'campusArrival') &&
            <section className="detail-matched-stop" aria-label="선택한 지점"><MatchedStop row={focusedStop} weekday={weekday} detail={homewardDetail}/>
              {focusedAnchor && <div className="detail-reference">
                {searchCoordinates
                  ? <DiscoveryDistance anchor={focusedAnchor} origin={homewardDetail ? distanceOrigin(selectedPlace) : undefined} meters={haversineMeters(searchCoordinates, focusedAnchor.coordinates)}/>
                  : <p>거리 기준 · {markerDescription(focusedAnchor)}</p>}
                <p>정확한 하차 위치는 확인되지 않았어요.</p>
              </div>}
            </section>}
          <div>
            <label htmlFor="detail-weekday">확인할 요일</label>
            <select id="detail-weekday" value={weekday || ''} onChange={event => setWeekday(event.target.value as Weekday || null)}>
              <option value="">요일 미선택</option>
              {weekdays.map(([id, name]) => <option value={id} key={id}>{name}</option>)}
            </select>
          </div>
        </div>
        {!(homewardDetail && focusedStop?.stop.role === 'alighting') && <div className="inline-notice"><Icon name="info"/><p>{tripTimingNote}</p></div>}<TripConditions trip={trip} weekday={weekday}/><div className="detail-layout"><section className="timeline-panel"><div className="timeline-heading"><h2>{homewardDetail ? '학교에서 출발해 지나는 곳' : '정류장과 승차 시각'}</h2><span>시간표 순서</span></div><ol className="stop-timeline">{tripStops.map((row, index) => { const { occurrence, stop } = row; const { time, viaCondition, conflictNote, arrivalNotListed } = getRouteStopContext(dataset, row, weekday); const isSelected = selectedStop === occurrence.tripStopId; return <li key={occurrence.tripStopId} className={isSelected ? 'is-selected' : ''}><button aria-expanded={isSelected} id={`detail-stop-${occurrence.tripStopId}`} onClick={event => selectDetailStop(occurrence.tripStopId, event.currentTarget)}><span className="stop-number">{index + 1}</span><span className="stop-copy"><strong>{stop.displayName}</strong><small>{stop.role === 'boarding' ? '승차 지점' : stop.role === 'alighting' ? '하차 지점' : '경유·종착 지점'}{!(stop.campusId && stop.role === 'boarding') && ' · 위치 확인 필요'}</small></span><span className="stop-time">{time.value || conflictNote || viaCondition || (arrivalNotListed ? '도착 시각' : '시각 미제공')}<small>{arrivalNotListed ? '시간표에 없음' : time.label}</small></span><Icon name="pin"/></button>{time.value && viaCondition && <small className="row-condition">{viaCondition}</small>}{isSelected && <div className="stop-disclosure"><p>{stop.locationDescription.value || '이 지점의 실제 도로변·출입구 위치 설명은 미확보입니다.'}</p>{!(stop.campusId && stop.role === 'boarding') && <span>{usableLocation(row.location)
          ? (!homewardDetail && stop.role === 'boarding' ? '지도에 표시된 지점이에요. 실제로 타는 도로변은 이용 전에 확인해 주세요.' : '공식 지도 표시점 · 실제 도로변 승하차 위치 확인 필요')
          : focusedAnchor ? (homewardDetail ? '하차 위치의 좌표가 없어 지도에는 거리를 잰 기준점을 표시했어요.' : '지도에는 거리를 잰 기준점을 표시했어요.') : '지도 위치와 거리는 확인할 수 없어요.'}</span>}</div>}</li>; })}</ol></section><aside className="detail-aside"><DetailLocation candidateNumber={detailCandidateNumber} place={detailPlace} row={focusedStop} held={!!focusedContext?.conflictNote} disputedCall={!!focusedContext?.disputedCall}/><details className="source-mini"><summary>시간표 출처와 적용 기간</summary><dl><div><dt>원문</dt><dd>S25 · 2026학년도 2학기 PDF</dd></div><div><dt>정보 기준</dt><dd>노선표(안) · 변경 가능</dd></div><div><dt>기간</dt><dd>2026.09.01 – 12.18<br/><small>해당 학기 시간표 적용 기간</small></dd></div><div><dt>검토일</dt><dd>{dataset.metadata.reviewedOn}</dd></div></dl><a href="#/sources">이용 안내와 자료 출처 보기 <Icon name="arrow"/></a></details></aside></div></section>}
      {page.kind === 'trip' && !trip && <section className="empty-state"><h1 tabIndex={-1} ref={headingRef}>해당 운행편을 찾을 수 없어요.</h1><p>수록 범위가 바뀌었거나 주소가 올바르지 않습니다.</p><button className="primary-button" onClick={() => navigate(`/routes/${direction}`)}>노선 목록으로</button></section>}
      {page.kind === 'sources' && <section className="page-section sources-page">
        <div className="page-heading"><h1 tabIndex={-1} ref={headingRef}>이용 안내·자료 출처</h1></div>
        <div className="usage-guide"><h2>통학버스 이용 안내</h2>
          <p>운행 일정은 <a href={schoolBusNotice} target="_blank" rel="noreferrer"><u>학교 안내</u></a>를 확인해 주세요.</p>
          <p><strong>등교</strong>는 선택한 정류장의 승차 시각, <strong>하교</strong>는 도림캠퍼스 출발 시각입니다.</p>
          <p>거리는 선택한 장소에서 카드에 적힌 정류장 표시점 또는 주변 시설까지의 직선거리입니다.</p>
          <p>장소 검색어는 카카오에 전송됩니다. 정확한 집주소를 입력하지 않아도 됩니다.</p>
        </div>
        <div className="source-grid"><article><h2>자료 기준</h2>
          <p>국립목포대학교 2026학년도 2학기 통학버스 노선표(안)의 광주권 등교 19편과 하교 19편을 수록했습니다.</p>
          <a href={schoolBusNotice} target="_blank" rel="noreferrer">국립목포대학교 학생지원과 통학버스 공지 <Icon name="external"/></a>
        </article><article><h2>자료의 한계</h2>
          <p>경유지나 승차 시각이 시간표마다 다른 지점은 학교에 확인해 주세요. 실제 도로변 승하차 위치는 지도 표시점과 다를 수 있습니다.</p>
          <a href={officialUnibus} target="_blank" rel="noreferrer">공식 Unibus <Icon name="external"/></a>
        </article></div>
        <button className="primary-button" onClick={() => navigate(`/routes/${direction}`)}>노선 살펴보기 <Icon name="arrow"/></button>
      </section>}
    </main><footer className="site-footer"><div><strong>도림통학</strong><span>나의 일상과 학교를 잇는 통학 정보</span></div><p>2026학년도 2학기 · 광주권 문서 자료<br/>비공식 교육용 HCI 프로토타입 · 공식 Unibus 아님</p><a href="#/sources">자료 기준 · 지원 범위 <Icon name="arrow"/></a></footer>
    {!demo && <details className="comparison-tools" ref={comparisonRef}>
      <summary>과제용 비교·평가 도구 <span>{page.kind === 'asis' ? '현재 As-is' : page.kind === 'evaluation' ? '현재 평가 도구' : '펼치기'}</span></summary>
      <div className="comparison-toolbar"><a href={demoHref} target="_blank" rel="noreferrer">화정동 2단지 하교 시연 열기 (새 탭)</a><p>같은 PDF 광주권 {dataset.trips.length}편으로 탐색 방식을 비교합니다. As-is는 관찰한 기존 UI의 자체 재현입니다.</p><nav aria-label="비교 모드"><a href={lastToBe.current} aria-current={page.kind !== 'asis' && page.kind !== 'evaluation' ? 'page' : undefined}>To-be · 장소로 찾기</a><a href={lastAsIs.current} aria-current={page.kind === 'asis' ? 'page' : undefined}>As-is · 목록으로 찾기</a><a href="#/evaluation" aria-current={page.kind === 'evaluation' ? 'page' : undefined}>사용성 평가 도구</a></nav><small>모드별 이전 화면과 선택 요일은 탭 안에서 유지됩니다. 새로고침 시 초기화됩니다.</small></div>
    </details>}
    <span className="sr-only" aria-live="polite">{directionName(page.kind === 'asis' ? asisDirection : activeDirection)} 방향, {weekday ? weekdays.find(w => w[0] === weekday)?.[1] : '전체 자료 보기'}</span>
  </div>;
}
