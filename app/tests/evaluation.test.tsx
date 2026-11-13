import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EvaluationPanel } from '../src/components/EvaluationPanel';
import { evaluationTasks } from '../src/evaluation/tasks';
import { dataset, getStopTime, getTripStops, getTripTime } from '../src/data';
import * as model from '../src/evaluation/model';

afterEach(() => { cleanup(); vi.restoreAllMocks(); window.location.hash = ''; });
function setup() { window.location.hash = '#/evaluation'; render(<EvaluationPanel/>); }
function prepare() { fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByRole('button', { name: '과업 시작' })); }
function start() { prepare(); fireEvent.click(screen.getByRole('link', { name: '선택한 방식으로 탐색 시작' })); }
function hash(path: string) { act(() => { window.location.hash = path; window.dispatchEvent(new HashChangeEvent('hashchange')); }); }
function exportedRecords() {
  const spy = vi.spyOn(model, 'exportEvaluation');
  Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:test'), configurable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  fireEvent.click(screen.getByRole('button', { name: '결과 JSON 내보내기' }));
  return spy.mock.calls[0][0];
}

describe('consented in-memory evaluation', () => {
  it('excludes preparation and records cancellation without a started timer', () => {
    const clock = vi.spyOn(performance, 'now').mockReturnValue(1000); setup(); prepare();
    expect((screen.getByRole('button', { name: '탐색 종료 · 시간 멈추기' }) as HTMLButtonElement).disabled).toBe(true);
    clock.mockReturnValue(11000);
    fireEvent.click(screen.getByRole('link', { name: '선택한 방식으로 탐색 시작' }));
    clock.mockReturnValue(13500); fireEvent.click(screen.getByRole('button', { name: '탐색 종료 · 시간 멈추기' }));
    fireEvent.click(screen.getByRole('button', { name: '답변 완료 · 기록 종료' }));
    const [record] = exportedRecords(); expect(record.elapsedMs).toBe(2500); expect(record.timingStarted).toBe(true);
  });
  it('identifies developer self-assessment without inventing an independent observer', () => {
    setup(); fireEvent.change(screen.getByLabelText('기록 종류'), { target: { value: 'selfEvaluation' } }); start();
    fireEvent.click(screen.getByRole('button', { name: '탐색 종료 · 시간 멈추기' }));
    fireEvent.change(screen.getByLabelText('본인 기준 대조 판정'), { target: { value: 'partial' } });
    fireEvent.click(screen.getByRole('button', { name: '답변 완료 · 기록 종료' }));
    const [record] = exportedRecords(); expect(record.recordKind).toBe('selfEvaluation'); expect(record.criterionAssessor).toBe('self');
    expect(record.selfOutcome).toBe('pending'); expect(record.observerOutcome).toBe('partial');
  });

  it('requires explicit consent and does not turn self-reported success into observed success', () => {
    setup(); expect((screen.getByRole('button', { name: '과업 시작' }) as HTMLButtonElement).disabled).toBe(true);
    start(); fireEvent.change(screen.getByLabelText('참여자 자기판정'), { target: { value: 'success' } });
    fireEvent.click(screen.getByRole('button', { name: '탐색 종료 · 시간 멈추기' }));
    fireEvent.click(screen.getByRole('button', { name: '답변 완료 · 기록 종료' }));
    const [record] = exportedRecords(); expect(record.recordKind).toBe('rehearsal'); expect(record.selfOutcome).toBe('success');
    expect(record.observerOutcome).toBe('pending'); expect(record.comparable).toBe(false);
  });
  it('freezes elapsed time at final answer before observer input and export', () => {
    const clock = vi.spyOn(performance, 'now').mockReturnValue(1000); setup(); start();
    hash('#/asis'); clock.mockReturnValue(3500);
    fireEvent.click(screen.getByRole('button', { name: '답변 완료 · 시간 정지' }));
    clock.mockReturnValue(9000); hash('#/evaluation');
    fireEvent.change(screen.getByLabelText('관찰자 기준 판정'), { target: { value: 'success' } });
    fireEvent.click(screen.getByRole('button', { name: '답변 완료 · 기록 종료' }));
    const [record] = exportedRecords(); expect(record.elapsedMs).toBe(2500); expect(record.comparable).toBe(true);
  });
  it('counts only service event categories and flags mixed-mode trials without saving search text', () => {
    setup(); start(); hash('#/search');
    const service = document.createElement('div'); service.innerHTML = '<button>service action</button><input type="search" value="private-query"><select><option>service option</option></select>';
    document.body.append(service); fireEvent.click(service.querySelector('button')!); fireEvent.change(service.querySelector('input')!, { target: { value: 'private-new-query' } });
    fireEvent.change(service.querySelector('select')!); hash('#/evaluation');
    fireEvent.click(screen.getByRole('button', { name: '탐색 종료 · 시간 멈추기' }));
    fireEvent.click(screen.getByRole('button', { name: '답변 완료 · 기록 종료' }));
    const records = exportedRecords(); service.remove();
    expect(records[0].clicks).toBe(1); expect(records[0].controlChanges).toBe(1); expect(records[0].modeDeviations).toBeGreaterThan(0); expect(records[0].comparable).toBe(false);
    expect(JSON.stringify(records)).not.toMatch(/private|service action|service option/);
  });
  it('records provider interruption separately and supports withdrawal without persisted records', () => {
    setup(); start(); fireEvent.change(screen.getByLabelText('중단 사유'), { target: { value: 'providerFailure' } });
    fireEvent.click(screen.getByRole('button', { name: '과업 중단 기록' }));
    const [record] = exportedRecords(); expect(record.status).toBe('aborted'); expect(record.abortReason).toBe('providerFailure'); expect(record.comparable).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '전체 기록 삭제 · 동의 철회' }));
    expect(screen.getByRole('heading', { name: '3. 이 탭의 결과 0건' })).toBeTruthy(); expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole('button', { name: '결과 JSON 내보내기' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('task answer keys use the shared snapshot', () => {
  it('keeps all task trips present and checks A and C document time and weekday facts', () => {
    evaluationTasks.forEach(task => task.tripIds.forEach(id => expect(dataset.trips.some(trip => trip.tripId === id)).toBe(true)));
    const a = evaluationTasks[0];
    const expected = ['07:09', '07:13', '09:31'];
    a.tripIds.forEach((id, i) => { const stop = getTripStops(id).find(item => item.stop.displayName.includes('수완2차우미린'))!; expect(getStopTime(stop.occurrence.tripStopId, 'MON').value).toBe(expected[i]); });
    expect(getTripTime('tp-s25-from-jinwol-03', 'MON').value).toBe('17:30');
    expect(getTripTime('tp-s25-from-jinwol-03', 'FRI').value).toBe('15:30');
    const first = dataset.trips.find(trip => trip.tripId === 'tp-s25-from-jinwol-01')!;
    expect(dataset.serviceRules.find(rule => first.serviceRuleIds.includes(rule.ruleId))?.weekdays.value).toEqual(['MON', 'TUE', 'WED', 'THU']);
  });
  it('uses monotonic nonnegative duration without invented outcome aggregation', () => {
    expect(model.durationMs(1000, 3400.8)).toBe(2401); expect(model.durationMs(2000, 1000)).toBe(0);
    const data = JSON.parse(model.exportEvaluation([], 'anonymous', dataset.metadata.dataVersion));
    expect(data.records).toEqual([]); expect(data).not.toHaveProperty('improvementRate');
  });
});
