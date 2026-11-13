import type { PlaceSelection } from './types';

export interface PlaceSection { title: string | null; items: PlaceSelection[]; numberedComplexes?: boolean }

const compact = (value: string) => value.replace(/\s+/g, '').toLowerCase();
const facilityEnding = /(정문|후문|출입구|입구|게이트\d*|상가동|상가|관리사무소|관리사무실|작은도서관|도서관|경로당|노인정|주차장|응급실)$/;
const entranceEnding = /(?:정문|후문|출입구|입구|게이트\d*)$/;
const phasePattern = /(?:(?<![가-힣])제\s*)?(\d+)\s*(단지|차)/g;
const phases = (value: string) => Array.from(value.matchAll(phasePattern), match => match[1] + match[2]);

export function withoutApartmentPhase(query: string) {
  if (!phases(query).length) return '';
  return query.replace(phasePattern, ' ').trim().replace(/\s+/g, ' ');
}

export function requestedFacility(query: string) {
  return compact(query).match(facilityEnding)?.[1];
}

function matchesPlaceSubject(subject: string, item: PlaceSelection) {
  const namedPhases = phases(item.name);
  if (!phases(subject).every(phase => namedPhases.includes(phase))) return false;
  const normalize = (value: string) => compact(value).replace(/대학교/g, '대');
  const name = normalize(item.name);
  const address = normalize(item.lotAddress || item.roadAddress || '');
  const words = subject.replace(phasePattern, ' ').trim().split(/\s+/).filter(Boolean);
  return words.every(word => name.includes(normalize(word)) || address.includes(normalize(word)));
}

export function isApartment(item: PlaceSelection) {
  const name = compact(item.name);
  if (facilityEnding.test(name)) return false;
  if (item.categoryName) return item.categoryName.split('>').at(-1)?.trim() === '아파트';
  return /아파트(?:제?\d+(?:단지|차))?$/.test(name);
}

function matchesFacility(item: PlaceSelection, term: string) {
  const name = compact(item.name);
  if (item.categoryName?.includes('부동산중개')) return false;
  switch (term) {
    case '상가': case '상가동':
      return /상가동?$/.test(name) || item.categoryName?.split('>').at(-1)?.trim() === '아파트상가';
    case '출입구': case '입구':
      return entranceEnding.test(name) || item.categoryName?.endsWith('입출구');
    case '게이트': return /게이트\d*$/.test(name);
    case '주차장': return name.endsWith(term) || item.categoryName?.split('>').some(part => part.trim() === term);
    case '응급실': return name.endsWith(term) || item.categoryName?.endsWith(term);
    case '관리사무소': case '관리사무실': return /관리사무(?:소|실)$/.test(name);
    case '경로당': case '노인정': return /(?:경로당|노인정)$/.test(name);
    default: return name.endsWith(term);
  }
}

export function groupPlaceResults(query: string, items: PlaceSelection[]): PlaceSection[] {
  const term = requestedFacility(query);
  const apartments = items.filter(isApartment);
  const phaseLabel = phases(query).join('·');
  if (!term && phaseLabel && (/단지|아파트/.test(query) || apartments.length > 0 || /차$/.test(query.trim()))) {
    const matched = items.filter(item => matchesPlaceSubject(query, item));
    const matchingIds = new Set(matched.map(item => item.selectionId));
    return [
      { title: `${phaseLabel} 아파트`, items: matched.filter(isApartment), numberedComplexes: true },
      { title: `이름에 ${phaseLabel}가 표시된 기타 장소`, items: matched.filter(item => !isApartment(item)) },
      { title: '그 밖의 관련 검색 결과', items: items.filter(item => !matchingIds.has(item.selectionId)) },
    ].filter(section => section.numberedComplexes || section.items.length > 0);
  }
  const words = query.trim().toLowerCase().split(/\s+/);
  const exactOther = items.some(item => compact(item.name) === compact(query) && !isApartment(item));
  const housingQuery = /아파트|단지/.test(query) || (!exactOther &&
    apartments.some(item => words.every(word => compact(item.name).includes(word))));
  if (!term && !housingQuery) return [{ title: null, items }];

  const subject = term ? query.trim().replace(new RegExp(term.split('').join('\\s*') + '$'), '') : query;
  const first = term ? items.filter(item => matchesFacility(item, term) && matchesPlaceSubject(subject, item)) : apartments;
  const prioritized = new Set(first);
  const related = term ? items.filter(item => !prioritized.has(item) && matchesFacility(item, term)) : [];
  for (const item of related) prioritized.add(item);
  return [
    { title: term || '아파트 단지', items: first },
    { title: `이름·위치를 확인할 ${term} 후보`, items: related },
    { title: term ? '다른 장소' : '출입구·시설 등 다른 장소', items: items.filter(item => !prioritized.has(item)) },
  ].filter(section => section.items.length > 0);
}

export function missingRequestedFacility(sections: PlaceSection[], facility?: string) {
  return !!facility && !sections.some(section => section.title === facility && section.items.length > 0);
}

export function visiblePlaceResults(sections: PlaceSection[], limit: number, facility?: string) {
  let count = 0;
  const visible: PlaceSection[] = [];
  for (const section of sections) {
    const items = section.items.slice(0, Math.max(0, limit - count));
    if (items.length) visible.push({ title: section.title, items });
    count += section.items.length;
  }
  return { sections: visible, count, missingFacility: missingRequestedFacility(sections, facility) };
}
