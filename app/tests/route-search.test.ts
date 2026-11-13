import { describe, expect, it } from 'vitest';
import { dataset, getStopTime } from '../src/data';
import { searchRoutes } from '../src/domain/routeSearch';

describe('route-list search', () => {
  it('keeps the original direction, order and first-stop summary for lists and route names', () => {
    const all = searchRoutes('toCampus', ' \t');
    expect(all.map(result => result.trip)).toEqual(dataset.trips.filter(trip => trip.direction === 'toCampus'));
    expect(all.every(result => !result.matchedStops.length)).toBe(true);
    const family = searchRoutes('toCampus', '송정');
    expect(family).toHaveLength(11);
    expect(family.every(result => result.trip.displayName.startsWith('송정') && !result.matchedStops.length)).toBe(true);
  });

  it('matches complete route numbers without confusing one- and two-digit trips', () => {
    for (const [query, expected] of [
      ['진월③', '진월③'], ['진월3', '진월③'], ['진월 3', '진월③'],
      ['송정1', '송정①'], ['송정 10', '송정⑩'], ['송정⑪', '송정⑪'],
    ]) {
      const result = searchRoutes('toCampus', query);
      expect(result.map(item => item.trip.displayName)).toEqual([expected]);
      expect(result[0].matchedStops).toEqual([]);
    }
  });

  it('matches spacing variants across homebound trips while preserving separately sourced stops', () => {
    for (const query of ['문흥동 샛터코아', '문흥동샛터코아', '샛터코아']) {
      const results = searchRoutes('fromCampus', query);
      expect(results.map(({ trip }) => trip.displayName)).toEqual(['진월③', '진월①', '진월⑤']);
      expect(results.map(({ matchedStops }) => matchedStops.map(({ stop }) => stop.displayName)))
        .toEqual([['문흥동 샛터코아'], ['문흥동 샛터코아'], ['문흥동샛터코아']]);
      expect(new Set(results.map(({ matchedStops }) => matchedStops[0].occurrence.tripStopId)).size).toBe(3);
    }
  });

  it('returns the matching boarding occurrences with their own times and preserves multiple matches', () => {
    const result = searchRoutes('toCampus', '추선회관');
    expect(result.map(({ trip, matchedStops }) => [
      trip.displayName, ...matchedStops.map(({ occurrence }) => getStopTime(occurrence.tripStopId, 'MON').value),
    ])).toEqual([['송정④', '07:15'], ['송정③', '07:10']]);
    const partial = searchRoutes('toCampus', '운남주공').find(({ trip }) => trip.displayName === '송정⑪');
    expect(partial?.matchedStops.map(({ stop }) => stop.displayName)).toEqual([
      '운남주공1단지육교_KCC페인트', '운남주공5단지육교_목련마을승강장',
    ]);
    const energy = searchRoutes('toCampus', '에너지밸리').find(({ trip }) => trip.displayName === '송정⑪');
    expect(energy?.matchedStops.map(({ stop }) => stop.role)).toEqual(['via']);
  });

  it('keeps genuine zero results and does not create matches across adjacent fields', () => {
    expect(searchRoutes('fromCampus', '지원2동주민센터')).toEqual([]);
    expect(searchRoutes('toCampus', '지원2동주민센터').map(({ trip }) => trip.displayName)).toEqual(['진월③']);
    expect(searchRoutes('toCampus', '도림캠퍼스시립장애인복지관육교')).toEqual([]);
    expect(searchRoutes('fromCampus', '서울역')).toEqual([]);
  });
});
