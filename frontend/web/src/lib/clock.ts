// Locale-aware formatting for the ambient shell clock (Sidebar.tsx / Clock.tsx).
// he-IL only, native Intl via toLocaleDateString/toLocaleTimeString.
// Intl.RelativeTimeFormat is intentionally NOT used here — this codebase
// has been burned by it before.

const FULL_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
};

const COMPACT_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'numeric',
};

const TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
};

/**
 * Full date + time, e.g. "יום שלישי, 9 בספטמבר 2026 · 14:32".
 * Used in the desktop sidebar footer, where there is room for it.
 */
export function formatFullDateTime(date: Date): string {
  const day = date.toLocaleDateString('he-IL', FULL_DATE_OPTIONS);
  const time = date.toLocaleTimeString('he-IL', TIME_OPTIONS);
  return `${day} · ${time}`;
}

/**
 * Compact date + time, e.g. "9.9 · 14:32". Used in the slim mobile top
 * bar, which has no room for a weekday/month name without pushing the
 * hamburger button or the brand out of place.
 */
export function formatCompactDateTime(date: Date): string {
  const day = date.toLocaleDateString('he-IL', COMPACT_DATE_OPTIONS);
  const time = date.toLocaleTimeString('he-IL', TIME_OPTIONS);
  return `${day} · ${time}`;
}
