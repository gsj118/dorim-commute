import { describe, expect, it } from 'vitest';
import { dataset, getStopTime, getTripStops, getTripTime } from '../src/data';
import { evaluateRecommendations, haversineMeters } from '../src/domain/recommend';
import { resolveTime } from '../src/domain/time';
import { validCoordinates, validateDataset } from '../src/domain/validate';
import type { Coordinates, Dataset, Fact, PlaceSelection, ServiceRule, StopRole, Weekday } from '../src/domain/types';

// All coordinates below are explicitly synthetic calculation fixtures, never bus-stop facts.
const UP = 'tp-s25-to-songjeong-01';
const DOWN = 'tp-s25-from-jinwol-03';
const place: PlaceSelection = { provider: 'verifiedLocal', providerPlaceId: null, selectionId: 'synthetic-place', kind: 'manualPoint', name: '가상 시험 장소', roadAddress: null, lotAddress: null, regionLabel: null, detailUrl: null, coordinates: { crs: 'WGS84', latitude: 35, longitude: 126 }, coordinateSource: 'synthetic-test-fixture-only', selectedAt: '2026-11-06T00:00:00+09:00', selectionState: 'explicitlySelected', validationState: 'checked' };
const request = { direction: 'toCampus' as const, weekday: 'MON' as const, place };
// Keep the P015 representative regression scope stable while the production dataset expands.
const representativeData = structuredClone(dataset);
representativeData.coverage.supportedTripStopIds = dataset.occurrences.filter(o => [UP, DOWN].includes(o.tripId)).map(o => o.tripStopId);
representativeData.coverage.supportedTripIds = [UP, DOWN];
function mock<T>(value: T, source: Fact<unknown>, location = false): Fact<T> {
  return { ...structuredClone(source), value, verificationStatus: 'MOCK', informationState: 'unverified', originKind: 'syntheticFixture', conditionCheck: 'checked', locationCheck: location ? 'actualStopVerified' : 'notApplicable', missingReason: '가상 시험 전용' } as Fact<T>;
}
function fixture(): Dataset {
  const data = structuredClone(representativeData);
  data.metadata.dataKind = 'syntheticDemo';
  data.serviceRules.filter(rule => rule.scope === 'trip').forEach(rule => { rule.weekdays = mock<Weekday[]>(['MON','TUE','WED','THU','FRI'], rule.weekdays); });
  data.occurrences.forEach(occ => {
    const stop = data.stops.find(item => item.stopId === occ.stopId)!;
    occ.callPermission = mock<StopRole>(stop.role, occ.callPermission);
  });
  data.locations.forEach((location, index) => {
    const stop = data.stops.find(item => item.stopId === location.stopId)!;
    location.coordinates = mock<Coordinates>({ crs: 'WGS84', latitude: 35 + index * .001, longitude: 126 }, location.coordinates, true);
    location.positionKind = stop.role === 'alighting' ? 'actualAlightingPoint' : 'actualBoardingPoint';
  });
  return data;
}

