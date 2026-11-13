import { describe, expect, it } from 'vitest';
import { groupPlaceResults, visiblePlaceResults, withoutApartmentPhase } from '../src/domain/placeResults';
import { normalizePlace } from '../src/providers/kakao';

function place(name: string, category?: string, longitude = '126') {
  return normalizePlace({ place_name: name, category_name: category, x: longitude, y: '35' }, 'place')!;
}

describe('apartment and facility search order', () => {
  const complex = place('시험마을', '부동산 > 주거시설 > 아파트');
  const entrance = place('시험마을 정문', '교통,수송 > 입출구', '126.1');
  const office = place('시험마을 정문공인중개사사무소', '부동산 > 부동산중개업');
  const shop = place('시험마을 상가동', '가정,생활 > 상가,아케이드 > 아파트상가');

  it('keeps the requested complex number separate from buildings, gates and other sites', () => {
    const first = place('푸른마을2단지아파트');
    const second = place('강변푸른마을제2단지아파트');
    const library = place('푸른마을 2단지 작은도서관');
    const related = [place('푸른마을1단지 상가2동'), place('푸른마을3단지 게이트2'),
      place('푸른마을12단지아파트'), place('푸른마을2차아파트'), place('다른마을2단지아파트')];
    const groups = groupPlaceResults('푸른마을 2 단지', [library, ...related, first, second]);
    expect(groups.map(group => group.items)).toEqual([[first, second], [library], related]);
    expect(groupPlaceResults('푸른마을 2단지', related)[0].items).toHaveLength(0);
    expect(withoutApartmentPhase('북구 연제2단지')).toBe('북구 연제');
    expect(withoutApartmentPhase('나주 푸른마을 제 2 차')).toBe('나주 푸른마을');
  });

  it('moves complexes from later provider pages before facilities without changing order within groups', () => {
    const facilities = Array.from({ length: 11 }, (_, i) => place('시험마을 게이트' + i));
    const second = place('시험마을2차아파트');
    const sections = groupPlaceResults('시험마을', [...facilities, complex, second]);
    expect(sections.map(s => s.items)).toEqual([[complex, second], facilities]);
    expect(visiblePlaceResults(sections, 3).sections[0].items).toEqual([complex, second]);
    expect(visiblePlaceResults(sections, 3).sections[1].items).toEqual(facilities.slice(0, 1));
    expect(visiblePlaceResults(sections, 15).sections).toEqual(sections);
  });
  it('matches the actual entrance separately from a broker and preserves the entrance coordinates', () => {
    const sections = groupPlaceResults('시험마을 정문', [office, complex, entrance]);
    expect(sections[0]).toEqual({ title: '정문', items: [entrance] });
    expect(sections[0].items[0].coordinates?.longitude).toBe(126.1);
    expect(groupPlaceResults('시험마을 정문', [office])).toEqual([{ title: '다른 장소', items: [office] }]);
  });
  it('puts shops first for a shop query, keeps facility-only results and omits empty sections', () => {
    expect(groupPlaceResults('시험마을 상가동', [complex, shop, office]).map(s => s.items)).toEqual([[shop], [complex, office]]);
    expect(groupPlaceResults('시험아파트', [shop])).toEqual([{ title: '출입구·시설 등 다른 장소', items: [shop] }]);
    expect(groupPlaceResults('시험아파트', [])).toEqual([]);
  });
  it('respects a non-residential category and preserves exact non-apartment searches', () => {
    const unknown = place('시험아파트 분양홍보관');
    const store = place('시험아파트', '가정,생활 > 편의점');
    expect(groupPlaceResults('시험아파트', [unknown, store])[0].title).toBe('출입구·시설 등 다른 장소');
    const station = place('시험역', '교통,수송 > 기차역');
    const nearby = place('시험역아파트');
    expect(groupPlaceResults('시험역', [station, nearby])).toEqual([{ title: null, items: [station, nearby] }]);
  });
  it('checks the site and phase before recognizing a facility, even when similar facilities exist', () => {
    const query = '푸른마을 2차 상가동';
    const related = [place('푸른마을12차 상가동'), place('푸른마을2단지 상가동'), place('하늘마을2차 상가동')];
    const sections = groupPlaceResults(query, related);
    expect(visiblePlaceResults(sections, 1, '상가동').missingFacility).toBe(true);
    const exact = place('푸른마을 제2차 상가동');
    const withMatch = groupPlaceResults(query, [...related, exact, ...related, ...related, ...related]);
    expect(withMatch[0].items).toEqual([exact]);
    expect(visiblePlaceResults(withMatch, 2, '상가동').missingFacility).toBe(false);
    expect(visiblePlaceResults(groupPlaceResults(query, []), 1, '상가동').missingFacility).toBe(true);
  });
  it('distinguishes two hospitals with emergency rooms and a station from its parking lot', () => {
    const hospital = place('새빛대학병원 응급의료센터', '의료,건강 > 병원 > 응급실');
    const other = place('다른병원 응급의료센터', '의료,건강 > 병원 > 응급실');
    expect(groupPlaceResults('새빛대학병원 응급실', [other, hospital])[0].items).toEqual([hospital]);
    const parking = place('바다역 부설주차장', '교통시설 > 주차장');
    expect(groupPlaceResults('바다역 주차장', [place('바다역'), parking])[0].items).toEqual([parking]);
  });
});
