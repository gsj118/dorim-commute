import type { Ref } from 'react';
import type { PlaceSelection } from '../domain/types';
import { gwangjuDistrict, placeAreaLabel } from '../domain/placeRegion';
import { visiblePlaceResults, type PlaceSection } from '../domain/placeResults';
import { MoreResults } from './MoreResults';
import { Icon } from './Icon';

export const initialPicker = { district: '', category: '', limit: 3 };
export type PickerState = typeof initialPicker;

function categoryOf(place: PlaceSelection) {
  return place.categoryName?.split('>').at(-1)?.trim() || '';
}

function districtOf(place: PlaceSelection) {
  return gwangjuDistrict(place.lotAddress || place.roadAddress || '');
}

function optionCounts(items: PlaceSelection[], getValue: (item: PlaceSelection) => string) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const value = getValue(item);
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Array.from(counts);
}

function addressLine(area: string, address: string) {
  // In Gwangju the area label already names the district and, for lots, the neighborhood.
  if (!area || !gwangjuDistrict(address)) return address;
  const parts = address.split(/\s+/).slice(2);
  if (area.endsWith(' · ' + parts[0])) parts.shift();
  return parts.join(' ');
}

interface Props {
  summaryRef: Ref<HTMLElement>;
  sections: PlaceSection[];
  query: string;
  scope: string;
  nationwide: boolean;
  showDistricts: boolean;
  selected: PlaceSelection | null;
  filters: PickerState;
  onFilterChange: (next: PickerState) => void;
  onSelect: (place: PlaceSelection) => void;
}

export function PlacePicker({ summaryRef, sections, query, scope, nationwide, showDistricts, selected, filters, onFilterChange, onSelect }: Props) {
  const { district, category, limit } = filters;
  const items = sections.flatMap(section => section.items);
  const districts = showDistricts ? optionCounts(items, districtOf).sort(([a], [b]) => a.localeCompare(b, 'ko')) : [];
  const districtItems = district ? items.filter(item => districtOf(item) === district) : items;
  const categories = optionCounts(districtItems, categoryOf).sort(([a, n], [b, m]) => m - n || a.localeCompare(b, 'ko'));
  const filtered = sections.map(section => ({ ...section, items: section.items.filter(item =>
    (!district || districtOf(item) === district) && (!category || categoryOf(item) === category)
  ) })).filter(section => section.items.length);
  const visibleLimit = district || category ? items.length : limit;
  const page = visiblePlaceResults(filtered, visibleLimit);

  return <details className="place-choice" open={!selected}>
    <summary ref={summaryRef}>{selected ? '검색한 장소 목록 · 선택 변경' : `‘${query.trim()}’ ${scope} 검색 결과 · ${items.length}곳`}</summary>
    {(districts.length > 1 || categories.length > 1) && <div className="place-filters">
      {districts.length > 1 && <label>지역<select value={district} data-filtered={!!district} aria-label="검색 결과 내 지역" onChange={event => {
        const next = event.target.value;
        const keepCategory = items.some(item => (!next || districtOf(item) === next) && categoryOf(item) === category);
        onFilterChange({ district: next, category: keepCategory ? category : '', limit: initialPicker.limit });
      }}><option value="">전체 지역</option>{districts.map(([value, count]) => <option key={value} value={value}>{value} ({count})</option>)}</select></label>}
      {(categories.length > 1 || category) && <label>장소 종류<select value={category} data-filtered={!!category} aria-label="검색 결과 내 장소 종류" onChange={event => {
        onFilterChange({ district, category: event.target.value, limit: initialPicker.limit });
      }}><option value="">모든 종류</option>{categories.map(([value, count]) => <option key={value} value={value}>{value} ({count})</option>)}</select></label>}
    </div>}
    {(district || category) && <p className="place-filter-status" role="status">{[district, category].filter(Boolean).join(' · ')} 검색 결과 {page.count}곳</p>}
    <div id="place-result-list">{page.sections.map(section => <div className="place-result-group" key={section.title || 'places'}>
      {section.title && (!category || filtered.length > 1) && <h3>{section.title} <small>· {filtered.find(group => group.title === section.title)?.items.length}곳</small></h3>}
      <ul className="place-results" aria-label={section.title || undefined}>{section.items.map(item => {
        const area = placeAreaLabel(item, nationwide);
        const address = item.roadAddress || item.lotAddress || '주소 미제공';
        const localAddress = addressLine(area, address);
        const kind = categoryOf(item);
        return <li key={item.selectionId}><button aria-pressed={selected?.selectionId === item.selectionId} onClick={() => onSelect(item)}>
          <span className="place-result-title"><strong className="place-name">{item.name}</strong>{kind && kind !== category && <small>{kind}</small>}</span>
          <span className="place-address">{area && <span className="place-area">{area}</span>}{localAddress && <span className="place-street">{localAddress}</span>}</span>
          <Icon name="arrow" className="place-open"/>
        </button></li>;
      })}</ul></div>)}</div>
    <MoreResults label="장소" unit="곳" total={page.count} limit={visibleLimit} onChange={limit => onFilterChange({ ...filters, limit })} listId="place-result-list" itemSelector=".place-results button"/>
  </details>;
}
