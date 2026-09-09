import { parseYieldUnit, t, yieldUnitLabel, YIELD_UNITS } from '@yevul/shared';

// בחירת יחידה, גם ליבול וגם למחיר. משמש בעריכת החלקה ובעדכון הצפי,
// ומקביל ל-YieldUnitField של הנייד. תפריט נפתח בווב, צ'יפים בנייד,
// אותה הפרדה שכבר קיימת בין הלקוחות לשדות עם קבוצת ערכים סגורה.
//
// **שלוש יחידות בלבד: קילו, טון, יחידה. אין "אחר" ואין טקסט חופשי.**
// זו החלטת מוצר, והיא מה שמאפשר לאפליקציה להמיר בין יבול למחיר במקום
// להכפיל טונות בשקלים לקילו ולהציג את התוצאה בפנים ישרות. הרשימה
// הישנה כללה גם "ארגזים", שאינו משקל ואינו ספירה ולכן לא ניתן להמרה.
//
// **ערך ישן שאינו אחת מהשלוש נשמר ומוצג כאפשרות משלו**, ולא נמחק ולא
// מתורגם בכוח. שורה שנכתבה לפני השינוי עם "ארגזים" תמשיך להראות
// "ארגזים" עד שהחקלאי עצמו יבחר אחרת. ראה yieldUnits.ts, שמפרש את מה
// שניתן לפרש ומחזיר את השאר כמות שהוא.
export function YieldUnitField({
  id,
  label,
  value,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const canonical = parseYieldUnit(value);
  const trimmed = value.trim();
  // ערך שמור שאינו נפתר לאחת מהשלוש. נשמר כאפשרות כדי שרינדור הטופס
  // לבדו לא ידרוס אותו.
  const legacy = trimmed !== '' && canonical === null ? trimmed : null;

  return (
    <div className="form__row">
      <label className="form__label" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className="form__input"
        value={canonical ?? legacy ?? ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        {/* אפשרות ריקה ראשונה, כדי שלא תיבחר יחידה שהחקלאי לא ביקש רק
            בגלל שהיא הראשונה ברשימה. */}
        <option value="">{t('plots.crop.yieldUnitUnset')}</option>
        {YIELD_UNITS.map((unit) => (
          <option key={unit} value={unit}>
            {yieldUnitLabel(unit)}
          </option>
        ))}
        {legacy && <option value={legacy}>{legacy}</option>}
      </select>
    </div>
  );
}
