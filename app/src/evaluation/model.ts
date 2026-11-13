import type { EvaluationMode, EvaluationTaskId } from './tasks';

export type RecordKind = 'rehearsal' | 'participant' | 'selfEvaluation';
export type Outcome = 'success' | 'partial' | 'failure' | 'pending';
export type Uncertainty = 'notAnswered' | 'none' | 'location' | 'operation' | 'time' | 'multiple';
export interface EvaluationRecord {
  recordId: string; sessionId: string; recordKind: RecordKind; consent: true;
  datasetVersion: string; taskId: EvaluationTaskId; mode: EvaluationMode;
  sequence: number; startedAt: string; endedAt: string; elapsedMs: number;
  status: 'completed' | 'aborted'; abortReason: 'none' | 'participantStop' | 'providerFailure' | 'timeLimit';
  selfOutcome: Outcome; observerOutcome: Outcome; uncertainty: Uncertainty;
  criterionAssessor: 'self' | 'observer';
  timingStarted: boolean;
  ease: number | null; clicks: number; controlChanges: number; navigations: number;
  modeDeviations: number; comparable: boolean;
  wrongSelections: number; correctiveReturns: number; informationFailures: number;
}
export type Observation = Pick<EvaluationRecord, 'wrongSelections' | 'correctiveReturns' | 'informationFailures'>;
export function durationMs(start: number, end: number) { return Math.max(0, Math.round(end - start)); }
export function exportEvaluation(records: EvaluationRecord[], sessionId: string, datasetVersion: string) {
  return JSON.stringify({ schemaVersion: 'mnu-hci-evaluation.2', sessionId, datasetVersion, taskVersion: 'P058-20261112',
    notice: '리허설·자동검증과 실제 평가를 분리한다. selfEvaluation은 개발자 본인 1명의 자기평가로 일반화할 수 없다. observerOutcome은 기준 대조 판정이며 criterionAssessor로 본인/관찰자를 구분한다. 검색어·주소·조작 대상 문자열을 저장하지 않는다.',
    metricDefinitions: { clicks: 'service interactive-element click events, including keyboard activation', controlChanges: 'service select/checkbox/radio change events', navigations: 'service hash changes; evaluation page changes excluded', elapsedMs: 'monotonic duration from exploration link activation to answer stop, including API wait; preparation and later judgement excluded; no pause', timingStarted: 'false for cancellation before exploration; elapsedMs=0, not comparable' }, records }, null, 2);
}
