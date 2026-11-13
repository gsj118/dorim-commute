import { describe, expect, it } from 'vitest';
import { dataset, getTripStops } from '../src/data';
import { getRouteStopContext } from '../src/domain/routeStopContext';

function stopOn(tripId: string, stopName: string) {
  const row = getTripStops(tripId).find(item => item.stop.displayName === stopName);
  if (!row) throw new Error(`수록 지점 누락: ${tripId} ${stopName}`);
  return row;
}

describe('검색한 방향·편·지점의 정보', () => {
  it('shows each intermediate boarding time and never supplies an arrival time for the drop-off', () => {
    const third = stopOn('tp-s25-to-songjeong-03', '추선회관');
    const fourth = stopOn('tp-s25-to-songjeong-04', '추선회관');
    expect(getRouteStopContext(dataset, third, 'MON')).toMatchObject({
      roleLabel: '승차', time: { value: '07:10', kind: 'boardingAtStop' }, conflictNote: null,
    });
    expect(getRouteStopContext(dataset, fourth, 'MON').time.value).toBe('07:15');
    const homeward = stopOn('tp-s25-from-jinwol-05', '문흥동샛터코아');
    expect(getRouteStopContext(dataset, homeward, 'FRI')).toMatchObject({ roleLabel: '하차', time: { value: null } });
  });

  it('applies the CF13 warning only to its two stops and withholds the disputed time', () => {
    const rows = getTripStops('tp-s25-to-jinwol-08');
    const held = rows.filter(row => getRouteStopContext(dataset, row, 'MON').conflictNote);
    expect(held.map(row => row.stop.displayName)).toEqual(['효천역승강장', '무안우체국']);
    expect(getRouteStopContext(dataset, held[0], 'MON')).toMatchObject({
      time: { value: null }, conflictNote: '학교 확인 필요',
    });
    expect(getRouteStopContext(dataset, held[1], 'MON').time.value).toBeNull();
    const resolved = {
      ...dataset,
      conflicts: dataset.conflicts.map(conflict => conflict.conflictId === 'CF13' ? { ...conflict, state: 'resolved' as const } : conflict),
    };
    expect(getRouteStopContext(resolved, held[0], 'MON').conflictNote).toBeNull();
  });

  it('distinguishes a conflicting via rule from a known weekday mismatch', () => {
    const ordinary = stopOn('tp-s25-to-songjeong-11', '에너지밸리캠퍼스');
    expect(getRouteStopContext(dataset, ordinary, 'MON')).toMatchObject({
      roleLabel: '경유', time: { value: null }, viaCondition: '문서상 화·수 경유 · 월요일은 경유 대상에서 제외',
    });
    expect(getRouteStopContext(dataset, ordinary, 'TUE')).toMatchObject({
      time: { value: '10:15', kind: 'officialIntermediateTime' }, viaCondition: '문서상 화·수 경유',
    });
    const conflicting = stopOn('tp-s25-to-songjeong-09', '에너지밸리캠퍼스');
    expect(getRouteStopContext(dataset, conflicting, 'WED')).toMatchObject({time: {value:'08:00'}, viaCondition:'수요일 경유'});
    expect(getRouteStopContext(dataset, conflicting, 'THU')).toMatchObject({time: {value:null}, viaCondition:'목요일 경유하지 않음'});
    expect(getRouteStopContext(dataset, conflicting, 'TUE').time.value).toBeNull();
    expect(getRouteStopContext(dataset, conflicting, 'MON')).toMatchObject({
      time: { value: null }, viaCondition: '경유 요일 확인 필요', conflictNote: null,
    });
  });
});
