import { t } from '@yevul/shared';
import { supabase } from '../lib/supabase';
import { JournalList } from '../components/JournalList';

// היומן הכללי, design.md "Journal List". כל רשומות המשק, בלי סינון
// לפי חלקה. סינון עונה ופס קישור ליומן הריסוס (design.md) שייכים
// למשימת "מסך יומן ריסוס נפרד" הבאה ברודמאפ, לא נבנים כאן.
export function JournalScreen() {
  return (
    <div className="screen">
      <h1 className="screen__title">{t('screen.journal')}</h1>
      <JournalList supabase={supabase} showPlotName />
    </div>
  );
}
