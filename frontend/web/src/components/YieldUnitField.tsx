import { useState } from 'react';
import { isCustomYieldUnit, t, yieldUnitPresets } from '@yevul/shared';

// בחירת יחידת יבול. הופיעה כשדה טקסט חופשי בשני מקומות (עריכת גידול
// ועדכון צפי), ולכן עברה לרכיב אחד, מקבילה ל-YieldUnitField של הנייד.
//
// כאן זה תפריט נפתח ולא שורת צ'יפים, לפי אותה הפרדה שכבר קיימת בין
// הלקוחות לשדות עם קבוצת ערכים סגורה (ראה roadmap.md, שלב 2): תפריט
// בווב, צ'יפים בנייד.
//
// **הצעות ולא רשימה סגורה.** העמודה במסד היא טקסט חופשי בכוונה, ולכן
// "אחר" תמיד זמין ופותח שדה הקלדה. ערך שנשמר לפני שההצעות היו קיימות,
// או יחידה חריגה, נפתח אוטומטית במצב "אחר" עם הערך בתוכו ולא נמחק.
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
  const presets = yieldUnitPresets();
  // מצב "אחר" נדבק ברגע שנבחר, גם כשהשדה עדיין ריק. בלי זה, בחירת
  // "אחר" הייתה קופצת חזרה כי ערך ריק לא נחשב מותאם.
  const [otherSticky, setOtherSticky] = useState(() => isCustomYieldUnit(value));
  const isOther = otherSticky || isCustomYieldUnit(value);

  function onSelect(next: string) {
    if (next === OTHER) {
      setOtherSticky(true);
      // ערך מותאם שכבר הוקלד נשאר, כדי שבחירת "אחר" לא תמחק אותו.
      if (!isCustomYieldUnit(value)) onChange('');
      return;
    }
    setOtherSticky(false);
    onChange(next);
  }

  return (
    <div className="form__row">
      <label className="form__label" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className="form__input"
        value={isOther ? OTHER : value}
        onChange={(e) => onSelect(e.target.value)}
        disabled={disabled}
      >
        {/* אפשרות ריקה ראשונה, כדי שלא תיבחר יחידה שהחקלאי לא ביקש
            רק בגלל שהיא הראשונה ברשימה. */}
        <option value="">{t('plots.crop.yieldUnitUnset')}</option>
        {presets.map((preset) => (
          <option key={preset} value={preset}>
            {preset}
          </option>
        ))}
        <option value={OTHER}>{t('common.other')}</option>
      </select>
      {isOther && (
        <input
          className="form__input"
          type="text"
          value={value}
          placeholder={t('plots.crop.yieldUnitPlaceholder')}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          autoFocus
        />
      )}
    </div>
  );
}

// ערך סנטינל ל-<option> של "אחר" בלבד. לא נשמר לעולם, הוא מוחלף בטקסט
// שהמשתמש מקליד. מסומן בתווים שלא יופיעו ביחידה אמיתית.
const OTHER = '__other__';
