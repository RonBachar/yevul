import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AreaUnit, Currency, Locale } from './settings';

// טעינה ושמירה של הגדרות המשק, משותף לנייד ולווב, באותו דפוס שבו
// useAuthSession כבר משותף. הלקוח מקבל את ה-client כפרמטר ולא מייבא
// אותו, כדי שהקוד יישאר חסר תלות בסביבה.
//
// **הסיבה שזה משותף ולא משוכפל בשני הלקוחות** אינה חיסכון בשורות. זה
// הטיפול בדחייה של RLS: כשהשרת מסרב לעדכן, PostgREST לא מחזיר שגיאה,
// הוא מחזיר הצלחה עם אפס שורות. לוגיקה שקל לשכוח בעותק אחד מתוך שניים,
// והתוצאה תהיה מסך שאומר "נשמר" בזמן שכלום לא נשמר. מקום אחד, כלל אחד.
//
// הלקוח לא מחליט מי מורשה לערוך. RLS מתיר עריכה ל-owner ול-manager
// בלבד, וכאן רק מדווחים על מה שהשרת החליט.

export type FarmSettingsForm = {
  farmName: string;
  currency: Currency;
  areaUnit: AreaUnit;
  locale: Locale;
};

export type SaveResult = { ok: true } | { ok: false; reason: 'forbidden' | 'error' };

export type FarmSettingsState = {
  loading: boolean;
  loadFailed: boolean;
  form: FarmSettingsForm | null;
  save: (next: FarmSettingsForm) => Promise<SaveResult>;
};

type FarmRow = { id: string; name: string };
type SettingsRow = { currency: Currency; area_unit: AreaUnit; locale: Locale };

export function useFarmSettings(supabase: SupabaseClient): FarmSettingsState {
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [farmId, setFarmId] = useState<string | null>(null);
  const [form, setForm] = useState<FarmSettingsForm | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      // RLS כבר מצמצם ל-משקים שהמשתמש חבר פעיל בהם, ולכן אין כאן סינון
      // לפי user_id. בשלב הזה למשתמש יש משק אחד, שנוצר בטריגר ההרשמה.
      // מעבר בין כמה משקים שייך לשלב 6, שיתוף המשק.
      const { data: farms, error: farmError } = await supabase
        .from('farms')
        .select('id, name')
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
        .limit(1);

      const farm = (farms as FarmRow[] | null)?.[0];
      if (farmError || !farm) {
        if (active) {
          setLoadFailed(true);
          setLoading(false);
        }
        return;
      }

      const { data: settings, error: settingsError } = await supabase
        .from('settings')
        .select('currency, area_unit, locale')
        .eq('farm_id', farm.id)
        .maybeSingle();

      if (!active) return;

      if (settingsError || !settings) {
        setLoadFailed(true);
        setLoading(false);
        return;
      }

      const row = settings as SettingsRow;
      setFarmId(farm.id);
      setForm({
        farmName: farm.name,
        currency: row.currency,
        areaUnit: row.area_unit,
        locale: row.locale,
      });
      setLoading(false);
    }

    void load();
    return () => {
      active = false;
    };
  }, [supabase]);

  const save = useCallback(
    async (next: FarmSettingsForm): Promise<SaveResult> => {
      if (!farmId) return { ok: false, reason: 'error' };

      // select() אחרי update מחזיר את השורות שבאמת עודכנו. מערך ריק
      // פירושו ש-RLS חסם, כי PostgREST לא מחזיר שגיאה על אפס התאמות.
      const farmUpdate = await supabase
        .from('farms')
        .update({ name: next.farmName })
        .eq('id', farmId)
        .select('id');

      if (farmUpdate.error) return { ok: false, reason: 'error' };
      if (!farmUpdate.data || farmUpdate.data.length === 0) {
        return { ok: false, reason: 'forbidden' };
      }

      const settingsUpdate = await supabase
        .from('settings')
        .update({
          currency: next.currency,
          area_unit: next.areaUnit,
          locale: next.locale,
        })
        .eq('farm_id', farmId)
        .select('farm_id');

      if (settingsUpdate.error) return { ok: false, reason: 'error' };
      if (!settingsUpdate.data || settingsUpdate.data.length === 0) {
        return { ok: false, reason: 'forbidden' };
      }

      setForm(next);
      return { ok: true };
    },
    [supabase, farmId],
  );

  return { loading, loadFailed, form, save };
}
