import { useRef } from 'react';
import { Icon } from './Icon';
import timetable from '../assets/commute-timetable-2026-fall.pdf?url';
import excerpt from '../assets/homeward-excerpt.png';

export const officialUnibus = 'https://mokpo.unibus.kr/#!/index';
const fridayExample = '?demo=hwajeong&day=FRI';
// Kakao place 18583473, checked with the Friday example on 2026-11-13.
export const exampleDestination = {
  name: '유니버시아드힐스테이트2단지아파트',
  coordinates: { latitude: 35.14640530365541, longitude: 126.87963166633668, crs: 'WGS84' as const },
};

export function SubmissionComparison() {
  const tableHeading = useRef<HTMLHeadingElement>(null);
  return <section className="submission-comparison" aria-labelledby="comparison-question">
    <header className="comparison-intro">
      <p>금요일 하교 · 도림캠퍼스 → 광주 서구 화정동</p>
      <h1 id="comparison-question" tabIndex={-1}>유니버시아드 힐스테이트 2단지로 가려면<br/> 어디서 몇 시에 어떤 버스를 타야 할까요?</h1>
    </header>
    <div className="comparison-methods">
      <article>
        <p className="method-label"><Icon name="route"/> 기존 방식 · 공식 Unibus</p>
        <h2>노선에서 정류장 찾기</h2>
        <p>Unibus의 ‘노선정보 → 하교’에서 경유지를 살펴보세요. 이 페이지의 학교 노선표에서는 각 편의 출발시간과 금요일 비고를 대조할 수 있어요.</p>
        <div className="method-actions">
          <a className="method-action" href={officialUnibus} target="_blank" rel="noreferrer">공식 Unibus 열기 <Icon name="external"/><span className="sr-only">(새 탭)</span></a>
          <button type="button" className="comparison-text-link" onClick={() => {
            tableHeading.current?.focus({ preventScroll: true });
            tableHeading.current?.scrollIntoView({ block: 'start' });
          }}>전체 노선표 보기</button>
        </div>
      </article>
      <article className="dorim-method">
        <p className="method-label"><Icon name="pin"/> 도림통학</p>
        <h2>내가 아는 장소로 내릴 곳 찾기</h2>
        <p>단지를 선택하면 주변 하차 후보와 그곳을 지나는 편의 학교 승차 장소·출발 시각을 함께 볼 수 있어요.</p>
        <div className="method-actions">
          <a className="method-action" href={fridayExample + '#/search'}>2단지로 직접 찾아보기 <Icon name="arrow"/></a>
          <a className="comparison-text-link" href={fridayExample + '&example=trip#/trip/tp-s25-from-songjeong-03/occ-tp-s25-from-songjeong-03-01'}>운행편 예시 바로 보기</a>
        </div>
      </article>
    </div>
    <figure className="timetable-excerpt">
      <figcaption>
        <div><h2 ref={tableHeading} tabIndex={-1}>광주권 하교 노선표 전체</h2><p>2026학년도 2학기 노선표(안) 1쪽 · 송정 방향 11편, 진월 방향 8편</p></div>
        <a className="comparison-text-link" href={timetable} target="_blank" rel="noreferrer">전체 PDF 열기 <Icon name="external"/><span className="sr-only">(새 탭)</span></a>
      </figcaption>
      <a className="excerpt-image" href={excerpt} target="_blank" rel="noreferrer" aria-label="광주권 하교 노선표 크게 보기 (새 탭)">
        <img src={excerpt} width="1488" height="2038" alt="광주권 하교 19편의 종착지점, 출발시간, 차량편수, 경유지와 비고. 위쪽은 송정 ①~⑪, 아래쪽은 진월 ①~⑧이며 전체 PDF 1쪽에서 표의 텍스트를 읽을 수 있습니다."/>
        <span>노선표 크게 보기 <Icon name="external"/></span>
      </a>
    </figure>
    <a className="method-action" href={fridayExample + '#/search'}>도림통학에서 같은 목적지 찾아보기 <Icon name="arrow"/></a>
  </section>;
}
