import { useEffect, useRef, useState } from 'react';
import { dataset } from '../data';
import { evaluationTasks, type EvaluationMode, type EvaluationTaskId } from '../evaluation/tasks';
import { durationMs, exportEvaluation, type EvaluationRecord, type Observation, type Outcome, type RecordKind, type Uncertainty } from '../evaluation/model';
import './evaluation.css';

const outcomes: [Outcome, string][] = [['pending', '미판정'], ['success', '성공'], ['partial', '부분 완료'], ['failure', '실패']];
const newId = () => crypto.randomUUID();
type Running = { id: string; taskId: EvaluationTaskId; mode: EvaluationMode; kind: RecordKind; start: number | null; startedAt: string | null; preparedAt: string; stoppedAt: number | null; stoppedAtWall: string | null; clicks: number; changes: number; navigations: number; modeDeviations: number };

export function EvaluationPanel() {
  const [isPage, setIsPage] = useState(() => window.location.hash === '#/evaluation');
  const [sessionId, setSessionId] = useState(newId);
  const [consent, setConsent] = useState(false);
  const [kind, setKind] = useState<RecordKind>('rehearsal');
  const [taskId, setTaskId] = useState<EvaluationTaskId>('A');
  const [mode, setMode] = useState<EvaluationMode>('asis');
  const [records, setRecords] = useState<EvaluationRecord[]>([]);
  const [running, setRunning] = useState<Running | null>(null);
  const runningRef = useRef<Running | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [elapsed, setElapsed] = useState(0);
  const [answerStopped, setAnswerStopped] = useState(false);
  const [observations, setObservations] = useState<Observation>({ wrongSelections: 0, correctiveReturns: 0, informationFailures: 0 });
  const [selfOutcome, setSelfOutcome] = useState<Outcome>('pending');
  const [observerOutcome, setObserverOutcome] = useState<Outcome>('pending');
  const [uncertainty, setUncertainty] = useState<Uncertainty>('notAnswered');
  const [ease, setEase] = useState('');
  const [abortReason, setAbortReason] = useState<EvaluationRecord['abortReason']>('participantStop');
  const [feedback, setFeedback] = useState('');
  const activeTask = evaluationTasks.find(item => item.id === (running?.taskId || taskId))!;
  useEffect(() => {
    const hash = () => {
      const evaluation = window.location.hash === '#/evaluation';
      setIsPage(evaluation);
      const current = runningRef.current;
      if (current && current.start !== null && current.stoppedAt === null && !evaluation) {
        current.navigations++;
        const hash = window.location.hash;
        if ((hash.startsWith('#/asis') && current.mode !== 'asis') || ((/^#\/(search|trip|routes)(\/|$)/.test(hash) || hash === '#/') && current.mode !== 'tobe')) current.modeDeviations++;
      }
    };
    const count = (event: Event) => {
      const current = runningRef.current;
      const target = event.target instanceof Element ? event.target : null;
      if (!current || current.start === null || current.stoppedAt !== null || !target || target.closest('[data-evaluation-tool]') || target.closest('[hidden]')) return;
      if (event.type === 'click' && target.closest('button,a,summary,input[type="checkbox"],input[type="radio"]')) current.clicks++;
      if (event.type === 'change' && target.matches('select,input[type="checkbox"],input[type="radio"]')) current.changes++;
    };
    window.addEventListener('hashchange', hash);
    document.addEventListener('click', count, true);
    document.addEventListener('change', count, true);
    return () => { window.removeEventListener('hashchange', hash); document.removeEventListener('click', count, true); document.removeEventListener('change', count, true); };
  }, []);
  useEffect(() => { if (isPage) headingRef.current?.focus(); }, [isPage]);
  useEffect(() => {
    if (!running || running.start === null) return;
    const start = running.start;
    const interval = window.setInterval(() => setElapsed(durationMs(start, runningRef.current?.stoppedAt ?? performance.now())), 250);
    return () => window.clearInterval(interval);
  }, [running]);
  function start() {
    if (!consent || runningRef.current) return;
    window.dispatchEvent(new Event('hci-evaluation-reset'));
    const current: Running = { id: newId(), taskId, mode, kind, start: null, stoppedAt: null, stoppedAtWall: null, startedAt: null, preparedAt: new Date().toISOString(), clicks: 0, changes: 0, navigations: 0, modeDeviations: 0 };
    runningRef.current = current; setRunning(current); setElapsed(0); setAnswerStopped(false);
    setObservations({ wrongSelections: 0, correctiveReturns: 0, informationFailures: 0 });
    setSelfOutcome('pending'); setObserverOutcome('pending'); setUncertainty('notAnswered'); setEase('');
    setAbortReason('participantStop');
    setFeedback('과업을 준비했습니다. 아래 탐색 시작 링크를 누를 때부터 측정합니다.');
  }
  function beginExploration() {
    const current = runningRef.current;
    if (!current || current.start !== null) return;
    current.start = performance.now(); current.startedAt = new Date().toISOString();
    setRunning({ ...current });
    setFeedback('탐색 시간을 측정합니다. 최종 답변 시 시간을 멈추세요.');
  }
  function stopAnswer() {
    const current = runningRef.current;
    if (!current || current.start === null || current.stoppedAt !== null) return;
    current.stoppedAt = performance.now(); current.stoppedAtWall = new Date().toISOString(); setElapsed(durationMs(current.start, current.stoppedAt)); setAnswerStopped(true);
    setFeedback('탐색 시간을 멈췄습니다. 답변·관찰 판정을 입력하고 기록을 마치세요.');
  }
  function finish(status: EvaluationRecord['status']) {
    const current = runningRef.current;
    if (!current || (status === 'completed' && (current.start === null || current.stoppedAt === null))) return;
    const record: EvaluationRecord = { recordId: current.id, sessionId, recordKind: current.kind, consent: true,
      datasetVersion: dataset.metadata.dataVersion, taskId: current.taskId, mode: current.mode, sequence: records.length + 1,
      startedAt: current.startedAt ?? current.preparedAt, endedAt: current.stoppedAtWall ?? new Date().toISOString(), elapsedMs: current.start === null ? 0 : durationMs(current.start, current.stoppedAt ?? performance.now()), timingStarted: current.start !== null, status,
      abortReason: status === 'aborted' ? abortReason : 'none', selfOutcome, observerOutcome, criterionAssessor: current.kind === 'selfEvaluation' ? 'self' : 'observer', uncertainty, ease: ease ? Number(ease) : null,
      clicks: current.clicks, controlChanges: current.changes, navigations: current.navigations, modeDeviations: current.modeDeviations,
      comparable: current.start !== null && current.modeDeviations === 0 && status === 'completed' && observerOutcome !== 'pending', ...observations };
    setRecords(previous => [...previous, record]); runningRef.current = null; setRunning(null);
    setFeedback(status === 'completed' ? '과업 기록을 종료했습니다. 기준 대조 판정의 수행 주체는 JSON에서 구분합니다.' : '중단 기록을 남겼습니다. 완료·실패와 별도로 분석하세요.');
  }
  function download() {
    const blob = new Blob([exportEvaluation(records, sessionId, dataset.metadata.dataVersion)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `hci-evaluation-${sessionId}.json`; a.click(); URL.revokeObjectURL(url);
    setFeedback('JSON을 내보냈습니다. 내려받은 파일은 별도 보관·삭제해야 합니다.');
  }
  function clear() {
    runningRef.current = null; setRunning(null); setRecords([]); setSessionId(newId()); setConsent(false); setElapsed(0); setAnswerStopped(false); setKind('rehearsal');
    setObservations({ wrongSelections: 0, correctiveReturns: 0, informationFailures: 0 });
    setSelfOutcome('pending'); setObserverOutcome('pending'); setUncertainty('notAnswered'); setEase(''); setAbortReason('participantStop');
    setFeedback('이 탭의 평가 기록을 삭제했습니다. 이미 내려받은 파일은 별도로 삭제하세요.');
  }
  if (!isPage) return running ? <aside className="evaluation-dock" data-evaluation-tool aria-label="진행 중 평가">
    <details className="evaluation-reminder">
      <summary>과업 {activeTask.id} · 시나리오 다시 보기</summary>
      <p>{activeTask.instruction}</p>
    </details>
    <div className="evaluation-dock-actions">
      <span>{running.mode === 'asis' ? 'As-is' : 'To-be'} · {Math.floor(elapsed / 1000)}초</span>
      <button type="button" disabled={answerStopped || running.start === null} onClick={stopAnswer}>{answerStopped ? '시간 정지됨' : '답변 완료 · 시간 정지'}</button>
      <a href="#/evaluation">판정 / 중단</a>
    </div>
  </aside> : null;
  return <section className="evaluation-page page-section" data-evaluation-tool aria-labelledby="evaluation-heading">
    <div className="page-heading"><span className="eyebrow">HCI EVALUATION LAB</span><h1 id="evaluation-heading" ref={headingRef} tabIndex={-1}>탐색 방식 비교 평가</h1><p>실행 가능한 평가 도구입니다. 외부 사용자 평가 결과나 개선 효과를 제공하지 않습니다.</p></div>
    <div className="evaluation-notice"><strong>기록은 동의 후 이 탭의 메모리에만 남습니다.</strong><p>이름·학번·집주소·검색어·클릭한 문구를 수집하지 않습니다. 서버 전송·자동 저장이 없으며 새로고침하면 사라집니다. 동의 철회 시 ‘전체 기록 삭제’를 누르세요. 내보낸 파일은 평가 담당자가 별도로 관리합니다.</p><p>리허설·자동 검증은 실제 사람의 평가가 아닙니다. 이번 실제 평가는 개발자 본인 1명입니다. 개발·반복 사용 경험으로 일반 사용자를 대표하지 않으며 효과를 일반화할 수 없습니다. 기준 대조 판정은 편의성 자기판정과 별도로 입력합니다.</p></div>
    <div className="evaluation-grid"><section className="evaluation-card"><h2>1. 평가 준비</h2>
      <fieldset disabled={!!running}><legend>기록 설정</legend><label>기록 종류<select value={kind} onChange={event => setKind(event.target.value as RecordKind)}><option value="rehearsal">리허설 / 자동 테스트용</option><option value="selfEvaluation">개발자 본인 1명 · 실제 자기평가</option><option value="participant">동의한 실제 참여자 (별도 연구용)</option></select></label><label>과업<select value={taskId} onChange={event => setTaskId(event.target.value as EvaluationTaskId)}>{evaluationTasks.map(task => <option value={task.id} key={task.id}>{task.id}. {task.title}</option>)}</select></label><label>비교 방식<select value={mode} onChange={event => setMode(event.target.value as EvaluationMode)}><option value="asis">As-is · 목록 기준 화면</option><option value="tobe">To-be · 장소 후보 비교</option></select></label><label className="evaluation-consent"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)}/>설명된 수집 항목·탭 메모리 보관·내보내기·철회 방법을 이해하고 기록에 동의합니다.</label></fieldset>
      <div className="evaluation-task"><h3>과업 {activeTask.id} · {activeTask.title}</h3><p>{activeTask.instruction}</p><small>두 방식 모두 같은 {dataset.trips.length}편 · {dataset.metadata.dataVersion}</small></div>
      {!running ? <button type="button" className="primary-button" disabled={!consent} onClick={start}>과업 시작</button> : <div className="evaluation-running"><p><strong>{running.start === null ? '탐색 시작 대기 · 0초' : `${Math.floor(elapsed / 1000)}초 경과`}</strong> · API 대기시간 포함 · 답변 후 시간 정지</p><a className="primary-button" aria-disabled={answerStopped || undefined} onClick={event => { if (answerStopped) event.preventDefault(); else beginExploration(); }} href={running.mode === 'asis' ? '#/asis' : '#/search'}>선택한 방식으로 탐색 시작</a><p>과업 준비 시 이전 검색·조건을 초기화합니다. 위 탐색 시작 링크를 누를 때부터 측정하며 준비 대기시간은 제외합니다. 탐색 화면 아래의 답변 완료로 시간을 멈춘 뒤 돌아와 판정하세요.</p></div>}
    </section><section className="evaluation-card"><h2>2. 답변과 관찰 기록</h2><button type="button" className="primary-button" disabled={!running || running.start === null || answerStopped} onClick={stopAnswer}>탐색 종료 · 시간 멈추기</button><p>최종 답변 시 시간을 멈춘 뒤 판정과 횟수를 기록하고 종료하세요. 답변 녹음·자유 서술은 수집하지 않습니다. 혼동한 정보·문제·개선 제안은 평가 절차의 빈 양식에 직접 기록하세요.</p>
      <fieldset disabled={!running}><legend>진행 중인 과업의 관찰</legend><label>참여자 자기판정<select value={selfOutcome} onChange={event => setSelfOutcome(event.target.value as Outcome)}>{outcomes.map(([value, name]) => <option value={value} key={value}>{name}</option>)}</select></label><label>{running?.kind === 'selfEvaluation' ? '본인 기준 대조 판정' : '관찰자 기준 판정'}<select value={observerOutcome} onChange={event => setObserverOutcome(event.target.value as Outcome)}>{outcomes.map(([value, name]) => <option value={value} key={value}>{name}</option>)}</select></label><label>남은 불확실성<select value={uncertainty} onChange={event => setUncertainty(event.target.value as Uncertainty)}><option value="notAnswered">미응답</option><option value="none">남은 불확실성 없음</option><option value="location">승하차 위치</option><option value="operation">실제 운행·요일·특수일</option><option value="time">시각의 의미·적용</option><option value="multiple">복수 항목 / 아직 답변 전</option></select></label><label>주관적 사용 편의성<select value={ease} onChange={event => setEase(event.target.value)}><option value="">미응답</option>{[1, 2, 3, 4, 5, 6, 7].map(value => <option value={value} key={value}>{value}{value === 1 ? ' · 매우 어려움' : value === 7 ? ' · 매우 쉬움' : ''}</option>)}</select></label>
      <div className="evaluation-counters">{([['wrongSelections', '잘못된 선택'], ['correctiveReturns', '오선택 수정 복귀'], ['informationFailures', '정보 확인 실패']] as const).map(([key, label]) => <div key={key}><span>{label} <strong>{observations[key]}</strong></span><button type="button" aria-label={`${label} +1 1회 추가`} onClick={() => setObservations(previous => ({ ...previous, [key]: previous[key] + 1 }))}>+1</button><button type="button" aria-label={`${label} −1 1회 취소`} disabled={observations[key] === 0} onClick={() => setObservations(previous => ({ ...previous, [key]: Math.max(0, previous[key] - 1) }))}>−1</button></div>)}</div>
      <button type="button" className="primary-button" disabled={!answerStopped} onClick={() => finish('completed')}>답변 완료 · 기록 종료</button><label>중단 사유<select value={abortReason} onChange={event => setAbortReason(event.target.value as EvaluationRecord['abortReason'])}><option value="participantStop">참여자 중단 / 포기</option><option value="providerFailure">검색·지도 공급자 장애</option><option value="timeLimit">사전 고정 시간 초과</option></select></label><button type="button" className="secondary-button" onClick={() => finish('aborted')}>과업 중단 기록</button></fieldset>
    </section></div>
    <p className="evaluation-feedback" role="status">{feedback}</p>
    <section className="evaluation-card"><h2>3. 이 탭의 결과 {records.length}건</h2><p>측정값은 과업 종료까지의 도구 시간입니다. 정상 비교 복귀와 오류 수정 복귀를 구분하세요. 자동 이벤트 수는 키 입력 수·물리 클릭 수와 다르며, 검색어는 보관하지 않습니다.</p><div className="evaluation-actions"><button type="button" className="secondary-button" disabled={!records.length || !!running} onClick={download}>결과 JSON 내보내기</button><button type="button" className="text-button" onClick={clear}>전체 기록 삭제 · 동의 철회</button></div>
    <ol className="evaluation-results">{records.map(record => <li key={record.recordId}><strong>{record.recordKind === 'rehearsal' ? '리허설' : record.recordKind === 'selfEvaluation' ? '개발자 본인 자기평가' : '실제 참여자'} · {record.taskId} · {record.mode === 'asis' ? 'As-is' : 'To-be'}</strong><span>{record.status === 'aborted' ? '중단' : '완료'} · {(record.elapsedMs / 1000).toFixed(1)}초 · 클릭 이벤트 {record.clicks} · 제어 변경 {record.controlChanges} · 화면 이동 {record.navigations}</span><span>{record.modeDeviations > 0 ? `혼합 방식 이동 ${record.modeDeviations}회 · 비교 제외` : record.comparable ? "구조상 비교 가능 (기록 종류별로 분리 분석)" : "중단 또는 관찰 미판정 · 비교 제외"}</span><span>자기판정 {outcomes.find(item => item[0] === record.selfOutcome)?.[1]} / {record.criterionAssessor === 'self' ? '본인 기준 대조' : '관찰자'} {outcomes.find(item => item[0] === record.observerOutcome)?.[1]}</span></li>)}</ol></section>
    <details className="evaluation-card"><summary>평가자용 성공 기준·절차 (참여자에게 정답을 먼저 보여주지 마세요)</summary><p>한 세션은 한 익명 참여자 또는 한 리허설 단위입니다. 참여자가 바뀌면 내보낸 뒤 전체 기록을 삭제하세요. 순서는 As-is→To-be / To-be→As-is로 교차 배정하고 모드별 별도 연습을 하세요. 동일 과업 반복의 학습 효과가 남으므로 소규모 결과를 일반화하지 않습니다.</p>{evaluationTasks.map(task => <article key={task.id}><h3>{task.id}. {task.title}</h3><p>{task.criteria}</p><small>근거: {task.evidence}</small></article>)}<p>완전 성공: 과업의 모든 정보·한계 기준을 충족. 부분 완료: 일부 기준만 충족. 실패: 잘못된 방향/시각/편을 최종 답으로 제출하거나 필수 정보를 확인하지 못함. 적절한 보류는 불확실성 이해로 별도 기록하며 실제 탑승 성공으로 세지 않습니다.</p><p>자동 기록은 서비스 영역의 클릭·select/체크박스/라디오 변경·해시 이동 횟수만 셉니다. 평가 도구 조작·평가 화면으로 복귀는 제외합니다. 잘못된 선택·오선택 수정 복귀·정보 확인 실패는 관찰자가 직접 기록합니다. 키보드 활성화 click도 포함하며 합산해 ‘총 클릭 수’로 해석하지 마세요.</p><p>과업 시작 시 서비스 검색·조건이 자동 초기화됩니다. 평가자는 두 모드의 초기 화면·동일 기기·네트워크·동일 자료 버전을 확인하세요. 시간상한은 파일럿 후 본평가 전에 정하세요. 공급자 장애는 환경 중단으로 분리합니다. 성공률 90%·시간 30% 감소는 미검증 목표이며 이 도구는 개선율을 자동 산출하지 않습니다.</p></details>
  </section>;
}

