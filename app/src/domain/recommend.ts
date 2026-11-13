import { inGwangju, inNaju } from './placeRegion';
import type { Coordinates, Dataset, Direction, PlaceSelection, StopLocation, StopOccurrence, TimeCondition, Weekday } from './types';
import { isConfirmed, minutesOf, resolveTime } from './time';
import { validCoordinates } from './validate';
import type { DiscoveryAnchor } from '../data/discoveryAnchors';
import { countDiscoveryCoverage, type DiscoveryCoverage } from './discoveryCoverage';
export type { DiscoveryCoverage } from './discoveryCoverage';

export interface RecommendationRequest {
  direction: Direction;
  weekday: Weekday | null;
  place: PlaceSelection | null;
  timeCondition?: TimeCondition | null;
  holiday?: 'yes' | 'no' | 'unknown';
  specialDate?: 'yes' | 'no' | 'unknown';
  radiusMeters?: number;
  maxResults?: number;
  sortBy?: 'distance' | 'time';
}
export interface RecommendationCandidate {
  stopId: string;
  tripId: string;
  occurrenceId: string;
  locationId: string;
  distanceMeters: number;
  time: string;
  dataKind: Dataset['metadata']['dataKind'];
  basis: 'snapshot';
  explanation: string;
  anchor?: DiscoveryAnchor;
  groupKey?: string;
}
export interface PendingRelation { stopId: string; tripId: string; occurrenceId: string; reasons: string[]; }
export interface ReferenceCandidate extends Omit<RecommendationCandidate, 'time'> { time: string | null; reasons: string[]; }
export interface DistanceCoverage {
  listedTrips: number;
  listedOccurrences: number;
  comparableTrips: number;
  comparableOccurrences: number;
  sharedMarkerTrips: number;
}
export interface RecommendationResult { candidates: RecommendationCandidate[]; references: ReferenceCandidate[]; pending: PendingRelation[]; excluded: PendingRelation[]; globalReasons: string[]; coverage: DistanceCoverage; discoveryCoverage: DiscoveryCoverage; }

// Prototype comparison choices, not measured walkability or service boundaries.
export const SEARCH_SETTINGS = { radiusMeters: 3000, radiusChoices: [1000, 3000, 5000], maxResults: 10, resultChoices: [5, 10, 20] } as const;
export type ComparableCandidate = RecommendationCandidate | ReferenceCandidate;
export interface CandidateGroup { stopId: string; locationId: string; distanceMeters: number; relations: ComparableCandidate[]; }
export function candidateGroupKey(candidate: ComparableCandidate): string {
  return candidate.groupKey ?? candidate.locationId;
}

/** A common landmark groups journeys for comparison, without merging their stop records. */
export function groupRecommendationCandidates(items: ComparableCandidate[]): CandidateGroup[] {
  const groups = new Map<string, CandidateGroup>();
  for (const item of items) {
    const key = candidateGroupKey(item);
    if (!groups.has(key)) groups.set(key, { stopId: item.stopId, locationId: item.locationId, distanceMeters: item.distanceMeters, relations: [] });
    groups.get(key)!.relations.push(item);
  }
  return [...groups.values()];
}
export function usableLocation(location: StopLocation | undefined, synthetic = false): location is StopLocation {
  if (!location || !isConfirmed(location.coordinates, synthetic) || !validCoordinates(location.coordinates.value)) return false;
  const fact = location.coordinates;
  if (fact.currentness === 'superseded') return false;
  if (location.positionKind === 'officialMapMarker') return fact.locationCheck === 'officialMarkerObserved' && fact.originKind === 'officialUi' && fact.evidence.length > 0 && fact.documentCheck === 'checked';
  return fact.locationCheck === 'actualStopVerified' && ['actualBoardingPoint', 'actualAlightingPoint', 'campusArrival'].includes(location.positionKind);
}

