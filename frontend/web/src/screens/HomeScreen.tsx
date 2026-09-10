import { resolveDisplayName, t } from '@yevul/shared';
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
// המספר נטען מחדש מאליו בכל חזרה לבית.
//
// **מתג "החלקות שלי" הוסר 2026-09-10 עם תכונת "אחראי חלקה" כולה.**
// הוא סינן לפי plots.responsible_user_id, ובלי תכונת האחראי אין לפי
// מה לסנן. ראה packages/shared/src/plots.ts, ההערה מעל השדה שנשאר
// במסד בלי קורא.
export function HomeScreen() {
  // שם התצוגה מ-user_metadata של הסשן. כשיש שם, הברכה מתאישית; כשאין,
  // נשארת הברכה הקצרה בלבד. הכלל עצמו חי ב-packages/shared.
  const { session } = useAuth();
  const name = resolveDisplayName(session?.user);

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
      <TaskBoard supabase={supabase} showPlotName />
    </div>
  );
}
