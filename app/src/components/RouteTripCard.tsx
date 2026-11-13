import { dataset, getTripStops, getTripTime } from '../data';
import type { RouteSearchResult } from '../domain/routeSearch';
import { getRouteStopContext } from '../domain/routeStopContext';
import type { Weekday } from '../domain/types';
import { Icon } from './Icon';
import { tripConditionSummary } from './TripConditions';

type RouteStop = RouteSearchResult['matchedStops'][number];

export function MatchedStop({ row, weekday, detail = false }: { row: RouteStop; weekday: Weekday | null; detail?: boolean }) {
  const { roleLabel, time, viaCondition, conflictNote, arrivalNotListed } = getRouteStopContext(dataset, row, weekday);
  const arrival = row.stop.role === 'alighting' || row.stop.role === 'campusArrival';
  return <span className="matched-stop">
    <span className="matched-stop-line">
      <span className="matched-role">{detail && row.stop.role === 'alighting' ? '시간표상 하차 지점' : roleLabel}</span>
      <strong className="matched-name">{row.stop.displayName}</strong>
      {time.value && <strong className="matched-clock">{time.value}</strong>}
    </span>
    {time.value && row.stop.role === 'via' &&
      <small>{time.label}</small>}
    {!time.value && !viaCondition && !conflictNote && <small>{detail && arrivalNotListed ? '도착 시각은 시간표에 없어요.' : arrival ? '도착 시각 미제공' : '시각 미제공'}</small>}
    {viaCondition && <small>{viaCondition}</small>}
    {conflictNote && <strong className="list-conflict">{conflictNote}</strong>}
  </span>;
}

export function RouteTripCard({ result, weekday, onOpen }: {
  result: RouteSearchResult;
  weekday: Weekday | null;
  onOpen: (tripId: string, occurrenceId?: string) => void;
}) {
  const { trip, matchedStops } = result;
  const homeward = trip.direction === 'fromCampus';
  const timing = getTripTime(trip.tripId, weekday);
  const friday = homeward && weekday === null ? getTripTime(trip.tripId, 'FRI') : null;
  const showBoth = !!(friday?.isOverride && friday.value && friday.value !== timing.value);
  const clock = <strong>{showBoth && '기본 '}{timing.value || '미제공'}</strong>;
  const replacement = timing.isOverride ? <em>금요일 대체</em> :
    showBoth ? <em>금요일 {friday.value} 대체</em> : null;
  const condition = tripConditionSummary(trip, weekday);
  const status = condition.text && <span className="trip-card-meta">
    {condition.warning && <strong className="list-conflict">{condition.warning}</strong>}
    {condition.text}
  </span>;
  const icon = <span className={`route-symbol${homeward ? ' homeward' : ''}`}><Icon name="bus"/></span>;
  const title = <span className="trip-card-name">{trip.displayName}</span>;

  if (!matchedStops.length) {
    return <button id={`route-result-${trip.tripId}`} className="trip-card" onClick={() => onOpen(trip.tripId)}>
      {icon}
      <span className="trip-card-copy">
        {title}<span className="trip-card-description">{trip.summary}</span>{status}
      </span>
      <span className="trip-card-time">
        {clock}<span>{homeward ? timing.label : '첫 승차 지점 시각'}</span>{replacement}
      </span>
      <Icon name="arrow"/>
    </button>;
  }

  let schoolDeparture = null;
  const schoolOnly = homeward && matchedStops.length === 1 && matchedStops[0].timeRule?.timeKind === 'departureFromCampus';
  if (homeward) {
    const school = getTripStops(trip.tripId).find(row => row.timeRule?.timeKind === 'departureFromCampus');
    const schoolWarning = schoolOnly && school && getRouteStopContext(dataset, school, weekday).conflictNote;
    schoolDeparture = <span className="matched-departure">
      <span>학교 출발 · {school?.stop.locationDescription.value || '학교 승차 위치 확인 필요'}</span>
      {clock}{replacement && <small>{replacement}</small>}
      {schoolWarning && <strong className="list-conflict">{schoolWarning}</strong>}
    </span>;
  }
  const heading = <span className="matched-trip-heading">{icon}{title}</span>;

  if (matchedStops.length === 1) {
    const row = matchedStops[0];
    return <button id={`route-result-${row.occurrence.tripStopId}`} className="trip-card matched-trip" onClick={() => onOpen(trip.tripId, row.occurrence.tripStopId)}>
      {heading}{schoolDeparture}
      {schoolOnly ? <span className="trip-card-description">{trip.summary}</span> : <MatchedStop row={row} weekday={weekday}/>}
      {status}
    </button>;
  }
  return <article className="trip-card matched-trip" aria-label={trip.displayName}>
    {heading}{schoolDeparture}{status}
    <div className="matched-options" role="group" aria-label={`${trip.displayName}에서 찾은 지점`}>
      {matchedStops.map(row => <button type="button" key={row.occurrence.tripStopId} id={`route-result-${row.occurrence.tripStopId}`}
        onClick={() => onOpen(trip.tripId, row.occurrence.tripStopId)}>
        <MatchedStop row={row} weekday={weekday}/><Icon name="arrow"/>
      </button>)}
    </div>
  </article>;
}
