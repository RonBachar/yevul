import { useEffect, useState } from 'react';
import { formatCompactDateTime, formatFullDateTime } from '../lib/clock';

// Ambient date/time, rendered once inside the shell chrome (Sidebar.tsx)
// so every routed screen gets it for free without touching screens/.
//
// Ticks on its own local state, so only this small <span> re-renders
// every interval — the sidebar list, the routed Outlet content and the
// rest of the shell are untouched by the tick. Interval is cleared on
// unmount.
const TICK_MS = 30_000;

export function Clock({ variant }: { variant: 'full' | 'compact' }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const text = variant === 'full' ? formatFullDateTime(now) : formatCompactDateTime(now);
  const className = variant === 'full' ? 'shell-clock sidebar__clock' : 'shell-clock shell-topbar__clock';

  return <span className={className}>{text}</span>;
}
