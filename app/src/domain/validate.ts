import type { Coordinates, Dataset } from './types';
import { minutesOf } from './time';

export function validCoordinates(value: unknown): value is Coordinates {
  if (!value || typeof value !== 'object') return false;
  const c = value as Coordinates;
  return c.crs === 'WGS84' && Number.isFinite(c.latitude) && Number.isFinite(c.longitude) &&
    Math.abs(c.latitude) <= 90 && Math.abs(c.longitude) <= 180;
}
export function validateDataset(input: unknown): string[] {
  const errors: string[] = [];
  const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
  if (!record(input) || !record(input.metadata)) return ['데이터 종류/메타데이터가 올바르지 않습니다.'];
  const data = input as unknown as Dataset;
  if (!data || !data.metadata || !['officialSnapshot', 'syntheticDemo'].includes(data.metadata.dataKind)) return ['데이터 종류/메타데이터가 올바르지 않습니다.'];
  const tables = [data.routes, data.trips, data.stops, data.locations, data.occurrences, data.serviceRules, data.timeRules, data.sources, data.conflicts];
  if (tables.some(table => !Array.isArray(table) || table.some(item => !record(item))) || !record(data.coverage)) return ['필수 데이터 배열/레코드 또는 Coverage가 없습니다.'];
  const arrayProperties: [unknown[], string[]][] = [
    [data.trips, ['serviceRuleIds', 'variantIds']], [data.stops, ['aliasIds']],
    [data.occurrences, ['timeRuleIds', 'callRuleIds']], [data.serviceRules, ['targetIds']],
    [data.routes, ['sourceIds']], [data.conflicts, ['fieldPaths','sourceClaims','withheldTargetIds','resolutionEvidence']],
  ];
  for (const [table, keys] of arrayProperties) for (const item of table) for (const key of keys) {
    if (!Array.isArray((item as Record<string, unknown>)[key])) errors.push(`배열 필드 ${key} 누락/오류`);
  }
  for (const key of ['supportedTripIds','supportedStopIds','supportedTripStopIds','serviceAreaIds','adjacentStopAllowlist'] as const) {
    if (!Array.isArray(data.coverage[key]) || data.coverage[key].some(value => typeof value !== 'string')) errors.push(`Coverage.${key} 배열 오류`);
  }
  if (data.timeRules.some(rule => !Array.isArray(rule.overrides) || rule.overrides.some(value => !record(value)))) errors.push('TimeOverride 배열/레코드 오류');
  if (errors.length) return errors;
  const ids = new Set<string>();
  const idKeys = ['routeId', 'tripId', 'stopId', 'locationId', 'tripStopId', 'ruleId', 'timeRuleId', 'sourceId', 'conflictId'];
  tables.forEach((table, index) => table.forEach(item => {
    const id = (item as unknown as Record<string, unknown>)[idKeys[index]];
    if (typeof id !== 'string' || !id || ids.has(id)) errors.push(`비어 있거나 중복된 ID: ${String(id)}`);
    if (typeof id === 'string') ids.add(id);
  }));
  const sourceIds = new Set(data.sources.map(source => source.sourceId));
  function walk(value: unknown, path: string): void {
    if (!value || typeof value !== 'object') return;
    const obj = value as Record<string, unknown>;
    if ('verificationStatus' in obj) {
      for (const key of ['value','verificationStatus','informationState','originKind','evidence','documentCheck','locationCheck','conditionCheck','currentness','alternatives','reviewedBy','reviewedAt','missingReason']) {
        if (!(key in obj)) errors.push(`${path}: Fact.${key} 누락`);
      }
      if (!['VERIFIED','CONFLICTED','UNVERIFIED','ESTIMATED','MOCK'].includes(String(obj.verificationStatus))) errors.push(`${path}: 검증 상태 오류`);
      const enums: Record<string, string[]> = {
        informationState: ['officialConfirmed','userConfirmed','calculated','unverified','conflict'],
        originKind: ['officialDocument','officialNotice','officialUi','authorReport','researchInterpretation','designHypothesis','apiResult','calculation','syntheticFixture'],
        documentCheck: ['checked','notReviewed','notProvided','notApplicable'],
        locationCheck: ['actualStopVerified','officialMarkerObserved','userConfirmedText','facilityIdentifiedOnly','notReviewed','notProvided','notApplicable'],
        conditionCheck: ['checked','unknown','conflict','notApplicable'], currentness: ['noticeChecked','unknown','superseded','notApplicable'],
      };
      Object.entries(enums).forEach(([key, allowed]) => { if (!allowed.includes(String(obj[key]))) errors.push(`${path}: ${key} 상태 오류`); });
      if (!Array.isArray(obj.alternatives) || !Array.isArray(obj.evidence) || obj.value === undefined) errors.push(`${path}: Fact 값/배열 오류`);
      if (obj.verificationStatus === 'MOCK' && (data.metadata.dataKind !== 'syntheticDemo' || obj.originKind !== 'syntheticFixture')) errors.push(`${path}: 실제 자료에 MOCK 혼합 금지`);
      if (obj.originKind === 'syntheticFixture' && data.metadata.dataKind !== 'syntheticDemo') errors.push(`${path}: 실제 자료에 가상 출처 혼합 금지`);
      if (obj.verificationStatus === 'CONFLICTED' && (obj.value !== null || !Array.isArray(obj.alternatives) || obj.alternatives.length < 2)) errors.push(`${path}: 충돌값/대안 오류`);
      if (obj.verificationStatus === 'UNVERIFIED' && obj.value !== null) errors.push(`${path}: 미검증 채택값은 null이어야 합니다.`);
      if (obj.verificationStatus === 'VERIFIED' && (obj.value === null || !Array.isArray(obj.evidence) || obj.evidence.length === 0)) errors.push(`${path}: 검증값/근거 누락`);
      if (obj.informationState === 'userConfirmed' && obj.originKind !== 'authorReport') errors.push(`${path}: 사용자 확인을 공식 출처로 기록할 수 없습니다.`);
      if (Array.isArray(obj.evidence)) obj.evidence.forEach(ref => {
        if (!record(ref) || typeof ref.sourceId !== 'string' || typeof ref.locator !== 'string' || typeof ref.claimId !== 'string' || !sourceIds.has(ref.sourceId)) errors.push(`${path}: 근거 필드/출처 오류`);
      });
    }
    Object.entries(obj).forEach(([key, child]) => walk(child, `${path}.${key}`));
  }
  walk(data, 'dataset');
  // Schema errors must not fall through to semantic reads of malformed Fact objects.
  for (const [table, keys] of [[data.locations, ['coordinates','roadsideDescription']], [data.stops, ['officialName','locationDescription','administrativeArea']], [data.occurrences, ['sequence','callPermission']], [data.serviceRules, ['weekdays','holidayOperation','specialDatePolicy']], [data.timeRules, ['baseTime']]] as [unknown[], string[]][]) {
    for (const item of table) for (const key of keys) if (!record((item as Record<string, unknown>)[key]) || !('verificationStatus' in ((item as Record<string, unknown>)[key] as object))) errors.push(`필수 Fact ${key} 누락/오류`);
  }
  if (errors.length) return errors;
  const has = (table: { [key: string]: unknown }[], key: string, value: string) => table.some(item => item[key] === value);
  for (const trip of data.trips) {
    if (!['toCampus','fromCampus'].includes(trip.direction)) errors.push(`${trip.tripId}: 방향 오류`);
    if (trip.datasetId !== data.metadata.datasetId || (trip.routeId !== null && !data.routes.some(route => route.routeId === trip.routeId))) errors.push(`${trip.tripId}: 데이터셋/노선 참조 오류`);
    for (const id of trip.serviceRuleIds) if (!data.serviceRules.some(rule => rule.ruleId === id)) errors.push(`${trip.tripId}: 운행규칙 참조 오류`);
    if (trip.direction === 'fromCampus' && !data.occurrences.some(occ => occ.tripId === trip.tripId && data.stops.some(stop => stop.stopId === occ.stopId && stop.campusId === trip.campusId && stop.role === 'boarding'))) errors.push(`${trip.tripId}: 학교 승차 노드 누락`);
  }
  for (const stop of data.stops) if (!['toCampus','fromCampus'].includes(stop.direction) || !['boarding','alighting','via','campusArrival'].includes(stop.role)) errors.push(`${stop.stopId}: 방향/역할 오류`);
  for (const rule of data.serviceRules) {
    if (!['trip','stop','segment','campusVia'].includes(rule.scope)) errors.push(`${rule.ruleId}: 규칙 범위 오류`);
    if (rule.weekdays.value !== null && (!Array.isArray(rule.weekdays.value) || rule.weekdays.value.some(day => !['MON','TUE','WED','THU','FRI','SAT','SUN'].includes(day)))) errors.push(`${rule.ruleId}: 요일 형식 오류`);
  }
  for (const occurrence of data.occurrences) {
    const trip = data.trips.find(item => item.tripId === occurrence.tripId);
    const stop = data.stops.find(item => item.stopId === occurrence.stopId);
    if (!trip || !stop || trip.direction !== stop.direction) errors.push(`${occurrence.tripStopId}: 편/지점/방향 참조 오류`);
    if (occurrence.locationId && !data.locations.some(location => location.locationId === occurrence.locationId && location.stopId === occurrence.stopId)) errors.push(`${occurrence.tripStopId}: 위치 참조 오류`);
    if (occurrence.locationMapping) {
      const mapping = occurrence.locationMapping;
      const sourceTrip = data.trips.find(item => item.tripId === mapping.sourceTripId);
      if (mapping.kind !== 'sameDirectionalSequence' || !sourceTrip || sourceTrip.direction !== trip?.direction || !Array.isArray(mapping.evidence) || !mapping.evidence.length || !data.occurrences.some(item => item.tripId === mapping.sourceTripId && item.stopId === occurrence.stopId && item.locationId === occurrence.locationId)) errors.push(`${occurrence.tripStopId}: 공유 위치 매핑 근거/방향/출처 편 참조 오류`);
    }
    if (!Number.isInteger(occurrence.sequence.value) || (occurrence.sequence.value ?? -1) < 0) errors.push(`${occurrence.tripStopId}: 순서 오류`);
    for (const id of occurrence.timeRuleIds) if (!data.timeRules.some(rule => rule.timeRuleId === id && rule.targetTripStopId === occurrence.tripStopId)) errors.push(`${occurrence.tripStopId}: 시각 참조 오류`);
  }
  for (const location of data.locations) if (!data.stops.some(stop => stop.stopId === location.stopId) || (location.coordinates.value !== null && !validCoordinates(location.coordinates.value))) errors.push(`${location.locationId}: 지점/좌표 오류`);
  for (const rule of data.timeRules) {
    if (rule.applicabilityRuleId && !data.serviceRules.some(item => item.ruleId === rule.applicabilityRuleId && item.targetIds.includes(rule.targetTripStopId) && ['stop','campusVia'].includes(item.scope))) errors.push(`${rule.timeRuleId}: 경유 시각 적용 조건 참조 오류`);
    if (!['boardingAtStop','departureFromCampus','officialArrivalAtStop','officialIntermediateTime'].includes(rule.timeKind)) errors.push(`${rule.timeRuleId}: 시각 종류 오류`);
    const occurrence = data.occurrences.find(item => item.tripStopId === rule.targetTripStopId);
    const stop = data.stops.find(item => item.stopId === occurrence?.stopId);
    if (!occurrence) errors.push(`${rule.timeRuleId}: 대상 관계 누락`);
    if (rule.baseTime.value !== null && !Number.isFinite(minutesOf(rule.baseTime.value))) errors.push(`${rule.timeRuleId}: 시각 형식 오류`);
    if (rule.timeKind === 'departureFromCampus' && !(stop?.campusId && stop.role === 'boarding' && stop.direction === 'fromCampus')) errors.push(`${rule.timeRuleId}: 학교 출발 시각 의미 오류`);
    if (rule.timeKind === 'boardingAtStop' && !(stop?.role === 'boarding' && stop.direction === 'toCampus')) errors.push(`${rule.timeRuleId}: 정류장 승차 시각 의미 오류`);
    for (const override of rule.overrides) if (override.effect !== 'replace' || !data.serviceRules.some(item => item.ruleId === override.conditionRuleId) || !override.time || override.time.value === null || !Number.isFinite(minutesOf(override.time.value))) errors.push(`${rule.timeRuleId}: 대체 시각 오류`);
  }
  for (const id of data.coverage.supportedTripStopIds) if (!has(data.occurrences as unknown as { [key: string]: unknown }[], 'tripStopId', id)) errors.push(`Coverage: 없는 관계 ${id}`);
  return errors;
}
