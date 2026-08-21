import { colors } from '@yevul/shared';

const cssVarName: Record<keyof typeof colors, string> = {
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

// מזריק את טוקני הצבע היחידים מ-packages/shared כמשתני CSS על השורש,
// לפני הרינדור הראשון, כדי ש-tokens.css לא יחזיק עותק ידני נפרד של
// הפלטה שיכול להתפצל מהנייד (ראה גם frontend/mobile/src/theme/tokens.ts).
export function applyColorTokens(): void {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(colors)) {
    root.style.setProperty(cssVarName[key as keyof typeof colors], value);
  }
}
