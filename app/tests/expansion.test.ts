import { describe, expect, it } from 'vitest';
import { dataset, getTripStops, getStopTime, getTripTime } from '../src/data';
import { evaluateRecommendations, groupRecommendationCandidates } from '../src/domain/recommend';
import { minutesOf, resolveTime } from '../src/domain/time';
import type { Dataset, PlaceSelection } from '../src/domain/types';
import observations from '../../docs/evidence/mvp3-20261106/data-marker-observations.json';
import { validateDataset } from '../src/domain/validate';

const homeward = 'tp-s25-from-jinwol-03';
const early = 'tp-s25-from-jinwol-01';
const late = 'tp-s25-to-songjeong-10';
function placeAt(locationId: string): PlaceSelection {
  return { provider: 'verifiedLocal', providerPlaceId: null, selectionId: 'test-only-marker', kind: 'manualPoint', name: '시험용 선택점', roadAddress: null, lotAddress: '광주광역시 북구 시험용 주소', regionLabel: null, detailUrl: null, coordinates: dataset.locations.find(x => x.locationId === locationId)!.coordinates.value, coordinateSource: 'test fixture at official marker; not a live API place', selectedAt: '2026-11-06T00:00:00+09:00', selectionState: 'explicitlySelected', validationState: 'checked' };
}
const destination = placeAt(getTripStops(homeward)[8].location!.locationId);
const from = { direction: 'fromCampus' as const, weekday: 'MON' as const, place: destination, radiusMeters: 5000, maxResults: 20 };
function scope(data: Dataset, trips: string[]): Dataset {
  const copy = structuredClone(data);
  copy.coverage.supportedTripIds = trips;
  copy.coverage.supportedTripStopIds = copy.occurrences.filter(o => trips.includes(o.tripId)).map(o => o.tripStopId);
  return copy;
}

