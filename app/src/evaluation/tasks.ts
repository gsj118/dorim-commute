export type EvaluationMode = 'asis' | 'tobe';
export const evaluationTasks = [
  { id: 'A', title: '생활권에서 등교편 찾기', direction: 'toCampus',
    instruction: '월요일 수완2차우미린 아파트 주변에서 도림캠퍼스로 등교하려 합니다. 관련 승차 지점과 운행편별 승차 시각을 비교하고, 위치 근거와 아직 확인할 내용을 말해 주세요.',
    criteria: '수완2차우미린Ⓐ승강장: 송정⑤ 07:09, ⑥ 07:13, ⑩ 09:31 중 2편 이상 비교. 지점 승차시각과 학교 도착시각을 구분. 지도 표시점·실제 도로변/당일 운행 미확인을 설명.',
    evidence: 'S25 p.1 광주 등교 송정⑤·⑥·⑩ / S51 편별 공식 지도 표시점', tripIds: ['tp-s25-to-songjeong-05', 'tp-s25-to-songjeong-06', 'tp-s25-to-songjeong-10'] },
  { id: 'B', title: '목적지로 하교편 찾기', direction: 'fromCampus',
    instruction: '월요일 도림캠퍼스에서 동신고 주변으로 하교하려 합니다. 관련 편과 하차 지점, 학교에서 탈 위치와 출발 시각을 확인하고, 아직 모르는 정보를 말해 주세요.',
    criteria: '동신고 경유 진월① 15:30(월~목), ③ 기본 17:30, ⑤ 18:20을 비교. ⑤를 주변에서 찾는 거리는 ③의 동신고 표시점 기준이며 ⑤의 실제 하차 위치·기본 요일은 미확인. 학교 승차 MNU 스퀘어 앞은 사용자 확인. 광주 하차시각 미제공·학교 승차좌표 없음·당일 운행 미확인을 설명. ① 지도는 ③ 표시점 참고연결 가설.',
    evidence: 'S25 p.1 광주 하교 진월①·③ / S47 / S50 / MVP3_DATA', tripIds: ['tp-s25-from-jinwol-01', 'tp-s25-from-jinwol-03', 'tp-s25-from-jinwol-05'] },
  { id: 'C', title: '학교 출발 시간조건 비교', direction: 'fromCampus',
    instruction: '동신고 주변으로 하교하며 학교에서 16:00 이후 출발할 수 있습니다. 월요일과 금요일의 수록 편을 비교하고, 조건에 맞는 문서상 후보와 남은 확인사항을 말해 주세요.',
    criteria: '월요일 ①15:30 제외, ③17:30 참고 후보. 금요일 ①월~목 제외, ③15:30 대체로 시간 불일치. ⑤는 학교 출발 18:20, 기본 요일 미확인. 동신고 기준점이 반경에 들면 ⑤를 발견할 수 있으며 그 기준점의 출처와 실제 하차 위치 미확인을 설명. 거리 0건이면 조건과 전체 시간표를 함께 확인. 당일 운행은 별도 확인.',
    evidence: 'S25 p.1 진월① 비고 월~목 / 진월③ 금요일 15:30 대체 / getTripTime', tripIds: ['tp-s25-from-jinwol-01', 'tp-s25-from-jinwol-03', 'tp-s25-from-jinwol-05'] },
  { id: 'D', title: '같은 이름의 위치와 한계 확인', direction: 'toCampus',
    instruction: '수완2차우미린Ⓐ승강장을 지나는 송정⑤와 ⑥을 각각 열어 위치 설명과 지도 표시점을 확인해 주세요. 이름이 같으니 실제 도로변도 같다고 확정해도 되는지, 무엇을 더 확인해야 하는지 말해 주세요.',
    criteria: '두 편의 해당 지점·설명·표시점을 각각 확인. 공식 지도 표시점 수준과 실제 도로변 검증을 구분하고 현장 도로 양편 판정은 보류. 표시점 차이만으로 도로 양편이라고 판단하지 않음.',
    evidence: 'S25 p.1 송정⑤·⑥ / S51 편별 지도 / DATA_RULES. 실제 도로 양편 구분 실험은 자료 부족으로 보류.', tripIds: ['tp-s25-to-songjeong-05', 'tp-s25-to-songjeong-06'] },
] as const;
export type EvaluationTaskId = typeof evaluationTasks[number]['id'];
