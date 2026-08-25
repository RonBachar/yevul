import { t } from '@yevul/shared';
import { ScreenPlaceholder } from './ScreenPlaceholder';

// יעדי הווב שעדיין ריקים בכוונה. הם מקובצים בקובץ אחד כל עוד כל אחד
// מהם הוא שורה אחת. ברגע שמסך מקבל תוכן אמיתי הוא יוצא לקובץ משלו,
// כמו שקרה לחלקות (PlotsScreen.tsx) במשימה הראשונה של שלב 3.

export function MoneyScreen() {
  return <ScreenPlaceholder title={t('screen.money')} />;
}

export function JournalScreen() {
  return <ScreenPlaceholder title={t('screen.journal')} />;
}

// SettingsScreen כבר איננו placeholder, הוא יצא לקובץ משלו.
