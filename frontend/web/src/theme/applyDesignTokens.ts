import {
  colors,
  fontSize,
  fontWeight,
  radius,
  shadowFloat,
  spacing,
  touchTarget,
} from '@yevul/shared';

// מזריק את כל טוקני העיצוב מ-packages/shared כמשתני CSS על השורש, לפני
// הרינדור הראשון, כדי ש-tokens.css לא יחזיק עותק ידני שיכול להתפצל
// מהנייד. עד ביקורת הארכיטקטורה של שלב 2 רק הצבעים הוזרקו כך,
// והמרווחים, הרדיוסים והטיפוגרפיה היו כתובים פעמיים וכבר נפרדו בפועל.
//
// הערכים ב-shared הם מספרים בלי יחידות, כי React Native צורך אותם כך.
// ההמרה ל-px קורית כאן, בצד שצריך יחידות.

const colorVar: Record<keyof typeof colors, string> = {
  field700: '--color-field-700',
  field500: '--color-field-500',
  field300: '--color-field-300',
  field100: '--color-field-100',
  profit600: '--color-profit-600',
  loss600: '--color-loss-600',
  loss100: '--color-loss-100',
  wheat800: '--color-wheat-800',
  wheat500: '--color-wheat-500',
  wheat100: '--color-wheat-100',
  sky500: '--color-sky-500',
  ink900: '--color-ink-900',
  slate600: '--color-slate-600',
  mist200: '--color-mist-200',
  mist100: '--color-mist-100',
  border200: '--color-border-200',
  paper: '--color-paper',
};

// s4 -> --spacing-4
const spacingVar = (key: string) => `--spacing-${key.replace(/^s/, '')}`;

// bodySm -> --text-body-sm
const textVar = (key: string) => `--text-${key.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()}`;

export function applyDesignTokens(): void {
  const root = document.documentElement;

  for (const [key, value] of Object.entries(colors)) {
    root.style.setProperty(colorVar[key as keyof typeof colors], value);
  }

  for (const [key, value] of Object.entries(spacing)) {
    root.style.setProperty(spacingVar(key), `${value}px`);
  }

  for (const [key, value] of Object.entries(radius)) {
    root.style.setProperty(`--radius-${key}`, `${value}px`);
  }

  for (const [key, value] of Object.entries(fontSize)) {
    root.style.setProperty(textVar(key), `${value}px`);
  }

  for (const [key, value] of Object.entries(touchTarget)) {
    root.style.setProperty(`--touch-${key}`, `${value}px`);
  }

  // בלי יחידה, font-weight הוא מספר טהור.
  for (const [key, value] of Object.entries(fontWeight)) {
    root.style.setProperty(`--font-weight-${key}`, String(value));
  }

  // design.md, Elevation. הצל נשמר בשדות נפרדים ב-shared כי RN דורש
  // אותם כך, וכאן הם מורכבים למחרוזת CSS אחת. בלי זה האלמנט המרחף
  // הראשון בווב היה כותב box-shadow ידני ופותח מחדש בדיוק את הפיצול
  // שהטוקן נועד לסגור.
  const { offsetY, blur, colorHex, opacity } = shadowFloat;
  const r = parseInt(colorHex.slice(1, 3), 16);
  const g = parseInt(colorHex.slice(3, 5), 16);
  const b = parseInt(colorHex.slice(5, 7), 16);
  root.style.setProperty(
    '--shadow-float',
    `0 ${offsetY}px ${blur}px rgba(${r}, ${g}, ${b}, ${opacity})`,
  );
}
