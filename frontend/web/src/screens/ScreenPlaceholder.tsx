import { t } from '@yevul/shared';

// מעטפת זמנית למסכי השלד של הווב, מקבילה לזו שבנייד. כל מסך יחליף
// אותה בתוכן אמיתי כשהמשימה שלו מגיעה, ואז הרכיב הזה נמחק.
export function ScreenPlaceholder({ title }: { title: string }) {
  return (
    <div className="screen">
      <h1 className="screen__title">{title}</h1>
      <p className="screen__note">{t('screen.comingSoon')}</p>
    </div>
  );
}
