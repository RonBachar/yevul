import { t } from '@yevul/shared';
import { supabase } from '../lib/supabase';
import { TaskBoard } from '../components/TaskBoard';
import { ProfitHeroCard } from '../components/ProfitHeroCard';

// מסך הבית. Live P&L Hero Card נבנה בשלב 4 ויושב בראש, לפי design.md,
// "The first thing the farmer sees on opening the app". לוח המשימות
// יורד מתחתיו, ולפי המסמך הוא דייר במסך הזה ולא בעליו.
//
// Data Freshness Chip הוא עדיין משימה פתוחה בשלב 4, ראה docs/roadmap.md.
export function HomeScreen() {
  return (
    <div className="screen">
      <h1 className="screen__title">{t('screen.home')}</h1>
      <ProfitHeroCard />
      <TaskBoard supabase={supabase} showPlotName />
    </div>
  );
}
