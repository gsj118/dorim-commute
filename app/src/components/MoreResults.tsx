import { flushSync } from 'react-dom';

interface Props {
  label: string;
  unit: string;
  total: number;
  limit: number;
  step?: number;
  onChange: (limit: number) => void;
  listId: string;
  itemSelector: string;
}

export function MoreResults({ label, unit, total, limit, step, onChange, listId, itemSelector }: Props) {
  if (limit >= total) return null;
  function reveal() {
    const nextLimit = step === undefined ? total : Math.min(total, limit + step);
    flushSync(() => onChange(nextLimit));
    const firstNew = document.getElementById(listId)?.querySelectorAll<HTMLElement>(itemSelector)[limit];
    const target = firstNew?.matches('a,button') ? firstNew : firstNew?.querySelector<HTMLElement>('a,button');
    target?.focus();
  }
  return <button type="button" className="more-results" aria-controls={listId} onClick={reveal}>
    {step === undefined
      ? `나머지 ${label} ${total - limit}${unit} 모두 보기`
      : <>{label} 더 보기 <span>· {total - limit}{unit} 남음</span></>}
  </button>;
}
