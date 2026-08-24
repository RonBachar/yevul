import { useState, type FormEvent } from 'react';
import {
  AREA_UNITS,
  CURRENCIES,
  LOCALES,
  areaUnitLabelKey,
  currencyLabelKey,
  localeLabelKey,
  t,
  useFarmSettings,
  type AreaUnit,
  type Currency,
  type FarmSettingsForm,
  type Locale,
} from '@yevul/shared';
import { supabase } from '../lib/supabase';
import './SettingsScreen.css';

// מסך ההגדרות של המשק. המסך הראשון שקורא וכותב נתונים אמיתיים, ולכן
// גם הראשון שנוגע ב-RLS בפועל מהקליינט.
//
// אין כאן שום בדיקת הרשאה. RLS מתיר עריכה ל-owner ול-manager בלבד,
// ואם השרת מסרב, useFarmSettings מחזיר forbidden והמסך רק מדווח.
// ולידציה מקומית מוגבלת לחוויית משתמש, שדה ריק לפני שליחה, ותו לא.
type Status = 'idle' | 'saving' | 'saved' | 'forbidden' | 'error' | 'nameRequired';

export function SettingsScreen() {
  const { loading, loadFailed, form, save } = useFarmSettings(supabase);
  // draft מחזיק רק את מה שהמשתמש שינה בפועל. כל עוד לא נגע בכלום הוא
  // null, והמסך מציג את מה שנטען מהשרת. **בכוונה בלי useEffect שמסנכרן
  // draft מ-form.** סנכרון כזה גרם לשני באגים שנמצאו בקוד ריוויו:
  // הוא דרס עריכה שנעשתה בזמן שהשמירה באוויר, ובנוסף draft היה null
  // ברינדור הראשון שבו הנתונים כבר הגיעו, מה שהדליק את מסך השגיאה
  // למשך פריים אחד בכל טעינה מוצלחת.
  const [draft, setDraft] = useState<FarmSettingsForm | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const current = draft ?? form;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!current) return;

    if (current.farmName.trim() === '') {
      setStatus('nameRequired');
      return;
    }

    setStatus('saving');
    const result = await save({ ...current, farmName: current.farmName.trim() });
    setStatus(result.ok ? 'saved' : result.reason === 'forbidden' ? 'forbidden' : 'error');
  }

  function update<K extends keyof FarmSettingsForm>(key: K, value: FarmSettingsForm[K]) {
    if (!current) return;
    setDraft({ ...current, [key]: value });
    setStatus('idle');
  }

  if (loading) {
    return (
      <div className="screen">
        <h1 className="screen__title">{t('screen.settings')}</h1>
        <p className="screen__note">{t('common.loading')}</p>
      </div>
    );
  }

  if (loadFailed || !current) {
    return (
      <div className="screen">
        <h1 className="screen__title">{t('screen.settings')}</h1>
        <p className="form__message form__message--bad">{t('settings.loadError')}</p>
      </div>
    );
  }

  // השדות ננעלים בזמן שמירה. בלי זה אפשר להקליד בזמן שהבקשה באוויר,
  // ואז ההודעה "נשמר" מתייחסת לערכים ישנים יותר ממה שמוצג על המסך.
  const busy = status === 'saving';

  return (
    <div className="screen">
      <h1 className="screen__title">{t('screen.settings')}</h1>

      <form className="form" onSubmit={onSubmit} noValidate>
        <div className="form__row">
          <label className="form__label" htmlFor="farm-name">
            {t('settings.farmName')}
          </label>
          <input
            id="farm-name"
            className="form__input"
            type="text"
            value={current.farmName}
            placeholder={t('settings.farmNamePlaceholder')}
            onChange={(e) => update('farmName', e.target.value)}
            disabled={busy}
          />
        </div>

        <div className="form__row">
          <label className="form__label" htmlFor="currency">
            {t('settings.currency')}
          </label>
          <select
            id="currency"
            className="form__input"
            value={current.currency}
            onChange={(e) => update('currency', e.target.value as Currency)}
            disabled={busy}
          >
            {CURRENCIES.map((value) => (
              <option key={value} value={value}>
                {t(currencyLabelKey(value))}
              </option>
            ))}
          </select>
        </div>

        <div className="form__row">
          <label className="form__label" htmlFor="area-unit">
            {t('settings.areaUnit')}
          </label>
          <select
            id="area-unit"
            className="form__input"
            value={current.areaUnit}
            onChange={(e) => update('areaUnit', e.target.value as AreaUnit)}
            disabled={busy}
          >
            {AREA_UNITS.map((value) => (
              <option key={value} value={value}>
                {t(areaUnitLabelKey(value))}
              </option>
            ))}
          </select>
        </div>

        <div className="form__row">
          <label className="form__label" htmlFor="locale">
            {t('settings.locale')}
          </label>
          <select
            id="locale"
            className="form__input"
            value={current.locale}
            onChange={(e) => update('locale', e.target.value as Locale)}
            disabled={busy}
          >
            {LOCALES.map((value) => (
              <option key={value} value={value}>
                {t(localeLabelKey(value))}
              </option>
            ))}
          </select>
        </div>

        <div className="form__actions">
          <button type="submit" className="form__submit" disabled={busy}>
            {status === 'saving' ? t('settings.saving') : t('settings.save')}
          </button>

          {status === 'saved' && (
            <p className="form__message form__message--good" role="status">
              {t('settings.saved')}
            </p>
          )}
          {status === 'forbidden' && (
            <p className="form__message form__message--bad" role="alert">
              {t('settings.forbidden')}
            </p>
          )}
          {status === 'error' && (
            <p className="form__message form__message--bad" role="alert">
              {t('settings.saveError')}
            </p>
          )}
          {status === 'nameRequired' && (
            <p className="form__message form__message--bad" role="alert">
              {t('settings.nameRequired')}
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
