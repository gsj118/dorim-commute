import { dataset } from '../data';
import type { Trip, Weekday } from '../domain/types';

export const dayNames: Record<Weekday, string> = { MON:'월', TUE:'화', WED:'수', THU:'목', FRI:'금', SAT:'토', SUN:'일' };
export function tripConditionSummary(trip: Trip, weekday: Weekday | null) {
  const rules = dataset.serviceRules.filter(rule => trip.serviceRuleIds.includes(rule.ruleId));
  const known = rules.filter(rule => rule.weekdays.verificationStatus === 'VERIFIED' && rule.weekdays.conditionCheck === 'checked' && rule.weekdays.value);
  if (weekday && known.some(rule => !rule.weekdays.value!.includes(weekday))) {
    return { warning: '선택 요일 운행 안 함 · 문서 기준', text: `선택한 ${dayNames[weekday]}요일은 문서상 운행요일과 맞지 않습니다.` };
  }
  if (weekday === 'SAT' || weekday === 'SUN') {
    return { warning: '주말 정규 운행 없음', text: `선택한 ${dayNames[weekday]}요일은 평일 운행 대상이 아닙니다.` };
  }
  const text = known.map(rule => rule.weekdays.value!.map(day => dayNames[day]).join('·').replace('월·화·수·목', '월~목') + ' 운행').join(' / ');
  return { warning: null, text };
}
export function TripConditions({ trip, weekday }: { trip: Trip; weekday: Weekday | null }) {
  const summary = tripConditionSummary(trip, weekday);
  const notes = dataset.serviceRules.filter(rule => trip.serviceRuleIds.includes(rule.ruleId) && rule.rawNote.value);
  const keepsSeats = trip.documentNotes?.some(note => note.includes('탑승 인원을 감안하여 좌석 확보'));
  const exceptions = keepsSeats
    ? ['화·수 에너지밸리캠퍼스 17:05 경유 · 경유지 탑승 좌석 확보']
    : notes.flatMap(rule => (rule.rawNote.value ?? '').split('/').map(part => part.trim()))
      .filter(note => note && note !== '월~목운행');
  if (!summary.text && !exceptions.length) return null;
  return <section className="trip-conditions" aria-label="운행 조건">
    <h2>운행 조건</h2>
    {summary.text && <p className={summary.warning ? 'condition-mismatch' : undefined}>{summary.warning && <strong>{summary.warning}<br/></strong>}{summary.text}</p>}
    {[...new Set(exceptions)].map(note => <p key={note}>{note}</p>)}
  </section>;
}
