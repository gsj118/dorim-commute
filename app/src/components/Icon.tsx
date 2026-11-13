export function Icon({ name, className = '' }: { name: 'bus' | 'arrow' | 'pin' | 'route' | 'info' | 'clock' | 'back' | 'external'; className?: string }) {
  const paths = {
    bus: <><rect x="5" y="3" width="14" height="16" rx="3"/><path d="M5 12h14M8 3v9m8-9v9M8 19v2m8-2v2"/><circle cx="8.5" cy="15.5" r=".5"/><circle cx="15.5" cy="15.5" r=".5"/></>,
    arrow: <path d="M4 12h15m-6-6 6 6-6 6"/>,
    back: <path d="M20 12H5m6-6-6 6 6 6"/>,
    pin: <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/></>,
    route: <><circle cx="6" cy="5" r="2"/><circle cx="18" cy="19" r="2"/><path d="M6 7v7a3 3 0 0 0 3 3h6M9 5h6a3 3 0 0 1 3 3v8"/></>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></>,
    external: <><path d="M14 3h7v7m0-7L10 14"/><path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/></>,
  };
  return <svg className={`icon ${className}`} aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
