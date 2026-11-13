import { describe, expect, it } from 'vitest';
import { dataset, getStopTime, getTripStops } from '../src/data';
import { resolveDiscoveryAnchors, type DiscoveryAnchor } from '../src/data/discoveryAnchors';
import { candidateGroupKey, evaluateRecommendations, groupRecommendationCandidates } from '../src/domain/recommend';
import type { PlaceSelection } from '../src/domain/types';

const outbound = (number: string) => `tp-s25-from-songjeong-${number}`;
const inbound = 'tp-s25-to-songjeong-01';
const source = getTripStops(inbound).find(row => row.stop.displayName.includes('서광주우체국'))!;
const anchor: DiscoveryAnchor = {
  kind: 'timetableMarker', sourceLabel: '송정① 공식 Unibus 표시점', sourceUrl: 'https://mokpo.unibus.kr/#!/line',
  sourceOccurrenceId: source.occurrence.tripStopId, locationId: source.location!.locationId,
  label: source.stop.displayName, direction: 'toCampus', tripName: '송정①',
  rationale: 'S25 송정①의 서광주우체국 건너편 CU편의점과 송정③·⑦의 우체국 표기 대조',
  coordinates: source.location!.coordinates.value!,
};
const syntheticOrigin: PlaceSelection = {
  provider: 'manualMap', providerPlaceId: null, selectionId: 'test-only', kind: 'manualPoint', name: '기준점과 같은 좌표의 시험 입력',
  lotAddress: '광주 서구', regionLabel: null, roadAddress: null, detailUrl: null, coordinates: anchor.coordinates,
  coordinateSource: 'unit fixture at source marker', selectedAt: '', selectionState: 'explicitlySelected', validationState: 'checked',
};
const request = { direction: 'fromCampus' as const, weekday: 'FRI' as const, place: syntheticOrigin, radiusMeters: 1000 };
const early = getTripStops(outbound('03')).find(row => row.stop.displayName === '서광주우체국')!;
const late = getTripStops(outbound('07')).find(row => row.stop.displayName === '서광주우체국')!;
const anchors = new Map([early, late].map(row => [row.occurrence.tripStopId, anchor]));