describe('P016 expanded official data and candidate comparison', () => {
  it('preserves the original eight trips and their protected positions while extending coverage', () => {
    const ids = ['tp-s25-to-songjeong-01','tp-s25-from-jinwol-03','tp-s25-to-songjeong-04','tp-s25-to-songjeong-05','tp-s25-to-songjeong-06','tp-s25-to-songjeong-10','tp-s25-from-jinwol-04','tp-s25-from-jinwol-01'];
    expect(ids.every(id => dataset.trips.some(trip => trip.tripId === id))).toBe(true);
    expect(dataset.trips).toHaveLength(38);
    expect(dataset.occurrences).toHaveLength(355);
  });
  it('links all 53 new numeric coordinates to their directly observed direction, line and map marker', () => {
    let matched = 0;
    for (const trip of observations.trips) for (const marker of trip.stops) {
      const location = dataset.locations.find(x => x.coordinates.evidence.some(e => e.sourceId === 'S51' && e.claimId === `unibus-marker-${trip.lineId}-${marker.webStopId}`));
      expect(location?.coordinates.value).toEqual(marker.coordinates);
      expect(dataset.stops.find(x => x.stopId === location?.stopId)?.direction).toBe(trip.direction);
      expect(location?.coordinates.locationCheck).toBe('officialMarkerObserved');
      expect(marker.markerObservation.markers).toHaveLength(1);
      expect(marker.markerObservation.markers[0].latitude).toBeCloseTo(marker.lat, 10);
      expect(marker.markerObservation.markers[0].longitude).toBeCloseTo(marker.lng, 10);
      matched++;
    }
    expect(matched).toBe(53);
  });
  it('preserves each new morning row’s separately transcribed boarding times and unknown arrival', () => {
    const expected: Record<string, string[]> = {
      '04': ['07:00','07:06','07:11','07:13','07:15','07:18','07:20','07:25','07:30'],
      '05': ['06:50','06:55','07:00','07:03','07:06','07:09','07:10','07:13','07:17'],
      '06': ['07:10','07:13','07:14','07:15','07:17','07:21'],
      '10': ['09:20','09:23','09:28','09:31','09:32','09:33','09:35','09:39','09:40','09:43','09:48'],
    };
    for (const [n, values] of Object.entries(expected)) {
      const stops = getTripStops(`tp-s25-to-songjeong-${n}`);
      expect(stops.map(x => getStopTime(x.occurrence.tripStopId, 'MON').value)).toEqual([...values, null]);
      expect(stops.slice(0, -1).every(x => x.timeRule?.timeKind === 'boardingAtStop')).toBe(true);
    }
  });
  it('keeps same-name map points distinct when their actual observed coordinates differ', () => {
    const names = dataset.stops.filter(x => x.direction === 'toCampus' && x.officialName.value === '송정역시외버스승강장');
    const points = names.map(x => dataset.locations.find(l => l.stopId === x.stopId)!);
    expect(points.length).toBeGreaterThan(1);
    expect(new Set(points.map(x => x.locationId)).size).toBe(points.length);
    expect(new Set(points.map(x => JSON.stringify(x.coordinates.value))).size).toBe(points.length);
  });
  it('groups the identical PDF homeward sequence while retaining both trip times and the reuse caveat', () => {
    const result = evaluateRecommendations(dataset, from);
    const groups = groupRecommendationCandidates([...result.candidates, ...result.references]);
    const same = groups.find(g => g.relations.some(x => x.tripId === early) && g.relations.some(x => x.tripId === homeward));
    expect(same).toBeDefined();
    expect(same!.relations.map(x => x.time).sort()).toEqual(['15:30', '17:30']);
    expect(result.references.find(x => x.tripId === early)?.reasons).toContain('SHARED_SEQUENCE_LOCATION');
    expect(result.references.find(x => x.tripId === early)?.reasons).not.toContain('WEEKDAY_UNVERIFIED');
    expect(result.references.find(x => x.tripId === homeward)?.reasons).toContain('WEEKDAY_UNVERIFIED');
    expect(result.candidates).toHaveLength(0);
  });
  it('excludes explicitly Monday–Thursday trips on Friday without claiming unknown weekdays do not operate', () => {
    const result = evaluateRecommendations(dataset, { ...from, weekday: 'FRI' });
    expect(result.references.some(x => x.tripId === early)).toBe(false);
    expect(result.excluded.filter(x => x.tripId === early).every(x => x.reasons.includes('NO_TRIP_FOR_CONDITION'))).toBe(true);
    expect(result.references.some(x => x.tripId === homeward && x.time === '15:30')).toBe(true);
  });
  it('filters homeward candidates by official school departure and applies Friday replacement first', () => {
    const result = evaluateRecommendations(dataset, { ...from, timeCondition: { kind: 'campusReadyAfter', minutes: 16 * 60 } });
    expect(result.references.some(x => x.tripId === early)).toBe(false);
    expect(result.references.some(x => x.tripId === homeward && x.time === '17:30')).toBe(true);
    expect(result.excluded.some(x => x.tripId === early && x.reasons.includes('TIME_NOT_MATCHING'))).toBe(true);
    const friday = evaluateRecommendations(dataset, { ...from, weekday: 'FRI', timeCondition: { kind: 'campusReadyAfter', minutes: 16 * 60 } });
    expect(friday.references).toHaveLength(0);
  });
  it('filters morning times by boarding time only, never implying a school arrival guarantee', () => {
    const result = evaluateRecommendations(dataset, { direction: 'toCampus', weekday: 'MON', place: placeAt(getTripStops(late)[2].location!.locationId), radiusMeters: 5000, maxResults: 20, timeCondition: { kind: 'boardingAfter', minutes: 9 * 60 } });
    expect(result.references.length).toBeGreaterThan(0);
    expect(result.references.some(x => x.tripId === late)).toBe(true);
    expect(result.references.every(x => minutesOf(x.time!) >= 9 * 60)).toBe(true);
    const before = evaluateRecommendations(dataset, { direction: 'toCampus', weekday: 'MON', place: placeAt(getTripStops(late)[2].location!.locationId), radiusMeters: 5000, timeCondition: { kind: 'boardingBefore', minutes: 8 * 60 } });
    expect(before.references.every(x => minutesOf(x.time!) <= 8 * 60)).toBe(true);
    expect(before.excluded.some(x => x.tripId === late && x.reasons.includes('TIME_NOT_MATCHING'))).toBe(true);
  });
  it('does not exclude unverified departure times as a known time mismatch', () => {
    const copy = scope(dataset, [homeward]);
    const rule = copy.timeRules.find(x => x.timeKind === 'departureFromCampus')!;
    rule.baseTime.value = null; rule.baseTime.verificationStatus = 'UNVERIFIED';
    const result = evaluateRecommendations(copy, { ...from, timeCondition: { kind: 'campusReadyAfter', minutes: 16 * 60 } });
    expect(result.references.length).toBeGreaterThan(0);
    expect(result.references.every(x => x.time === null && x.reasons.includes('REQUIRED_TIME_UNVERIFIED'))).toBe(true);
    expect(result.references.every(x => !x.explanation.includes('입력한 시간 조건 비교'))).toBe(true);
    expect(result.excluded.some(x => x.reasons.includes('TIME_NOT_MATCHING'))).toBe(false);
  });
  it('does not apply a guessed base departure when the replacement weekday is unselected', () => {
    const rule = dataset.timeRules.find(x => x.targetTripStopId === getTripStops(homeward)[0].occurrence.tripStopId)!;
    expect(resolveTime(dataset, rule, null)).toMatchObject({ value: '17:30', conditionConfirmed: false });
    const result = evaluateRecommendations(scope(dataset, [homeward]), { ...from, weekday: null, timeCondition: { kind: 'campusReadyAfter', minutes: 18 * 60 } });
    expect(result.references.length).toBeGreaterThan(0);
    expect(result.references.every(x => !x.explanation.includes('입력한 시간 조건 비교'))).toBe(true);
    expect(result.excluded.some(x => x.reasons.includes('TIME_NOT_MATCHING'))).toBe(false);
  });
  it('uses a configurable total group limit without dropping the second trip of a shared stop', () => {
    const result = evaluateRecommendations(dataset, { ...from, maxResults: 5 });
    const groups = groupRecommendationCandidates([...result.candidates, ...result.references]);
    expect(groups).toHaveLength(5);
    expect(groups.filter(x => x.relations.some(r => r.tripId === early)).every(x => x.relations.some(r => r.tripId === homeward))).toBe(true);
    expect(result.references.length).toBeGreaterThan(groups.length);
    expect(result.excluded.some(x => x.reasons.includes('RESULT_LIMIT'))).toBe(true);
  });
  it('sorts known official times first when requested and keeps the default distance order', () => {
    const distance = evaluateRecommendations(dataset, from).references;
    expect(distance.map(x => x.distanceMeters)).toEqual(distance.map(x => x.distanceMeters).sort((a,b) => a-b));
    const times = evaluateRecommendations(dataset, { ...from, sortBy: 'time' }).references.map(x => minutesOf(x.time!));
    expect(times).toEqual([...times].sort((a,b) => a-b));
    expect(getTripTime('tp-s25-from-jinwol-04', 'FRI').value).toBe('15:30');
  });
  it('separates a known opposite boarding permission from an unknown permission', () => {
    const copy = scope(dataset, [homeward]);
    const occurrence = copy.occurrences.find(x => x.tripId === homeward && x.sequence.value === 8)!;
    occurrence.callPermission = { ...occurrence.sequence, value: 'boarding', alternatives: [] };
    const result = evaluateRecommendations(copy, from);
    expect(result.excluded.find(x => x.occurrenceId === occurrence.tripStopId)?.reasons).toContain('CALL_PERMISSION_NOT_MATCHING');
    expect(result.references.some(x => x.occurrenceId === occurrence.tripStopId)).toBe(false);
    expect(result.references.some(x => x.reasons.includes('CALL_PERMISSION_UNVERIFIED'))).toBe(true);
  });
  it('rejects a shared-location mapping to the opposite-direction trip', () => {
    const copy = structuredClone(dataset);
    copy.occurrences.find(x => x.locationMapping)!.locationMapping!.sourceTripId = late;
    expect(validateDataset(copy).some(x => x.includes('공유 위치 매핑'))).toBe(true);
  });
});
