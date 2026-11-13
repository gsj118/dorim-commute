import type { RecommendationResult } from '../domain/recommend';
import type { Direction } from '../domain/types';

export function DirectionCoverage({ direction, result }: { direction: Direction; result: RecommendationResult }) {
  const { listedTrips, listedOccurrences } = result.coverage;
  const { direct, shared, anchor, discoverable, missing, withheld } = result.discoveryCoverage;
  const inbound = direction === 'toCampus';
  return <div className="direction-coverage">
    <details><summary>거리 비교에 쓴 위치 자료</summary>
      <p>{inbound ? '등교' : '하교'} 시간표 전체 <strong>{listedTrips}편</strong> 중
      {' '}<strong>{discoverable.trips}편</strong>을 정류장 또는 주변 기준점으로 찾을 수 있어요.</p>
      <p>편별 {inbound ? '승차' : '하차'} 지점 {listedOccurrences}개 중 {discoverable.occurrences}개에 비교할 위치 자료가 있습니다.</p>
      <ul>
        <li>해당 편의 표시점 · {direct.trips}편, {direct.occurrences}개 지점</li>
        {shared.occurrences > 0 && <li>동일 경유 순서인 편의 표시점 · {shared.trips}편, {shared.occurrences}개 지점</li>}
        {anchor.occurrences > 0 && <li>주변 시설 또는 다른 편의 표시점 · {anchor.trips}편, {anchor.occurrences}개 지점</li>}
        {missing.occurrences > 0 && <li>비교할 위치 미확인 · {missing.occurrences}개 지점</li>}
        {withheld.occurrences > 0 && <li>운행 정보 확인 필요 · {withheld.occurrences}개 지점</li>}
      </ul>
      <p>한 편에서 지점마다 다른 위치 자료를 사용할 수 있습니다.</p>
    </details>
  </div>;
}