export const reasonLabels: Record<string, string> = {
  PLACE_SELECTION_REQUIRED: '검색한 장소를 명시적으로 선택해 주세요.',
  WEEKDAY_REQUIRED_FOR_MATCH: '비교할 요일을 선택해 주세요.',
  POSITION_UNVERIFIED: '해당 방향 정류장의 숫자좌표·도로변 위치가 미확인입니다.',
  OFFICIAL_MARKER_ONLY: '공식 Unibus 지도 표시점입니다. 실제 도로변 승하차 위치까지 확인한 좌표는 아닙니다.',
  SHARED_SEQUENCE_LOCATION: 'PDF의 동일 방향·동일 경유 순서를 근거로 진월③ 지도 표시점에 연결했습니다. 이 편의 별도 지도·도로변은 미확인입니다.',
  DISCOVERY_ANCHOR: '기준점 주변을 지나는 편입니다. 해당 편의 실제 승하차 위치는 확인이 필요합니다.',
  STALE_OR_NOT_LIVE: '학기 문서 스냅샷이며 특정 날짜의 실제 운행을 확인한 정보가 아닙니다.',
  REGION_UNCONFIRMED: '정밀 지원 경계는 미확정이며 좌표를 확보한 수록 관계 주변만 비교합니다.',
  REGION_UNSUPPORTED: '현재 광주광역시와 나주시 주소만 주변 후보를 비교합니다. 다른 지역은 노선 목록을 확인해 주세요.',
  DATASET_INSUFFICIENT: '모든 추천 조건을 충족하는 수록 관계가 부족합니다.',
  WEEKDAY_UNVERIFIED: '기본 운행요일 근거가 부족합니다.',
  CALL_PERMISSION_UNVERIFIED: '해당 방향의 실제 승하차 허용 조건 확인이 필요합니다.',
  CALL_PERMISSION_NOT_MATCHING: '확인된 정류장 이용 조건이 이 방향의 승하차 역할과 맞지 않습니다.',
  CAMPUS_BOARDING_UNVERIFIED: '학교 승차 관계의 확인이 필요합니다.',
  REQUIRED_TIME_UNVERIFIED: '조건에 맞는 필수 시각 확인이 필요합니다.',
  CONFLICTING_SOURCE: '운행 정보 확인 필요',
  SERVICE_RULE_UNVERIFIED: '운행 조건의 근거가 부족합니다.',
  SPECIAL_DATE_NOTICE_REQUIRED: '특수일의 별도 공지를 확인해야 합니다.',
  HOLIDAY_OPERATION_UNVERIFIED: '공휴일 운행 여부를 확인해야 합니다.',
  OUTSIDE_RADIUS: '선택한 직선거리 반경 안에 없는 수록 지점입니다.',
  RESULT_LIMIT: '표시 개수 제한으로 생략된 후보입니다. 표시할 지점 수를 늘리거나 전체 시간표에서 확인해 주세요.',
  NO_NEARBY_STOPS: '현재 선택한 요일·시간·반경과 확인 수준에서 표시할 후보가 없습니다. 조건을 바꾸거나 전체 노선 목록을 확인해 주세요.',
  WEEKEND_NO_SERVICE: '주말에는 정규 통학버스가 운행하지 않습니다.',
  NO_TRIP_FOR_CONDITION: '확인된 문서 조건에 맞지 않습니다.',
  TIME_NOT_MATCHING: '확인된 승차·학교 출발 시각이 입력한 시간 조건과 맞지 않습니다.',
  HOLIDAY_NO_SERVICE: '공휴일에는 운행하지 않습니다.',
  INVALID_TIME_CONDITION: '시간 조건을 다시 확인해 주세요.',
  ARRIVAL_CONDITION_UNVERIFIABLE: '공식 학교 도착시각이 없어 도착 조건 충족 여부를 확인할 수 없습니다.',
  TRIP_STOP_RELATION_UNVERIFIED: '해당 방향·운행편의 정류장 경유 관계 확인이 필요합니다.',
};