describe('official snapshot and typed time semantics', () => {
  it('passes structural, reference and fact checks without synthetic values', () => {
    expect(validateDataset(dataset)).toEqual([]);
    expect(dataset.trips).toHaveLength(38);
    expect(dataset.locations.filter(location => location.coordinates.value !== null).every(location => location.coordinates.locationCheck === 'officialMarkerObserved' && location.positionKind === 'officialMapMarker')).toBe(true);
    expect(JSON.stringify(dataset)).not.toContain('syntheticFixture');
  });
  it('uses all six separate boarding times, including CU 07:14', () => {
    expect(getTripStops(UP).map(item => getStopTime(item.occurrence.tripStopId, null).value)).toEqual(['07:10','07:14','07:18','07:21','07:27','07:30',null]);
    expect(getStopTime(getTripStops(UP)[1].occurrence.tripStopId, null).label).toBe('정류장 승차 시각');
  });
  it('replaces Friday school departure once and preserves no arrival times', () => {
    expect(getTripTime(DOWN, 'MON').value).toBe('17:30');
    expect(getTripTime(DOWN, 'FRI')).toMatchObject({ value: '15:30', kind: 'departureFromCampus', isOverride: true });
    expect(dataset.trips.filter(trip => trip.tripId === DOWN)).toHaveLength(1);
    expect(getTripStops(DOWN).slice(1).every(item => getStopTime(item.occurrence.tripStopId, 'FRI').value === null)).toBe(true);
  });
  it('preserves user-confirmed school text independently of unverified coordinates', () => {
    const school = getTripStops(DOWN)[0];
    expect(school.stop.locationDescription).toMatchObject({ value: 'MNU 스퀘어 앞', informationState: 'userConfirmed', originKind: 'authorReport', locationCheck: 'userConfirmedText' });
    expect(school.location?.coordinates.value).toBeNull();
    expect(dataset.serviceRules[0].holidayOperation).toMatchObject({ value: 'no', informationState: 'userConfirmed' });
  });
  it('actual dataset produces zero distance candidates with explicit missing reasons', () => {
    const result = evaluateRecommendations(representativeData, request);
    expect(result.candidates).toEqual([]);
    expect(result.pending.length + result.excluded.length + result.references.length).toBe(6);
    expect(result.pending[0].reasons).toEqual(expect.arrayContaining(['OFFICIAL_MARKER_ONLY','WEEKDAY_UNVERIFIED','CALL_PERMISSION_UNVERIFIED']));
    expect(result.pending[0]).not.toHaveProperty('distanceMeters');
  });
  it('homeward results evaluate ten alighting relationships, not the campus node', () => {
    const result = evaluateRecommendations(representativeData, { ...request, direction: 'fromCampus' });
    expect(result.pending.length + result.excluded.length + result.references.length).toBe(10);
    expect(result.pending.every(item => !item.reasons.includes('CAMPUS_BOARDING_UNVERIFIED'))).toBe(true);
    expect(result.candidates).toHaveLength(0);
  });
});

