import { describe, expect, it } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { dataset, getTripStops, getStopTime, getTripTime } from '../src/data';
import { evaluateRecommendations, reasonLabels, usableLocation } from '../src/domain/recommend';
import type { PlaceSelection } from '../src/domain/types';
import { TripConditions } from '../src/components/TripConditions';
import source from '../../docs/evidence/mvp6-20261110/source-audit.json';
import mapping from '../../docs/evidence/mvp6-20261110/marker-mapping-audit.json';
import observations from '../../docs/evidence/mvp6-20261110/official-markers.json';

const origin: PlaceSelection = {provider:'verifiedLocal',providerPlaceId:null,selectionId:'synthetic-test-only',kind:'manualPoint',name:'합성 선택 fixture',roadAddress:null,lotAddress:'광주광역시 시험용',regionLabel:null,detailUrl:null,coordinates:{crs:'WGS84',latitude:35.15,longitude:126.9},coordinateSource:'synthetic test only',selectedAt:'2026-11-10',selectionState:'explicitlySelected',validationState:'checked'};
describe('MVP6 full PDF coverage and field-level holds', () => {
  it('matches every independently transcribed row, ordered name and raw time without extra trips', () => {
    expect(dataset.trips.map(t => t.tripId).sort()).toEqual(source.rows.map(r => r.tripId).sort());
    for (const row of source.rows) {
      const items = getTripStops(row.tripId).filter(item => item.stop.stopId !== 'st-dorim-from-boarding-common');
      expect(items.map(item => item.stop.officialName.value)).toEqual(row.stops.map(stop => stop.name));
      expect(items.map(item => item.timeRule?.baseTime.value || null)).toEqual(row.stops.map(stop => stop.documentTime));
    }
    expect(dataset.trips.filter(t => t.direction === 'toCampus')).toHaveLength(19);
    expect(dataset.trips.filter(t => t.direction === 'fromCampus')).toHaveLength(19);
  });
  it('crosschecks the 112 explicit mappings and keeps unmatched Mu-an null without shifting the campus marker', () => {
    let matched = 0;
    for (const trip of mapping.trips) for (const pair of trip.mappings) {
      const item = getTripStops(trip.tripId)[pair.pdfIndex];
      if (pair.webIndex === null) { expect(item.location?.coordinates.value).toBeNull(); continue; }
      const marker = observations.trips.find(t => t.localTripId === trip.tripId)!.stops[pair.webIndex];
      expect(item.location?.coordinates.value).toEqual(marker.coordinates);
      expect(item.location?.coordinates.evidence[0].claimId).toBe(`unibus-marker-${trip.lineId}-${pair.webStopId}`);
      matched++;
    }
    expect(matched).toBe(112);
    expect(getTripStops('tp-s25-to-jinwol-06').some(item => item.stop.displayName.includes('빛가람'))).toBe(false);
    expect(getTripStops('tp-s25-to-jinwol-08').at(-1)?.stop.role).toBe('campusArrival');
  });
  it('keeps unlocated new homeward routes fully readable and never substitutes morning coordinates', () => {
    const items = getTripStops('tp-s25-from-songjeong-07');
    expect(items).toHaveLength(5);
    expect(items.every(item => item.location?.coordinates.value === null)).toBe(true);
    expect(getTripTime('tp-s25-from-songjeong-07', 'FRI').value).toBe('18:20');
    expect(getTripStops('tp-s25-from-jinwol-05').some(item => item.stop.officialName.value === '동신고')).toBe(true);
    expect(items[0].stop.locationDescription.value).toBe('MNU 스퀘어 앞');
  });
  it('separates listed trips and direction-specific distance coverage from date, time, radius and display filters', () => {
    const direction = 'fromCampus';
    const expected = { listedTrips: 19, listedOccurrences: 175, comparableTrips: 3, comparableOccurrences: 34, sharedMarkerTrips: 1 };
    const unfiltered = evaluateRecommendations(dataset, { direction, weekday: null, place: null });
    const filtered = evaluateRecommendations(dataset, {
      direction, weekday: 'FRI', holiday: 'yes', specialDate: 'yes', place: origin,
      radiusMeters: 1000, maxResults: 5, timeCondition: { kind: 'campusReadyAfter', minutes: 23 * 60 },
    });
    expect(unfiltered.coverage).toEqual(expected);
    expect(filtered.coverage).toEqual(expected);
    expect(filtered.candidates.length + filtered.references.length).toBe(0);
    expect(evaluateRecommendations(dataset, { direction: 'toCampus', weekday: null, place: null }).coverage)
      .toEqual({ listedTrips: 19, listedOccurrences: 136, comparableTrips: 19, comparableOccurrences: 128, sharedMarkerTrips: 0 });
    const limited = { ...dataset, coverage: { ...dataset.coverage, supportedTripIds: ['tp-s25-from-jinwol-03'] } };
    expect(evaluateRecommendations(limited, { direction, weekday: null, place: null }).coverage)
      .toEqual({ ...expected, comparableTrips: 1, comparableOccurrences: 10, sharedMarkerTrips: 0 });
  });
  it('preserves conditional intermediate time separately from school departure and never infers Monday via service', () => {
    const item = getTripStops('tp-s25-to-songjeong-11').find(item => item.stop.role === 'via')!;
    expect(item.timeRule?.baseTime.value).toBe('10:15');
    expect(getStopTime(item.occurrence.tripStopId, 'TUE')).toMatchObject({value:'10:15',kind:'officialIntermediateTime'});
    expect(getStopTime(item.occurrence.tripStopId, 'MON').value).toBeNull();
    expect(getStopTime(item.occurrence.tripStopId, null).conditionConfirmed).toBe(false);
    expect(getTripTime('tp-s25-from-songjeong-02', 'TUE').value).toBe('16:30');
    expect(getTripStops('tp-s25-from-songjeong-02').find(item => item.stop.role === 'via')?.timeRule?.baseTime.value).toBe('17:05');
  });
  it('withholds only relevant conflicts and never classifies unresolved times as a known mismatch', () => {
    const result = evaluateRecommendations(dataset,{direction:'toCampus',weekday:'FRI',place:origin,radiusMeters:5000,maxResults:20,timeCondition:{kind:'boardingAfter',minutes:23*60}});
    for (const trip of ['tp-s25-to-songjeong-09','tp-s25-to-jinwol-06']) {
      const held = result.pending.filter(item => item.tripId === trip);
      expect(held.length).toBeGreaterThan(0);
      expect(held.every(item => item.reasons.includes('CONFLICTING_SOURCE'))).toBe(true);
      const first = getTripStops(trip)[0].occurrence.tripStopId;
      expect(result.excluded.find(item => item.occurrenceId === first)?.reasons).toContain('TIME_NOT_MATCHING');
      const near = evaluateRecommendations(dataset, { direction:'toCampus', weekday:'MON', place:{...origin,coordinates:getTripStops(trip)[0].location!.coordinates.value} });
      expect(near.references.find(item => item.occurrenceId === first)?.time).toBe('07:30');
      expect(near.references.filter(item => item.tripId === trip)).toHaveLength(1);
    }
    const cf13 = dataset.conflicts.find(c => c.conflictId === 'CF13')!;
    expect(cf13.withheldTargetIds).toHaveLength(2);
    expect(result.pending.some(item => item.occurrenceId === cf13.withheldTargetIds[0])).toBe(true);
    expect(dataset.locations.filter(l => usableLocation(l))).toHaveLength(182);
  });
  it('exposes explicit weekdays, both conflict sources, and zero-result recovery wording', () => {
    render(<TripConditions trip={dataset.trips.find(t => t.tripId === 'tp-s25-to-songjeong-10')!} weekday="FRI"/>);
    expect(screen.getByText('선택 요일 운행 안 함 · 문서 기준')).toBeTruthy();
    expect(screen.getByText(/선택한 금요일은/)).toBeTruthy(); cleanup();
    render(<TripConditions trip={dataset.trips.find(t => t.tripId === 'tp-s25-to-songjeong-09')!} weekday="MON"/>);
    expect(screen.queryByText(/기본 운행요일 미확인/)).toBeNull();
    expect(screen.getByText('에너지밸리')).toBeTruthy();
    expect(screen.queryByText(/CF01|이용 판단 보류/)).toBeNull(); cleanup();
    const regular = dataset.trips.find(t => t.tripId === 'tp-s25-from-songjeong-07')!;
    const view = render(<TripConditions trip={regular} weekday="MON"/>);
    expect(screen.queryByRole('region', { name: '운행 조건' })).toBeNull();
    view.rerender(<TripConditions trip={regular} weekday="SAT"/>);
    expect(screen.getByText(/선택한 토요일은 평일 운행 대상/)).toBeTruthy();
    expect(screen.queryByText(/문서 기준/)).toBeNull();
    expect(reasonLabels.NO_NEARBY_STOPS).toContain('요일·시간·반경');
  });
});
