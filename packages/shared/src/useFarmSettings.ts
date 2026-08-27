import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { currentFarmQuery } from './currentFarm';
import { writeOutcome } from './postgrest';
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
  // שני מתגי Completion Prompts, design.md: "Both toggles live in
  // Settings and can be turned off independently."
  journalPromptEnabled: boolean;
  expensePromptEnabled: boolean;
};

// nameRequired הוא כלל נורמליזציה ולא הרשאה, ולכן הוא חי כאן ולא בשני
// המסכים. מי שיכתוב ל-farms.name בעתיד מקבל את החיתוך ואת הבדיקה בלי
// לזכור אותם, וזה בדיוק מה שקרה קודם, שני עותקים של אותו כלל.
export type SaveResult =
  { ok: true } | { ok: false; reason: 'forbidden' | 'nameRequired' | 'error' };

export type FarmSettingsState = {
  loading: boolean;
  loadFailed: boolean;
  form: FarmSettingsForm | null;
  save: (next: FarmSettingsForm) => Promise<SaveResult>;
};

type SettingsRow = {
  currency: Currency;
  area_unit: AreaUnit;
  locale: Locale;
  journal_prompt_enabled: boolean;
  expense_prompt_enabled: boolean;
};
type FarmWithSettings = { id: string; name: string; settings: SettingsRow | null };

export function useFarmSettings(supabase: SupabaseClient): FarmSettingsState {
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [farmId, setFarmId] = useState<string | null>(null);
  const [form, setForm] = useState<FarmSettingsForm | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      // כלל בחירת המשק חי ב-currentFarm.ts, לא כאן. השאילתה מבקשת את
      // settings משובץ פנימה, כך שזו בקשה אחת ולא שתיים: settings.farm_id
      // הוא מפתח ראשי שמצביע על farms(id), ו-PostgREST יודע לשבץ.
      const { data, error } = await currentFarmQuery(
        supabase,
        'id, name, settings(currency, area_unit, locale, journal_prompt_enabled, expense_prompt_enabled)',
      );

      if (!active) return;

      const farm = (data as FarmWithSettings[] | null)?.[0];
      const settings = farm?.settings;
      if (error || !farm || !settings) {
        setLoadFailed(true);
        setLoading(false);
        return;
      }

      setFarmId(farm.id);
      setForm({
        farmName: farm.name,
        currency: settings.currency,
        areaUnit: settings.area_unit,
        locale: settings.locale,
        journalPromptEnabled: settings.journal_prompt_enabled,
        expensePromptEnabled: settings.expense_prompt_enabled,
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

      const farmName = next.farmName.trim();
      if (farmName === '') return { ok: false, reason: 'nameRequired' };

      // שני העדכונים לא תלויים זה בזה, שניהם מפתח על farmId שכבר ידוע,
      // ולכן הם יוצאים במקביל ולא בטור. אותו מצב כשלון חלקי כמו קודם,
      // ראה docs/open-items.md, רק בסבב רשת אחד במקום שניים.
      const [farmWrite, settingsWrite] = await Promise.all([
        supabase.from('farms').update({ name: farmName }).eq('id', farmId).select('id'),
        supabase
          .from('settings')
          .update({
            currency: next.currency,
            area_unit: next.areaUnit,
            locale: next.locale,
            journal_prompt_enabled: next.journalPromptEnabled,
            expense_prompt_enabled: next.expensePromptEnabled,
          })
          .eq('farm_id', farmId)
          .select('farm_id'),
      ]);

      const farmOutcome = writeOutcome(farmWrite);
      if (!farmOutcome.ok) return farmOutcome;

      const settingsOutcome = writeOutcome(settingsWrite);
      if (!settingsOutcome.ok) return settingsOutcome;

      setForm({ ...next, farmName });
      return { ok: true };
    },
    [supabase, farmId],
  );

  return { loading, loadFailed, form, save };
}
