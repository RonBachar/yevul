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
  type FarmSettingsForm,
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

// טבלה אחת במקום ארבעה בלוקי JSX כמעט זהים. הוספת מצב היא שורה,
// ואי אפשר לשכוח בה את role הנכון.
const STATUS_MESSAGE: Partial<Record<Status, { key: string; tone: 'good' | 'bad' }>> = {
  saved: { key: 'settings.saved', tone: 'good' },
  forbidden: { key: 'settings.forbidden', tone: 'bad' },
  error: { key: 'settings.saveError', tone: 'bad' },
  nameRequired: { key: 'settings.nameRequired', tone: 'bad' },
};

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

    // בלי חיתוך ובלי בדיקת שם ריק כאן. שניהם חיים ב-save המשותף, כדי
    // שלא יהיו שני עותקים של אותו כלל בשני הלקוחות. המסך רק מדווח.
    setStatus('saving');
    const result = await save(current);
    // אחרי שמירה מוצלחת נוטשים את הטיוטה, כך ש-current נופל חזרה ל-form
    // שהוא הערך הסמכותי מהשרת. בלי זה, מאז שהחיתוך עבר ל-save המשותף,
    // השדה היה ממשיך להציג את הרווחים שהמשתמש הקליד בזמן שבמסד כבר
    // יושב השם החתוך.
    if (result.ok) setDraft(null);
    setStatus(result.ok ? 'saved' : result.reason);
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
  const message = STATUS_MESSAGE[status];

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

        <SelectField
          id="currency"
          label={t('settings.currency')}
          options={CURRENCIES}
          value={current.currency}
          labelKey={currencyLabelKey}
          onSelect={(value) => update('currency', value)}
          disabled={busy}
        />

        <SelectField
          id="area-unit"
          label={t('settings.areaUnit')}
          options={AREA_UNITS}
          value={current.areaUnit}
          labelKey={areaUnitLabelKey}
          onSelect={(value) => update('areaUnit', value)}
          disabled={busy}
        />

        <SelectField
          id="locale"
          label={t('settings.locale')}
          options={LOCALES}
          value={current.locale}
          labelKey={localeLabelKey}
          onSelect={(value) => update('locale', value)}
          disabled={busy}
        />

        <div className="form__actions">
          <button type="submit" className="form__submit" disabled={busy}>
            {status === 'saving' ? t('settings.saving') : t('settings.save')}
          </button>

          {message && (
            <p
              className={`form__message form__message--${message.tone}`}
              role={message.tone === 'good' ? 'status' : 'alert'}
            >
              {t(message.key)}
            </p>
          )}
        </div>
      </form>
    </div>
  );
}

// תפריט בחירה יחיד לכל שדה עם קבוצת ערכים סגורה, מקביל ל-ChipField
// שבלקוח הנייד. קודם היו כאן שלושה בלוקים כמעט זהים.
function SelectField<T extends string>({
  id,
  label,
  options,
  value,
  labelKey,
  onSelect,
  disabled,
}: {
  id: string;
  label: string;
  options: readonly T[];
  value: T;
  labelKey: (value: T) => string;
  onSelect: (value: T) => void;
  disabled: boolean;
}) {
  return (
    <div className="form__row">
      <label className="form__label" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className="form__input"
        value={value}
        onChange={(e) => onSelect(e.target.value as T)}
        disabled={disabled}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {t(labelKey(option))}
          </option>
        ))}
      </select>
    </div>
  );
}
