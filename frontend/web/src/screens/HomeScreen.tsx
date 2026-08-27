import { t } from '@yevul/shared';
import { supabase } from '../lib/supabase';
import { TaskBoard } from '../components/TaskBoard';

// מסך הבית. Live P&L Hero Card, Data Freshness Chip וכרטיסי חלקות
// נבנים בשלב 4, לפי הרודמאפ. לוח המשימות, כל המשק ולא חלקה בודדת
// (בלי plotId), הוא התוכן האמיתי הראשון כאן, יצא לקובץ משלו מ-
// WebScreens.tsx לפי אותה מוסכמה שכבר הוחלה על PlotsScreen.
export function HomeScreen() {
  return (
    <div className="screen">
      <h1 className="screen__title">{t('screen.home')}</h1>
      <TaskBoard supabase={supabase} showPlotName />
    </div>
  );
}
