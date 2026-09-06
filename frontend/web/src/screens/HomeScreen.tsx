import { useState } from 'react';
import {
  assignableMembers,
  myPlotIds,
  myPlotsToggleVisible,
  resolveDisplayName,
  t,
  useMembers,
  usePlots,
} from '@yevul/shared';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
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
  // שם התצוגה מ-user_metadata של הסשן. כשיש שם, הברכה מתאישית; כשאין,
  // נשארת הברכה הקצרה בלבד. הכלל עצמו חי ב-packages/shared.
  const { session } = useAuth();
  const name = resolveDisplayName(session?.user);

  // רק חברים פעילים נספרים למתג, design.md: "more than one member".
  const toggleVisible = myPlotsToggleVisible(
    assignableMembers(membersState.members).length,
    plotsState.plots,
  );
  const mine = scope === 'mine';
  // undefined כשהמתג לא נראה או בתצוגת "הכל": TaskBoard מפרש undefined
  // כ"בלי סינון". הסינון עצמו טהור ב-myPlotIds/tasksOnPlots.
  const filteredPlotIds =
    toggleVisible && mine ? myPlotIds(plotsState.plots, membersState.currentUserId) : undefined;

  return (
    <div className="screen home">
      {/* באנר הגיבור, סבב העיצוב האקוורלי. הנוף והברכה במקום הכותרת
          השטוחה "בית", וכרטיס הרווח מתחתיו מרחף מעל שוליו התחתונים.
          התמונות הן רקע דקורטיבי (aria-hidden), הטקסט נושא את המשמעות. */}
      <header className="home-hero">
        <div className="home-hero__art" aria-hidden="true" />
        <div className="home-hero__sprig" aria-hidden="true" />
        <div className="home-hero__text">
          <h1 className="home-hero__greeting">
            {name ? `${t('home.greeting')}, ${name}` : t('home.greeting')}
          </h1>
          <p className="home-hero__subtitle">{t('home.greetingSub')}</p>
        </div>
      </header>
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
