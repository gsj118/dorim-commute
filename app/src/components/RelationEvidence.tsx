import { useState } from 'react';
import { dataset } from '../data';
import { reasonLabels, type PendingRelation } from '../domain/recommend';

// The summary is always available; build the potentially long relation list only when opened.
export function RelationEvidence({ items, href }: {
  items: PendingRelation[]; href: (item: PendingRelation) => string;
}) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  return <details onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>현재 조건에서 제외·생략한 수록 지점 {items.length}개</summary>
    {open && <>
      <p>요일·시각·반경·표시 개수에 따라 달라집니다.</p>
      <ul>{items.map(item => <li key={item.occurrenceId}>
        <a href={href(item)}>{dataset.trips.find(trip => trip.tripId === item.tripId)?.displayName} · {dataset.stops.find(stop => stop.stopId === item.stopId)?.displayName}</a>: {item.reasons.filter(reason => reason !== 'WEEKDAY_UNVERIFIED').map(reason => reasonLabels[reason] || reason).join(' ')}
      </li>)}</ul>
    </>}
  </details>;
}