describe('recommendation gates and synthetic-only distance calculation', () => {
  it('filters nearest invalid stop before sorting and retains farther eligible ones', () => {
    const data = fixture();
    const nearest = data.occurrences.find(item => item.tripId === UP)!;
    const rule: ServiceRule = { ...structuredClone(data.serviceRules[0]), ruleId: 'synthetic-stop-tuesday', scope: 'stop', targetIds: [nearest.tripStopId], weekdays: mock<Weekday[]>(['TUE'], data.serviceRules[0].weekdays) };
    data.serviceRules.push(rule); nearest.callRuleIds.push(rule.ruleId);
    const result = evaluateRecommendations(data, request);
    expect(result.candidates).toHaveLength(5);
    expect(result.excluded.find(item => item.occurrenceId === nearest.tripStopId)?.reasons).toContain('NO_TRIP_FOR_CONDITION');
    expect(result.candidates[0].distanceMeters).toBeGreaterThan(0);
    expect(result.candidates.map(item => item.distanceMeters)).toEqual([...result.candidates.map(item => item.distanceMeters)].sort((a,b) => a-b));
    expect(result.globalReasons).toContain('SYNTHETIC_TEST_ONLY');
  });
  it('does not treat unknown weekdays as confirmed non-operation', () => {
    const data = fixture(); data.serviceRules[0].weekdays = structuredClone(dataset.serviceRules[0].weekdays);
    const result = evaluateRecommendations(data, request);
    expect(result.candidates).toHaveLength(0); expect(result.excluded).toHaveLength(0);
    expect(result.references[0].reasons).toContain('WEEKDAY_UNVERIFIED');
  });
  it('requires explicit place and weekday selections', () => {
    const data = fixture();
    expect(evaluateRecommendations(data, { ...request, weekday: null }).globalReasons).toContain('WEEKDAY_REQUIRED_FOR_MATCH');
    expect(evaluateRecommendations(data, { ...request, place: { ...place, selectionState: 'invalidated' } }).candidates).toHaveLength(0);
    expect(evaluateRecommendations(data, { ...request, place: null }).globalReasons).toContain('PLACE_SELECTION_REQUIRED');
  });
  it('rejects facility centers, missing coordinates and wrong CRS', () => {
    for (const mutate of [(data: Dataset) => { data.locations[0].positionKind = 'facilityOnly'; }, (data: Dataset) => { data.locations[0].coordinates.locationCheck = 'facilityIdentifiedOnly'; }, (data: Dataset) => { data.locations[0].coordinates.value = null; }]) {
      const data = fixture(); mutate(data);
      expect(evaluateRecommendations(data, request).pending[0].reasons).toContain('POSITION_UNVERIFIED');
    }
    expect(validCoordinates({ crs: 'EPSG:5179', latitude: 35, longitude: 126 })).toBe(false);
    expect(validCoordinates({ crs: 'WGS84', latitude: 126, longitude: 35 })).toBe(false);
    expect(validCoordinates({ crs: 'WGS84', latitude: NaN, longitude: 126 })).toBe(false);
  });
  it('keeps related conflicts out of distance results without suppressing unrelated trips', () => {
    const data = fixture();
    data.conflicts.push({ ...structuredClone(data.conflicts[0]), conflictId: 'synthetic-conflict', withheldTargetIds: [data.occurrences[0].tripStopId] });
    const result = evaluateRecommendations(data, request);
    expect(result.candidates).toHaveLength(5);
    expect(result.pending[0].reasons).toContain('CONFLICTING_SOURCE');
  });
  it('withholds a relation with unverified stop sequence from every distance candidate list', () => {
    const data = fixture();
    data.occurrences[0].sequence.value = null;
    data.occurrences[0].sequence.verificationStatus = 'UNVERIFIED';
    const result = evaluateRecommendations(data, request);
    expect(result.candidates.some(item => item.occurrenceId === data.occurrences[0].tripStopId)).toBe(false);
    expect(result.references.some(item => item.occurrenceId === data.occurrences[0].tripStopId)).toBe(false);
    expect(result.pending.find(item => item.occurrenceId === data.occurrences[0].tripStopId)?.reasons).toContain('TRIP_STOP_RELATION_UNVERIFIED');
  });
  it('blocks homeward recommendation when school boarding text is unverified', () => {
    const data = fixture();
    const school = data.stops.find(stop => stop.direction === 'fromCampus' && stop.role === 'boarding')!;
    school.locationDescription.value = null;
    const result = evaluateRecommendations(data, { ...request, direction: 'fromCampus' });
    expect(result.candidates).toHaveLength(0);
    expect(result.references).toHaveLength(10);
    expect(result.references.every(item => item.reasons.includes('CAMPUS_BOARDING_UNVERIFIED'))).toBe(true);
  });
  it('preserves arrival unknown instead of inventing campus arrival', () => {
    const result = evaluateRecommendations(fixture(), { ...request, timeCondition: { kind: 'campusArriveBy', minutes: 540 } });
    expect(result.candidates).toHaveLength(0);
    expect(result.references[0].reasons).toContain('ARRIVAL_CONDITION_UNVERIFIABLE');
    expect(result.excluded).toHaveLength(0);
  });
  it('applies Friday replacement before school-ready-after filtering', () => {
    const result = evaluateRecommendations(fixture(), { ...request, direction: 'fromCampus', weekday: 'FRI', timeCondition: { kind: 'campusReadyAfter', minutes: 16 * 60 } });
    expect(result.candidates).toHaveLength(0); expect(result.excluded).toHaveLength(10);
  });
  it('applies user-confirmed holiday no-operation and special-day notice requirement', () => {
    expect(evaluateRecommendations(fixture(), { ...request, holiday: 'yes' }).excluded).toHaveLength(6);
    expect(evaluateRecommendations(fixture(), { ...request, specialDate: 'yes' }).references[0].reasons).toContain('SPECIAL_DATE_NOTICE_REQUIRED');
  });
  it('holds time when multiple or unknown replacement conditions exist', () => {
    const data = fixture(); const time = data.timeRules.find(rule => rule.timeKind === 'departureFromCampus')!;
    time.overrides.push(structuredClone(time.overrides[0]));
    expect(resolveTime(data, time, 'FRI').value).toBeNull();
    time.overrides.pop(); data.serviceRules.find(rule => rule.ruleId === time.overrides[0].conditionRuleId)!.weekdays.value = null;
    expect(resolveTime(data, time, 'FRI').value).toBeNull();
  });
  it('calculates symmetric finite nonnegative distance including legitimate zero', () => {
    const a = place.coordinates!, b: Coordinates = { crs: 'WGS84', latitude: 35.1, longitude: 126.2 };
    expect(haversineMeters(a,a)).toBe(0);
    expect(haversineMeters(a,b)).toBeCloseTo(haversineMeters(b,a), 8);
    expect(haversineMeters(a,b)).toBeGreaterThan(0);
    expect(() => haversineMeters({ ...a, latitude: Infinity },b)).toThrow();
    expect(validCoordinates({ crs: 'WGS84', latitude: 0, longitude: 0 })).toBe(true);
  });
});

