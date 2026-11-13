import type { Dataset, Fact, TimeDisplay, TimeKind, TimeRule, Weekday } from './types';

export const timeLabels: Record<TimeKind, string> = {
  boardingAtStop: '정류장 승차 시각', departureFromCampus: '학교 출발 시각',
  officialArrivalAtStop: '공식 도착 시각', officialIntermediateTime: '공식 중간 시각',
};
export function isConfirmed<T>(fact: Fact<T>, synthetic = false): boolean {
  return fact.value !== null && fact.evidence.length > 0 &&
    ((fact.verificationStatus === 'VERIFIED' &&
      ['officialConfirmed', 'userConfirmed'].includes(fact.informationState)) ||
      (synthetic && fact.verificationStatus === 'MOCK' && fact.originKind === 'syntheticFixture'));
}
export function minutesOf(time: string): number {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return NaN;
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
}

export function fridayDepartureNote(base: string | null, friday: TimeDisplay, weekday: Weekday | null) {
  if (!base || !friday.isOverride || !friday.value || base === friday.value) return null;
  if (!weekday) return `금요일 ${friday.value}으로 변경`;
  return weekday === 'FRI' ? `금요일 · ${base}에서 변경` : null;
}
export function resolveTime(data: Dataset, rule: TimeRule | undefined, weekday: Weekday | null): TimeDisplay {
  if (!rule) return { value: null, kind: null, label: '시각 미제공', isOverride: false, conditionConfirmed: false, reason: '연결된 시간 규칙이 없습니다.' };
  const synthetic = data.metadata.dataKind === 'syntheticDemo';
  if (rule.applicabilityRuleId) {
    const condition = data.serviceRules.find(item => item.ruleId === rule.applicabilityRuleId);
    const days = condition?.weekdays;
    const known = days && isConfirmed(days, synthetic) && days.conditionCheck === 'checked';
    const versions = days?.verificationStatus === 'CONFLICTED' ? days.alternatives : [];
    const comparable = weekday && versions.length >= 2 && versions.every(v => v.evidence.length && Array.isArray(v.value));
    const matches = comparable ? versions.map(v => v.value!.includes(weekday)) : [];
    if (!known && (!matches.length || matches.includes(true) && matches.includes(false))) return { value:null, kind:rule.timeKind, label:timeLabels[rule.timeKind], isOverride:false, conditionConfirmed:false, reason:'경유 요일 확인 필요' };
    if (weekday && (known ? !days.value!.includes(weekday) : !matches[0])) return { value:null, kind:rule.timeKind, label:timeLabels[rule.timeKind], isOverride:false, conditionConfirmed:true, reason:'선택한 요일은 원문에 적힌 중간 경유 조건과 맞지 않습니다.' };
  }
  if (weekday !== null && rule.overrides.some(override => {
    const condition = data.serviceRules.find(item => item.ruleId === override.conditionRuleId);
    return !condition || !isConfirmed(condition.weekdays, synthetic) || condition.weekdays.conditionCheck !== 'checked';
  })) return { value: null, kind: rule.timeKind, label: timeLabels[rule.timeKind], isOverride: false, conditionConfirmed: false, reason: '대체 시각의 적용 조건이 미확인 또는 충돌하여 보류합니다.' };
  const matches = weekday === null ? [] : rule.overrides.filter(override => {
    const condition = data.serviceRules.find(item => item.ruleId === override.conditionRuleId);
    return condition && isConfirmed(condition.weekdays, synthetic) && condition.weekdays.value?.includes(weekday);
  });
  if (matches.length > 1) return { value: null, kind: rule.timeKind, label: timeLabels[rule.timeKind], isOverride: false, conditionConfirmed: false, reason: '같은 요일에 여러 대체 시각이 적용되어 보류합니다.' };
  const selected = matches[0]?.time ?? rule.baseTime;
  return {
    value: isConfirmed(selected, synthetic) ? selected.value : null,
    kind: rule.timeKind, label: timeLabels[rule.timeKind], isOverride: matches.length === 1,
    conditionConfirmed: isConfirmed(selected, synthetic) && Number.isFinite(minutesOf(selected.value!)) && !(weekday === null && (rule.overrides.length > 0 || !!rule.applicabilityRuleId)),
    reason: matches.length === 1 ? '금요일 대체 시각 · 추가 운행편이 아닙니다.' : selected.missingReason,
  };
}
