import { t } from '@yevul/shared';
import { ScreenPlaceholder } from './ScreenPlaceholder';

// חמשת יעדי הווב, ריקים בכוונה בשלב הזה. הם מקובצים בקובץ אחד כל עוד
// כל אחד מהם הוא שורה אחת. ברגע שמסך מקבל תוכן אמיתי הוא יוצא לקובץ
// משלו, כמו שקורה לחלקות במשימה הראשונה של שלב 3.

export function HomeScreen() {
  return <ScreenPlaceholder title={t('screen.home')} />;
}

export function PlotsScreen() {
  return <ScreenPlaceholder title={t('screen.plots')} />;
}

export function MoneyScreen() {
  return <ScreenPlaceholder title={t('screen.money')} />;
}

export function JournalScreen() {
  return <ScreenPlaceholder title={t('screen.journal')} />;
}

// SettingsScreen כבר איננו placeholder, הוא יצא לקובץ משלו.
