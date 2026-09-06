import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { SprayCan } from 'lucide-react';
import {
  AREA_UNITS,
  CURRENCIES,
  LOCALES,
  areaUnitLabelKey,
  currencyLabelKey,
  localeLabelKey,
  resolveDisplayName,
  t,
  updateDisplayName,
  useFarmSettings,
  type FarmSettingsForm,
} from '@yevul/shared';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { MembersSection } from '../components/MembersSection';
import '../styles/form.css';
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

      {/* design.md, Spray Log Screen: "an entry under עוד". בווב אין
          "עוד", ולכן זו נקודת הכניסה המקבילה, לצד היומן ופרטי חלקה. */}
      <Link className="settings__spray-log-link" to="/spray-log">
        <SprayCan size={20} strokeWidth={2} aria-hidden="true" />
        <span>{t('sprayLog.title')}</span>
      </Link>

      {/* שם התצוגה יושב ב-user_metadata ולא בהגדרות המשק, ולכן טופס
          נפרד עם שמירה משלו ולא חלק מ-useFarmSettings. */}
      <DisplayNameForm />

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

        {/* Completion Prompts, design.md: "Both toggles live in
            Settings and can be turned off independently." */}
        <ToggleField
          id="journal-prompt"
          label={t('settings.journalPrompt')}
          checked={current.journalPromptEnabled}
          onChange={(value) => update('journalPromptEnabled', value)}
          disabled={busy}
        />
        <ToggleField
          id="expense-prompt"
          label={t('settings.expensePrompt')}
          checked={current.expensePromptEnabled}
          onChange={(value) => update('expensePromptEnabled', value)}
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

      {/* שיתוף המשק, שלב 6. ניהול פתוח לבעלים בלבד, האכיפה במסד. */}
      <MembersSection />
    </div>
  );
}

// שם התצוגה של המשתמש. טופס עצמאי כי המקור שונה מהגדרות המשק: הערך
// חי ב-user_metadata של Auth ולא בטבלת settings, והכתיבה עוברת דרך
// updateDisplayName ולא דרך save של useFarmSettings. אותו דפוס טיוטה
// כמו במסך המשק: draft הוא null עד שנוגעים, וההצגה נופלת חזרה לשם
// השמור, כך שעדכון הסשן אחרי שמירה משתקף מאליו.
function DisplayNameForm() {
  const { session } = useAuth();
  const savedName = resolveDisplayName(session?.user) ?? '';
  const [draft, setDraft] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const value = draft ?? savedName;
  const busy = status === 'saving';

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setStatus('saving');
    const result = await updateDisplayName(supabase, value);
    if (result.ok) setDraft(null);
    setStatus(result.ok ? 'saved' : 'error');
  }

  return (
    <form className="form" onSubmit={onSubmit} noValidate>
      <div className="form__row">
        <label className="form__label" htmlFor="display-name">
          {t('settings.displayName')}
        </label>
        <input
          id="display-name"
          className="form__input"
          type="text"
          value={value}
          placeholder={t('settings.displayNamePlaceholder')}
          onChange={(e) => {
            setDraft(e.target.value);
            setStatus('idle');
          }}
          disabled={busy}
        />
      </div>
      <div className="form__actions">
        <button type="submit" className="form__submit" disabled={busy}>
          {busy ? t('settings.saving') : t('settings.save')}
        </button>
        {status === 'saved' && (
          <p className="form__message form__message--good" role="status">
            {t('settings.saved')}
          </p>
        )}
        {status === 'error' && (
          <p className="form__message form__message--bad" role="alert">
            {t('settings.saveError')}
          </p>
        )}
      </div>
    </form>
  );
}

// שדה בוליאני, לשני מתגי Completion Prompts. checkbox הוא הביטוי
// הטבעי של בוליאן בפלטפורמה, בניגוד לשדות הבחירה הסגורים למעלה שיש
// בהם כמה אפשרויות ומקבלים select.
function ToggleField({
  id,
  label,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled: boolean;
}) {
  return (
    <div className="form__row form__row--toggle">
      <label className="form__label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
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