describe('dataset validation boundaries', () => {
  it('returns errors for malformed external JSON without throwing', () => {
    expect(validateDataset(null).length).toBeGreaterThan(0);
    const badRecord = structuredClone(dataset) as unknown as { stops: unknown[] };
    badRecord.stops[0] = null;
    expect(validateDataset(badRecord).length).toBeGreaterThan(0);
    const badFact = structuredClone(dataset);
    badFact.locations[0].coordinates = null as unknown as Fact<Coordinates>;
    expect(validateDataset(badFact).length).toBeGreaterThan(0);
    const badEnum = structuredClone(dataset);
    badEnum.serviceRules[0].weekdays.conditionCheck = 'arbitrary' as never;
    expect(validateDataset(badEnum).some(error => error.includes('상태 오류'))).toBe(true);
  });
  it('rejects MOCK in official data, duplicate IDs and absent references', () => {
    const mixed = structuredClone(dataset); mixed.locations[0].coordinates = mock(place.coordinates!, mixed.locations[0].coordinates, true);
    expect(validateDataset(mixed).some(error => error.includes('MOCK'))).toBe(true);
    const duplicate = structuredClone(dataset); duplicate.stops.push(structuredClone(duplicate.stops[0]));
    expect(validateDataset(duplicate).some(error => error.includes('중복'))).toBe(true);
    const absent = structuredClone(dataset); absent.occurrences[0].stopId = 'missing';
    expect(validateDataset(absent).some(error => error.includes('참조 오류'))).toBe(true);
  });
  it('rejects school departure attached to a Gwangju alighting stop', () => {
    const data = structuredClone(dataset); data.timeRules.find(rule => rule.targetTripStopId === getTripStops(DOWN)[1].occurrence.tripStopId)!.timeKind = 'departureFromCampus';
    expect(validateDataset(data).some(error => error.includes('학교 출발 시각 의미 오류'))).toBe(true);
  });
});

