/**
 * מחשב את תאריך הקטיף הבטוח מתוך תאריך ריסוס ומספר ימי המתנה (PHI).
 *
 * נגזר בזמן קריאה, לעולם לא נשמר בטבלה, ראה docs/prd.md נספח א.3 וסעיף
 * a.4. זהו החישוב הרגולטורי הקריטי ביותר באפליקציה, לכן הוא יושב
 * במקום אחד משותף לשלושת הלקוחות.
 *
 * החישוב הוא בימים קלנדריים בלבד. כדי להימנע משגיאות off-by-one שנובעות
 * מאזור זמן, כל האריתמטיקה נעשית ב-UTC על החלק התאריכי בלבד (YYYY-MM-DD),
 * בלי רכיב שעה.
 *
 * @param sprayDate תאריך הריסוס, מחרוזת בפורמט YYYY-MM-DD (כפי ש-Postgres
 *   מחזיר עמודת date) או אובייקט Date.
 * @param phiDays ימי ההמתנה עד קטיף בטוח. null או undefined כשאין נתון
 *   (רשומה שאינה ריסוס, או ריסוס בלי PHI ידוע).
 * @returns תאריך הקטיף הבטוח כמחרוזת YYYY-MM-DD, או null כשאי אפשר לגזור.
 */
export function safeHarvestDate(
  sprayDate: string | Date,
  phiDays: number | null | undefined,
): string | null {
  if (phiDays === null || phiDays === undefined || !Number.isFinite(phiDays)) {
    return null;
  }

  const base = toUtcDateOnly(sprayDate);
  if (base === null) {
    return null;
  }

  base.setUTCDate(base.getUTCDate() + Math.trunc(phiDays));
  return formatUtcDateOnly(base);
}

/**
 * תאריך הקטיף הבטוח **הפעיל** של חלקה, מתוך רשומות הריסוס שלה.
 *
 * design.md, Plot Detail Screen, טאב צפי הכנסה: "When the plot has an
 * open spray record with `phi_days` set, a Field-100 'בטוח לקטיף מ-…'
 * chip renders here too."
 *
 * "ריסוס פתוח" הוא ריסוס שתאריך הקטיף הבטוח שלו עדיין לא הגיע. כשיש
 * כמה כאלה, המחמיר שבהם (המאוחר ביותר) הוא הקובע, כי קטיף לפניו אינו
 * בטוח גם אם ריסוס אחר כבר פג. זהו חישוב רגולטורי, ולכן הכלל הוא
 * המחמיר ולא הראשון שנמצא.
 *
 * רשומה בלי PHI, או כזו שתאריכה פגום, פשוט אינה משתתפת. היא אינה
 * הופכת את החלקה לבטוחה ואינה חוסמת אותה, אין עליה מידע.
 *
 * now מוזרק ולא נלקח מ-Date.now, כדי שהפונקציה תישאר טהורה ובדיקה.
 *
 * @param entries רשומות ריסוס של החלקה, כל אחת עם תאריך ו-PHI.
 * @param now הרגע שביחס אליו נקבע "עדיין לא הגיע".
 * @returns YYYY-MM-DD של הקטיף הבטוח המאוחר ביותר שטרם הגיע, או null.
 */
export function openSafeHarvestDate(
  entries: { date: string; sprayPhiDays: number | null }[],
  now: Date,
): string | null {
  const today = formatUtcDateOnly(
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
  );

  let latest: string | null = null;
  for (const entry of entries) {
    const safe = safeHarvestDate(entry.date, entry.sprayPhiDays);
    // השוואת מחרוזות YYYY-MM-DD היא השוואה כרונולוגית תקפה, ולכן אין
    // כאן המרה חוזרת ל-Date רק כדי להשוות.
    if (safe === null || safe <= today) continue;
    if (latest === null || safe > latest) latest = safe;
  }
  return latest;
}

function toUtcDateOnly(input: string | Date): Date | null {
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) {
      return null;
    }
    return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(input);
  if (match === null) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  // דוחה תאריכים לא חוקיים שגלשו, כמו 2026-02-31
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function formatUtcDateOnly(date: Date): string {
  const year = String(date.getUTCFullYear()).padStart(4, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