describe('directional location and landmark discovery', () => {
  it('finds both 16:30 homeward trips while applying Tuesday/Wednesday only to the intermediate campus', () => {
    const actualAnchors = resolveDiscoveryAnchors(dataset);
    const coverage = evaluateRecommendations(dataset, request, actualAnchors).discoveryCoverage;
    expect(coverage.discoverable).toEqual({ trips: 19, occurrences: 163 });
    for (const tripId of [outbound('02'), 'tp-s25-from-jinwol-02']) {
      const rows = getTripStops(tripId);
      const via = rows.find(row => row.stop.role === 'via')!;
      const drop = rows.find(row => row.stop.role === 'alighting' && actualAnchors.has(row.occurrence.tripStopId))!;
      const place = { ...syntheticOrigin, coordinates: actualAnchors.get(drop.occurrence.tripStopId)!.coordinates };
      for (const weekday of ['MON', 'TUE', 'WED', 'THU', 'FRI'] as const) {
        expect(getStopTime(via.occurrence.tripStopId, weekday).value).toBe(['TUE','WED'].includes(weekday) ? '17:05' : null);
        const result = evaluateRecommendations(dataset, { ...request, place, weekday }, actualAnchors);
        const match = result.references.find(item => item.occurrenceId === drop.occurrence.tripStopId);
        expect(match?.time).toBe('16:30');
        expect(match?.reasons).toContain('WEEKDAY_UNVERIFIED');
      }
    }
  });

  it('shows both confirmed timetable relations at one reference point and applies the Friday replacement before filtering', () => {
    const all = evaluateRecommendations(dataset, request, anchors);
    const referenced = all.references.filter(r => r.anchor);
    expect(referenced.map(r => [r.tripId, r.time])).toEqual([[outbound('03'), '15:30'], [outbound('07'), '18:20']]);
    expect(new Set(referenced.map(candidateGroupKey)).size).toBe(1);
    expect(groupRecommendationCandidates(referenced)[0].relations).toHaveLength(2);
    expect(referenced.every(r => r.distanceMeters === 0 && r.anchor?.locationId !== r.locationId)).toBe(true);
    expect(early.location!.coordinates.value).toBeNull();
    expect(late.location!.coordinates.value).toBeNull();

    const after = evaluateRecommendations(dataset, {
      ...request, timeCondition: { kind: 'campusReadyAfter', minutes: 16 * 60 },
    }, anchors);
    const remaining = after.references.filter(r => r.anchor);
    expect(remaining.map(r => r.tripId)).toEqual([outbound('07')]);
    expect(remaining[0].reasons).toContain('WEEKDAY_UNVERIFIED');
    expect(remaining[0].reasons).toContain('POSITION_UNVERIFIED');
    expect(after.excluded.find(r => r.occurrenceId === early.occurrence.tripStopId)?.reasons).toContain('TIME_NOT_MATCHING');
    expect(after.discoveryCoverage).toEqual(all.discoveryCoverage);
    expect(all.discoveryCoverage.direct).toEqual({ trips: 2, occurrences: 24 });
    expect(all.discoveryCoverage.shared).toEqual({ trips: 1, occurrences: 10 });
    expect(all.discoveryCoverage.anchor).toEqual({ trips: 2, occurrences: 2 });
    expect(all.discoveryCoverage.discoverable).toEqual({ trips: 5, occurrences: 36 });
  });

  it('keeps the actual directional marker when both exist, and withholds conflicts even when a nearby marker is known', () => {
    const conflicts = getTripStops(outbound('02')).find(row => row.stop.role === 'alighting')!;
    const direct = getTripStops('tp-s25-from-jinwol-04').find(row => row.stop.role === 'alighting')!;
    const additional = new Map(anchors).set(direct.occurrence.tripStopId, anchor).set(conflicts.occurrence.tripStopId, anchor);
    const data = structuredClone(dataset);
    data.conflicts.find(item => item.state === 'open')!.withheldTargetIds.push(conflicts.occurrence.tripStopId);
    const result = evaluateRecommendations(data, request, additional);
    expect(result.discoveryCoverage.anchor.occurrences).toBe(2);
    expect(result.discoveryCoverage.withheld.occurrences).toBe(1);
    expect(result.pending.find(r => r.occurrenceId === conflicts.occurrence.tripStopId)?.reasons).toContain('CONFLICTING_SOURCE');
    expect(result.references.some(r => r.occurrenceId === conflicts.occurrence.tripStopId)).toBe(false);
    const atDirect = evaluateRecommendations(dataset, {
      ...request, place: { ...syntheticOrigin, coordinates: direct.location!.coordinates.value },
    }, additional);
    const matches = atDirect.references.filter(r => r.occurrenceId === direct.occurrence.tripStopId);
    expect(matches).toHaveLength(1);
    expect(matches[0].anchor).toBeUndefined();
    expect(matches[0].distanceMeters).toBe(0);
  });

  it('never suggests a distant anchor or a place outside the supported region', () => {
    const far = evaluateRecommendations(dataset, { ...request, place: { ...syntheticOrigin, coordinates: { crs: 'WGS84', latitude: 35, longitude: 127 } } }, anchors);
    expect(far.references.some(r => r.anchor)).toBe(false);
    expect(far.excluded.find(r => r.occurrenceId === late.occurrence.tripStopId)?.reasons).toContain('OUTSIDE_RADIUS');
    const outside = evaluateRecommendations(dataset, { ...request, place: { ...syntheticOrigin, lotAddress: '경기 광주시' } }, anchors);
    expect(outside.references).toHaveLength(0);
    expect(outside.globalReasons).toContain('REGION_UNSUPPORTED');
    expect(outside.discoveryCoverage).toEqual(far.discoveryCoverage);
  });

  it('counts a shared landmark once under the display limit, with closer references ahead of farther markers', () => {
    // Controlled map geometry for the limit test. Never stored in route data.
    const data = structuredClone(dataset);
    const directRows = getTripStops('tp-s25-from-jinwol-04').filter(row => row.stop.role === 'alighting').slice(0, 6);
    directRows.forEach((row, index) => {
      const location = data.locations.find(item => item.locationId === row.location!.locationId)!;
      location.coordinates.value = { ...anchor.coordinates, latitude: anchor.coordinates.latitude + (index + 1) * 0.001 };
    });
    const result = evaluateRecommendations(data, { ...request, maxResults: 5 }, anchors);
    const groups = groupRecommendationCandidates(result.references);
    expect(groups).toHaveLength(5);
    expect(groups[0].relations.map(item => item.tripId)).toEqual([outbound('03'), outbound('07')]);
    expect(result.excluded.some(item => item.reasons.includes('RESULT_LIMIT'))).toBe(true);
  });
});