/** Model constant, not a measured walking route. Callers must pass all provenance gates first. */
export function haversineMeters(a: Coordinates, b: Coordinates): number {
  if (!validCoordinates(a) || !validCoordinates(b)) throw new Error('유효한 WGS84 좌표가 필요합니다.');
  const rad = (value: number) => value * Math.PI / 180;
  const sinLat = Math.sin(rad(b.latitude - a.latitude) / 2);
  const sinLon = Math.sin(rad(b.longitude - a.longitude) / 2);
  const h = Math.min(1, Math.max(0, sinLat ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * sinLon ** 2));
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function evaluateRecommendations(
  data: Dataset, request: RecommendationRequest, anchors?: ReadonlyMap<string, DiscoveryAnchor>,
): RecommendationResult {
  const role = request.direction === 'toCampus' ? 'boarding' : 'alighting';
  const listedTripIds = new Set(data.trips.filter(trip => trip.direction === request.direction).map(trip => trip.tripId));
  const listedStopIds = new Set(data.stops.filter(stop => stop.direction === request.direction && stop.role === role).map(stop => stop.stopId));
  const coverage: DistanceCoverage = {
    listedTrips: listedTripIds.size,
    listedOccurrences: data.occurrences.filter(occ => listedTripIds.has(occ.tripId) && listedStopIds.has(occ.stopId)).length,
    comparableTrips: 0, comparableOccurrences: 0, sharedMarkerTrips: 0,
  };
  const comparableTripIds = new Set<string>();
  const sharedMarkerTripIds = new Set<string>();
  const inventory = countDiscoveryCoverage();
  const result: RecommendationResult = {
    candidates: [], references: [], pending: [], excluded: [], globalReasons: [], coverage, discoveryCoverage: inventory.totals(),
  };
  const synthetic = data.metadata.dataKind === 'syntheticDemo';
  const radius = SEARCH_SETTINGS.radiusChoices.includes(request.radiusMeters as 1000 | 3000 | 5000) ? request.radiusMeters! : SEARCH_SETTINGS.radiusMeters;
  const activeTripIds = new Set(data.coverage.supportedTripIds);
  const activeStopIds = new Set(data.coverage.supportedStopIds);
  const activeOccurrenceIds = new Set(data.coverage.supportedTripStopIds);
  const placeReady = !!request.place && request.place.selectionState === 'explicitlySelected' && request.place.validationState === 'checked' && !!request.place.coordinateSource && validCoordinates(request.place.coordinates);
  const weekend = !synthetic && (request.weekday === 'SAT' || request.weekday === 'SUN');
  if (weekend) result.globalReasons.push('WEEKEND_NO_SERVICE');
  if (!placeReady) result.globalReasons.push('PLACE_SELECTION_REQUIRED');
  if (request.weekday === null) result.globalReasons.push('WEEKDAY_REQUIRED_FOR_MATCH');
  result.globalReasons.push('STALE_OR_NOT_LIVE');
  if (!data.coverage.verifiedBoundary.value) result.globalReasons.push('REGION_UNCONFIRMED');
  if (synthetic) result.globalReasons.push('SYNTHETIC_TEST_ONLY');
  const address = request.place?.lotAddress || request.place?.roadAddress || request.place?.regionLabel || '';
  // Provider labels are preserved verbatim; this allowlist is search coverage,
  // not an assertion about current administrative divisions.
  const regionSupported = synthetic || inGwangju(address) || inNaju(address);
  if (placeReady && !regionSupported) result.globalReasons.push('REGION_UNSUPPORTED');

  function campusBoarding(tripId: string) {
    return data.occurrences.find(occ => occ.tripId === tripId && data.stops.some(stop => stop.stopId === occ.stopId && stop.direction === 'fromCampus' && stop.role === 'boarding' && stop.campusId === 'dorim'));
  }
  function getTime(occ: StopOccurrence | undefined) { return resolveTime(data, data.timeRules.find(time => occ?.timeRuleIds.includes(time.timeRuleId)), request.weekday); }

  for (const occurrence of data.occurrences) {
    const trip = data.trips.find(item => item.tripId === occurrence.tripId);
    const stop = data.stops.find(item => item.stopId === occurrence.stopId);
    if (!trip || !stop || !listedTripIds.has(trip.tripId) || !listedStopIds.has(stop.stopId)) continue;
    const school = request.direction === 'fromCampus' ? campusBoarding(trip.tripId) : undefined;
    const relevantTargets = [trip.tripId, stop.stopId, occurrence.tripStopId, occurrence.locationId, ...(school ? [school.tripStopId, school.stopId] : [])];
    const relatedConflict = data.conflicts.some(conflict => conflict.state === 'open' && conflict.withheldTargetIds.some(id => relevantTargets.includes(id)));
    const pending: string[] = [], no: string[] = [];
    const listedForComparison = activeOccurrenceIds.has(occurrence.tripStopId) && activeTripIds.has(trip.tripId) && activeStopIds.has(stop.stopId);
    if (weekend) no.push('WEEKEND_NO_SERVICE');
    if (!listedForComparison) pending.push('DATASET_INSUFFICIENT');
    if (!isConfirmed(occurrence.sequence, synthetic)) pending.push('TRIP_STOP_RELATION_UNVERIFIED');
    if (occurrence.locationMapping?.kind === 'sameDirectionalSequence') pending.push('SHARED_SEQUENCE_LOCATION');
    if (!placeReady) pending.push('PLACE_SELECTION_REQUIRED');
    if (!regionSupported) pending.push('REGION_UNSUPPORTED');
    if (request.weekday === null) pending.push('WEEKDAY_REQUIRED_FOR_MATCH');
    const rules = [...trip.serviceRuleIds, ...occurrence.callRuleIds].map(id => data.serviceRules.find(rule => rule.ruleId === id));
    if (rules.length === 0 || rules.some(rule => !rule)) pending.push('SERVICE_RULE_UNVERIFIED');
    for (const rule of rules) {
      if (!rule) continue;
      if (!rule.targetIds.includes(trip.tripId) && !rule.targetIds.includes(occurrence.tripStopId)) { pending.push('SERVICE_RULE_UNVERIFIED'); continue; }
      if (rule.weekdays.verificationStatus === 'CONFLICTED' || rule.weekdays.conditionCheck === 'conflict') pending.push('CONFLICTING_SOURCE');
      else if (!isConfirmed(rule.weekdays, synthetic) || rule.weekdays.conditionCheck !== 'checked') pending.push('WEEKDAY_UNVERIFIED');
      else if (!relatedConflict && request.weekday !== null && !rule.weekdays.value!.includes(request.weekday)) no.push('NO_TRIP_FOR_CONDITION');
      if (request.holiday === 'yes') {
        if (isConfirmed(rule.holidayOperation, synthetic) && rule.holidayOperation.value === 'no') no.push('HOLIDAY_NO_SERVICE');
        else if (rule.holidayOperation.value !== 'yes') pending.push('HOLIDAY_OPERATION_UNVERIFIED');
      }
      if (request.specialDate === 'yes') pending.push('SPECIAL_DATE_NOTICE_REQUIRED');
    }
    if (!isConfirmed(occurrence.callPermission, synthetic)) pending.push('CALL_PERMISSION_UNVERIFIED');
    else if (occurrence.callPermission.value !== stop.role) no.push('CALL_PERMISSION_NOT_MATCHING');
    const location = data.locations.find(item => item.locationId === occurrence.locationId && item.stopId === stop.stopId);
    const positionReady = usableLocation(location, synthetic) && (location.positionKind === 'officialMapMarker' || location.positionKind === (request.direction === 'toCampus' ? 'actualBoardingPoint' : 'actualAlightingPoint'));
    const reference = !positionReady ? anchors?.get(occurrence.tripStopId) : undefined;
    const anchor = reference && validCoordinates(reference.coordinates) ? reference : undefined;
    if (anchor) pending.push('DISCOVERY_ANCHOR');
    if (!location || !isConfirmed(location.coordinates, synthetic) || location.coordinates.locationCheck !== 'actualStopVerified' ||
      location.positionKind !== (request.direction === 'toCampus' ? 'actualBoardingPoint' : 'actualAlightingPoint') || !validCoordinates(location.coordinates.value)) pending.push(positionReady ? 'OFFICIAL_MARKER_ONLY' : 'POSITION_UNVERIFIED');
    if (request.direction === 'fromCampus') {
      const schoolStop = data.stops.find(item => item.stopId === school?.stopId);
      const description = schoolStop?.locationDescription;
      if (!school || !description || !isConfirmed(description, synthetic) || !['actualStopVerified', 'userConfirmedText'].includes(description.locationCheck)) pending.push('CAMPUS_BOARDING_UNVERIFIED');
      if (!school || !isConfirmed(school.callPermission, synthetic) || school.callPermission.value !== 'boarding') pending.push('CAMPUS_BOARDING_UNVERIFIED');
    }
    const time = getTime(request.direction === 'fromCampus' ? school : occurrence);
    const expectedKind = request.direction === 'fromCampus' ? 'departureFromCampus' : 'boardingAtStop';
    if (!time.value || !time.conditionConfirmed || time.kind !== expectedKind) pending.push('REQUIRED_TIME_UNVERIFIED');
    const condition = request.timeCondition;
    let timeFilterChecked = false;
    if (condition) {
      if (!Number.isInteger(condition.minutes) || condition.minutes < 0 || condition.minutes >= 1440 ||
        (request.direction === 'toCampus' && !['campusArriveBy', 'boardingAfter', 'boardingBefore'].includes(condition.kind)) ||
        (request.direction === 'fromCampus' && condition.kind !== 'campusReadyAfter')) pending.push('INVALID_TIME_CONDITION');
      else if (condition.kind === 'campusArriveBy') {
        const campusArrival = data.occurrences.find(occ => occ.tripId === trip.tripId && data.stops.some(item => item.stopId === occ.stopId && item.role === 'campusArrival' && item.campusId === trip.campusId));
        const arrival = getTime(campusArrival);
        if (!arrival.value || !arrival.conditionConfirmed || arrival.kind !== 'officialArrivalAtStop') pending.push('ARRIVAL_CONDITION_UNVERIFIABLE');
        else {
          timeFilterChecked = true;
          if (minutesOf(arrival.value) > condition.minutes) no.push('TIME_NOT_MATCHING');
        }
      } else if (!relatedConflict && time.value && time.conditionConfirmed && time.kind === expectedKind) {
        timeFilterChecked = true;
        if (condition.kind === 'boardingBefore' ? minutesOf(time.value) > condition.minutes : minutesOf(time.value) < condition.minutes) no.push('TIME_NOT_MATCHING');
      }
    }
    if (relatedConflict) pending.push('CONFLICTING_SOURCE');
    const reasons = [...new Set([...no, ...pending])];
    const info = { stopId: stop.stopId, tripId: trip.tripId, occurrenceId: occurrence.tripStopId, reasons };
    // Baseline coverage is per trip/stop occurrence, before any user-selected conditions.
    const relationEligible = listedForComparison && isConfirmed(occurrence.sequence, synthetic)
      && !pending.includes('CONFLICTING_SOURCE') && !no.includes('CALL_PERMISSION_NOT_MATCHING');
    const point = positionReady ? location!.coordinates.value : anchor?.coordinates;
    if (!point) inventory.add('missing', trip.tripId);
    else if (!relationEligible) inventory.add('withheld', trip.tripId);
    else if (anchor) inventory.add('anchor', trip.tripId);
    else {
      const shared = occurrence.locationMapping?.kind === 'sameDirectionalSequence';
      inventory.add(shared ? 'shared' : 'direct', trip.tripId);
      coverage.comparableOccurrences++;
      comparableTripIds.add(trip.tripId);
      if (shared) sharedMarkerTripIds.add(trip.tripId);
    }
    if (!activeOccurrenceIds.has(occurrence.tripStopId)) continue;
    if (no.length) { result.excluded.push(info); continue; }
    const distance = placeReady && regionSupported && relationEligible && point ? haversineMeters(request.place!.coordinates!, point) : null;
    if (distance !== null && distance > radius) { result.excluded.push({ ...info, reasons: [...reasons, 'OUTSIDE_RADIUS'] }); continue; }
    if (distance === null) { result.pending.push(info); continue; }
    if (pending.length) {
      const directionLabel = request.direction === 'toCampus' ? '등교 승차' : '하교 하차';
      const pointLabel = anchor?.kind === 'facility' ? `${anchor.label} 시설 위치`
        : anchor ? `${anchor.tripName} ${anchor.label} 참고 표시점` : '공식 지도 표시점';
      result.references.push({
        stopId: stop.stopId, tripId: trip.tripId, occurrenceId: occurrence.tripStopId,
        locationId: occurrence.locationId ?? occurrence.tripStopId, distanceMeters: distance, time: time.value,
        dataKind: data.metadata.dataKind, basis: 'snapshot', reasons,
        explanation: `${directionLabel} 경유편 · 선택한 장소에서 ${pointLabel}까지 직선거리.${time.value ? ` ${request.direction === 'toCampus' ? '정류장 승차' : '학교 출발'} ${time.value}` : ''}${timeFilterChecked ? ' · 입력한 시간 조건 비교' : ''}`,
        ...(anchor && { anchor, groupKey: `anchor:${anchor.locationId}/${stop.displayName.replace(/\s+/g, '')}` }),
      });
      continue;
    }
    result.candidates.push({ stopId: stop.stopId, tripId: trip.tripId, occurrenceId: occurrence.tripStopId, locationId: location!.locationId,
      distanceMeters: distance, time: time.value!, dataKind: data.metadata.dataKind,
      basis: 'snapshot', explanation: '선택한 요일·편·실제 위치 조건을 확인한 수록 관계의 직선거리. 도보 경로나 현재 운행을 보장하지 않습니다.' });
  }
  coverage.comparableTrips = comparableTripIds.size;
  coverage.sharedMarkerTrips = sharedMarkerTripIds.size;
  result.discoveryCoverage = inventory.totals();
  const compare = (a: ComparableCandidate, b: ComparableCandidate) => {
    const timeDifference = (a.time ? minutesOf(a.time) : Infinity) - (b.time ? minutesOf(b.time) : Infinity);
    return (request.sortBy === 'time' && !Number.isNaN(timeDifference) ? timeDifference : 0) || a.distanceMeters - b.distanceMeters || a.stopId.localeCompare(b.stopId) || a.locationId.localeCompare(b.locationId) || (Number.isNaN(timeDifference) ? 0 : timeDifference) || a.tripId.localeCompare(b.tripId);
  };
  const limit = SEARCH_SETTINGS.resultChoices.includes(request.maxResults as 5 | 10 | 20) ? request.maxResults! : SEARCH_SETTINGS.maxResults;
  const all = [...result.candidates, ...result.references].sort(compare);
  const acceptedLocations = new Set(groupRecommendationCandidates(all).slice(0, limit).map(group => candidateGroupKey(group.relations[0])));
  const excess = all.filter(item => !acceptedLocations.has(candidateGroupKey(item)));
  result.candidates = result.candidates.filter(item => acceptedLocations.has(candidateGroupKey(item))).sort(compare);
  result.references = result.references.filter(item => acceptedLocations.has(candidateGroupKey(item))).sort(compare);
  result.excluded.push(...excess.map(item => ({ stopId: item.stopId, tripId: item.tripId, occurrenceId: item.occurrenceId, reasons: ['RESULT_LIMIT'] })));
  if (placeReady && regionSupported && !result.candidates.length && !result.references.length) result.globalReasons.push('NO_NEARBY_STOPS');
  if (result.candidates.length === 0) result.globalReasons.push('DATASET_INSUFFICIENT');
  return result;
}
