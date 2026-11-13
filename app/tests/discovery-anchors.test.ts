import { expect, it } from 'vitest';
import { dataset } from '../src/data';
import { resolveDiscoveryAnchors } from '../src/data/discoveryAnchors';
import { haversineMeters } from '../src/domain/recommend';

it('resolves documented landmarks across multiple corridors without assigning a borrowed boarding point to an alighting location', () => {
  const found = resolveDiscoveryAnchors(dataset);
  for (const [id, expected] of [
    ['from-songjeong-03-01','서광주우체국 건너편 CU편의점'],
    ['from-songjeong-10-05','추선회관'],
    ['from-songjeong-06-03','어등산약국'],
    ['from-jinwol-05-11','문흥동 샛터코아'],
  ]) {
    const occurrence = dataset.occurrences.find(row => row.tripStopId === 'occ-tp-s25-' + id)!;
    expect(found.get(occurrence.tripStopId)?.label).toBe(expected);
    expect(dataset.locations.find(row => row.locationId === occurrence.locationId)?.coordinates.value).toBeNull();
  }
  expect(found.get('occ-tp-s25-from-songjeong-05-05')).toMatchObject({
    kind:'facility', locationId:'tago-KJB898', label:'신가사거리 시내버스 정류소(ARS 5181)',
  });
  // The similarly named municipal platform carries no phase, while both S25 stops do.
  expect(found.has('occ-tp-s25-from-songjeong-05-03')).toBe(false);
  expect(found.has('occ-tp-s25-from-songjeong-05-04')).toBe(false);
});

it('only links reviewed target names on their reviewed trip and rejects a retired, conflicted or renamed source', () => {
  const data = structuredClone(dataset);
  const target = 'occ-tp-s25-from-songjeong-07-01';
  const original = resolveDiscoveryAnchors(data).get(target);
  if (original?.kind !== 'timetableMarker') throw Error('Expected the observed inbound marker');
  const location = data.locations.find(row => row.locationId === original.locationId)!;
  location.coordinates.currentness = 'superseded';
  expect(resolveDiscoveryAnchors(data).has(target)).toBe(false);
  location.coordinates.currentness = 'unknown';
  const conflict = data.conflicts.find(row => row.state === 'open')!;
  conflict.withheldTargetIds.push(original.sourceOccurrenceId);
  expect(resolveDiscoveryAnchors(data).has(target)).toBe(false);
  conflict.withheldTargetIds.pop();
  const targetStop = data.stops.find(row => row.stopId === data.occurrences.find(occ => occ.tripStopId === target)!.stopId)!;
  targetStop.displayName = '서광주우체국 다른 지점';
  expect(resolveDiscoveryAnchors(data).has(target)).toBe(false);
});

it('holds out an observed homeward marker and finds a separately documented inbound landmark for the same mall', () => {
  const data = structuredClone(dataset);
  const occurrence = data.occurrences.find(row => row.tripStopId === 'occ-tp-s25-from-jinwol-03-10')!;
  const fact = data.locations.find(location => location.locationId === occurrence.locationId)!.coordinates;
  const observed = fact.value!;
  fact.value = null;
  const anchor = resolveDiscoveryAnchors(data).get(occurrence.tripStopId);
  if (anchor?.kind !== 'timetableMarker') throw Error('Expected an independent marker as fallback');
  expect(anchor.direction).toBe('toCampus');
  expect(anchor.label).toBe('문흥동샛터코아건너편_광주은행문흥지점');
  expect(anchor.locationId).not.toBe(occurrence.locationId);
  // Difference between two observed Unibus map points, not a roadside error bound.
  expect(haversineMeters(anchor.coordinates, observed)).toBeCloseTo(36.22, 1);
});
