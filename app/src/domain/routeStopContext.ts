import { isConfirmed, resolveTime } from './time';
import type { Dataset, DirectionalStop, StopOccurrence, StopRole, TimeRule, Weekday } from './types';

const roleLabels: Record<StopRole, string> = {
  boarding: '승차', alighting: '하차', via: '경유', campusArrival: '학교 도착',
};
const dayNames: Record<Weekday, string> = {
  MON: '월', TUE: '화', WED: '수', THU: '목', FRI: '금', SAT: '토', SUN: '일',
};

interface RouteStopRow {
  occurrence: StopOccurrence;
  stop: DirectionalStop;
  timeRule?: TimeRule;
}

export function getRouteStopContext(data: Dataset, row: RouteStopRow, weekday: Weekday | null) {
  const { occurrence, stop, timeRule } = row;
  const time = resolveTime(data, timeRule, weekday);
  const openConflicts = data.conflicts.filter(conflict => conflict.state === 'open');
  const tripHeld = openConflicts.some(conflict => conflict.withheldTargetIds.includes(occurrence.tripId));
  const stopConflicts = openConflicts.filter(conflict =>
    conflict.withheldTargetIds.includes(occurrence.tripStopId) || conflict.withheldTargetIds.includes(stop.stopId));
  const conflictNote = tripHeld || stopConflicts.length ? '학교 확인 필요' : null;
  const disputedCall = stopConflicts.some(conflict => conflict.conflictId === 'CF13');

  let viaCondition = null;
  if (timeRule?.applicabilityRuleId) {
    const days = data.serviceRules.find(rule => rule.ruleId === timeRule.applicabilityRuleId)?.weekdays;
    if (days && isConfirmed(days, data.metadata.dataKind === 'syntheticDemo') && days.conditionCheck === 'checked' && days.value?.length) {
      viaCondition = `문서상 ${days.value.map(day => dayNames[day]).join('·')} 경유`;
      if (weekday && !days.value.includes(weekday) && !conflictNote) {
        viaCondition += ` · ${dayNames[weekday]}요일은 경유 대상에서 제외`;
      }
    } else {
      viaCondition = weekday && time.conditionConfirmed
        ? `${dayNames[weekday]}요일 ${time.value ? '경유' : '경유하지 않음'}`
        : '경유 요일 확인 필요';
    }
  }
  const arrivalNotListed = stop.role === 'alighting' && !time.value && !viaCondition && !conflictNote &&
    (!timeRule || (timeRule.timeKind === 'officialArrivalAtStop' && timeRule.baseTime.documentCheck === 'notProvided' && !timeRule.overrides.length));
  return { roleLabel: roleLabels[stop.role], time: conflictNote ? { ...time, value: null, conditionConfirmed: false } : time, viaCondition, conflictNote, disputedCall, arrivalNotListed };
}
