import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

// "על איזה משק אני מסתכל" הוא כלל אחד של המוצר, לא פרט של מסך.
// עד כאן הוא היה קבור בתוך useFarmSettings, ומסך החלקות בשלב 3 היה
// מעתיק אותו כדי לדעת לאיזה farm_id לכתוב. משם זה הופך לכלל שמפוזר
// בכל הוק נתונים, וכשמגיע ריבוי משקים בשלב 6 צריך למצוא את כל העותקים.
//
// RLS כבר מצמצם למשקים שהמשתמש חבר פעיל בהם, ולכן אין כאן סינון לפי
// user_id. הכלל הנוכחי הוא "המשק הראשון שנוצר שלא נמחק", כי בשלב הזה
// יש בדיוק אחד, שנוצר בטריגר ההרשמה. כשיהיה מעבר בין משקים, משנים כאן
// בלבד.

// בונה השאילתה ולא רק ההוק, כדי שקורא שצריך גם נתונים משובצים יוכל
// לבקש אותם באותו סבב רשת במקום לשאול פעמיים. useFarmSettings משתמש
// בזה כדי למשוך farms יחד עם settings בבקשה אחת.
export function currentFarmQuery(supabase: SupabaseClient, columns = 'id, name') {
  return supabase
    .from('farms')
    .select(columns)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1);
}

export type CurrentFarm = { id: string; name: string };

export type CurrentFarmState = {
  loading: boolean;
  failed: boolean;
  farm: CurrentFarm | null;
};

// להוק שצריך רק את המשק עצמו, בלי נתונים נלווים.
export function useCurrentFarm(supabase: SupabaseClient): CurrentFarmState {
  const [state, setState] = useState<CurrentFarmState>({
    loading: true,
    failed: false,
    farm: null,
  });

  useEffect(() => {
    let active = true;

    void currentFarmQuery(supabase).then(({ data, error }) => {
      if (!active) return;
      const farm = (data as CurrentFarm[] | null)?.[0];
      if (error || !farm) {
        setState({ loading: false, failed: true, farm: null });
        return;
      }
      setState({ loading: false, failed: false, farm });
    });

    return () => {
      active = false;
    };
  }, [supabase]);

  return state;
}
