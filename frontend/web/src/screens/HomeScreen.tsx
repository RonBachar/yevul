import { useState } from 'react';
import { myPlotIds, myPlotsToggleVisible, t, useMembers, usePlots } from '@yevul/shared';
import { supabase } from '../lib/supabase';
import { TaskBoard } from '../components/TaskBoard';
import { ProfitHeroCard } from '../components/ProfitHeroCard';
import './HomeScreen.css';

// מסך הבית. Live P&L Hero Card נבנה בשלב 4 ויושב בראש, לפי design.md,
// "The first thing the farmer sees on opening the app". לוח המשימות
// יורד מתחתיו, ולפי המסמך הוא דייר במסך הזה ולא בעליו.
//
// בווב מעבר בין מסכים מבצע mount מחדש דרך React Router, ולכן
// המספר נטען מחדש מאליו בכל חזרה לבית. אותו mount מחדש הוא גם מה
// שמחזיר את מתג החלקות ל"הכל" בכל כניסה, בהתאם ל-design.md.
export function HomeScreen() {
  // מתג "החלקות שלי", design.md, "My Plots" Toggle. state בלבד, לא
  // נשמר, וברירת המחדל "הכל" חוזרת בכל mount. הרשימות נטענות כאן רק
  // כדי להכריע אם המתג נראה ומה קבוצת החלקות שלי; שאר הנתונים נשארים
  // בידי ProfitHeroCard וה-TaskBoard.
  const membersState = useMembers(supabase);
  const plotsState = usePlots(supabase);
  const [scope, setScope] = useState<'all' | 'mine'>('all');

  const toggleVisible = myPlotsToggleVisible(membersState.members.length, plotsState.plots);
  const mine = scope === 'mine';
  // undefined כשהמתג לא נראה או בתצוגת "הכל": TaskBoard מפרש undefined
  // כ"בלי סינון". הסינון עצמו טהור ב-myPlotIds/tasksOnPlots.
  const filteredPlotIds =
    toggleVisible && mine ? myPlotIds(plotsState.plots, membersState.currentUserId) : undefined;

  return (
    <div className="screen">
      <h1 className="screen__title">{t('screen.home')}</h1>
      <ProfitHeroCard />
      {/* הכרטיס למעלה הוא צפי כלל-משקי ואינו מסונן; המתג יושב מתחתיו
          ושולט במה שאפשר לסנן, לוח המשימות. design.md: "It filters plot
          cards and the task board together." */}
      {toggleVisible && (
        <div className="my-plots" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={!mine}
            className={mine ? 'my-plots__item' : 'my-plots__item my-plots__item--active'}
            onClick={() => setScope('all')}
          >
            {t('home.myPlots.all')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mine}
            className={mine ? 'my-plots__item my-plots__item--active' : 'my-plots__item'}
            onClick={() => setScope('mine')}
          >
            {t('home.myPlots.mine')}
          </button>
        </div>
      )}
      <TaskBoard supabase={supabase} plotIds={filteredPlotIds} showPlotName />
    </div>
  );
}