describe('official marker references and bounded comparison', () => {
  const realPlace: PlaceSelection = { ...place, provider: 'kakao', selectionId: 'test-selection-at-recorded-marker', name: '시험 선택점', lotAddress: '광주광역시 서구 시험용 주소', coordinates: dataset.locations.find(location => location.stopId === getTripStops(UP)[1].stop.stopId)!.coordinates.value, coordinateSource: 'test fixture at recorded Unibus marker, not a live Kakao search' };
  it('compares actual recorded marker coordinates without promoting them to confirmed boarding points', () => {
    const result = evaluateRecommendations(representativeData, { ...request, place: realPlace });
    expect(result.candidates).toHaveLength(0);
    expect(result.references.length).toBeGreaterThan(1);
    expect(result.references[0].distanceMeters).toBe(0);
    expect(result.references.every(item => item.reasons.includes('OFFICIAL_MARKER_ONLY') && item.reasons.includes('WEEKDAY_UNVERIFIED'))).toBe(true);
    expect(result.references.map(item => item.distanceMeters)).toEqual([...result.references.map(item => item.distanceMeters)].sort((a,b) => a-b));
    expect(result.references.every(item => item.tripId === UP)).toBe(true);
  });
  it('uses destination-to-alighting distance and school departure for homeward references', () => {
    const location = getTripStops(DOWN)[4].location!;
    const result = evaluateRecommendations(representativeData, { ...request, direction: 'fromCampus', weekday: 'FRI', place: { ...realPlace, coordinates: location.coordinates.value } });
    expect(result.references.length).toBeGreaterThan(0);
    expect(result.references[0].distanceMeters).toBe(0);
    expect(result.references.every(item => item.tripId === DOWN && item.time === '15:30')).toBe(true);
    expect(result.references.some(item => item.stopId === getTripStops(DOWN)[0].stop.stopId)).toBe(false);
  });
  it('applies user-adjustable radius, rejects unsupported regions and preserves empty recovery reasons', () => {
    const narrow = evaluateRecommendations(representativeData, { ...request, place: realPlace, radiusMeters: 1000 });
    const wide = evaluateRecommendations(representativeData, { ...request, place: realPlace, radiusMeters: 5000 });
    expect(wide.references.length).toBeGreaterThan(narrow.references.length);
    expect(narrow.excluded.some(item => item.reasons.includes('OUTSIDE_RADIUS'))).toBe(true);
    const far = evaluateRecommendations(representativeData, { ...request, place: { ...realPlace, coordinates: { crs: 'WGS84', latitude: 35, longitude: 126 } } });
    expect(far.references).toHaveLength(0); expect(far.globalReasons).toContain('NO_NEARBY_STOPS');
    const outside = evaluateRecommendations(representativeData, { ...request, place: { ...realPlace, lotAddress: '서울특별시 중구 시험 주소' } });
    expect(outside.references).toHaveLength(0); expect(outside.globalReasons).toContain('REGION_UNSUPPORTED');
    expect(evaluateRecommendations(representativeData, { ...request, place: { ...realPlace, lotAddress: '전남광주통합특별시 서구 시험 주소' } }).references.length).toBeGreaterThan(0);
  });
  it('keeps absent locations, facility candidates and source conflicts out of reference distances', () => {
    for (const mode of ['missing', 'facility', 'conflict', 'unattributed'] as const) {
      const data = structuredClone(dataset);
      const stop = getTripStops(UP)[1];
      const location = data.locations.find(item => item.locationId === stop.occurrence.locationId)!;
      if (mode === 'missing') { location.coordinates.value = null; location.coordinates.verificationStatus = 'UNVERIFIED'; }
      if (mode === 'facility') location.positionKind = 'facilityOnly';
      if (mode === 'unattributed') location.coordinates.evidence = [];
      if (mode === 'conflict') data.conflicts.push({ ...structuredClone(data.conflicts[0]), conflictId: 'test-marker-conflict', withheldTargetIds: [stop.occurrence.tripStopId] });
      const result = evaluateRecommendations(data, { ...request, place: realPlace });
      expect(result.references.some(item => item.occurrenceId === stop.occurrence.tripStopId)).toBe(false);
      expect(result.pending.some(item => item.occurrenceId === stop.occurrence.tripStopId)).toBe(true);
    }
  });
});

