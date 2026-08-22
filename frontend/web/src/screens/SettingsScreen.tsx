import { useEffect, useState, type FormEvent } from 'react';
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
  const [draft, setDraft] = useState<FarmSettingsForm | null>(null);
  const [status, setStatus] = useState<Status>('idle');

  useEffect(() => {
    if (form) setDraft(form);
  }, [form]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;

    if (draft.farmName.trim() === '') {
      setStatus('nameRequired');
      return;
    }

    setStatus('saving');
    const result = await save({ ...draft, farmName: draft.farmName.trim() });
    setStatus(result.ok ? 'saved' : result.reason === 'forbidden' ? 'forbidden' : 'error');
  }

  function update<K extends keyof FarmSettingsForm>(key: K, value: FarmSettingsForm[K]) {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
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

  if (loadFailed || !draft) {
    return (
      <div className="screen">
        <h1 className="screen__title">{t('screen.settings')}</h1>
        <p className="form__message form__message--bad">{t('settings.loadError')}</p>
      </div>
    );
  }

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
            value={draft.farmName}
            placeholder={t('settings.farmNamePlaceholder')}
            onChange={(e) => update('farmName', e.target.value)}
          />
        </div>

        <div className="form__row">
          <label className="form__label" htmlFor="currency">
            {t('settings.currency')}
          </label>
          <select
            id="currency"
            className="form__input"
            value={draft.currency}
            onChange={(e) => update('currency', e.target.value as Currency)}
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
            value={draft.areaUnit}
            onChange={(e) => update('areaUnit', e.target.value as AreaUnit)}
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
            value={draft.locale}
            onChange={(e) => update('locale', e.target.value as Locale)}
          >
            {LOCALES.map((value) => (
              <option key={value} value={value}>
                {t(localeLabelKey(value))}
              </option>
            ))}
          </select>
        </div>

        <div className="form__actions">
          <button type="submit" className="form__submit" disabled={status === 'saving'}>
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
