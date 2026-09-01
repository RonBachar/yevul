// טסטים לשומר הסף, backend/worker/src/gate.ts.
//
// **זהו הקוד היחיד בפרויקט שמחליט אם מותר להוציא כסף אמיתי**, ועד
// עכשיו הוא היה הקוד היחיד שלא היה מכוסה בטסטים. gate.ts מדבר רק עם
// Supabase דרך fetch, ולכן כל מה שנדרש כדי לבדוק אותו הוא להחליף את
// fetch ולענות תשובות שונות לפי הכתובת שנקראה.
//
// **בלי @cloudflare/vitest-pool-workers, בכוונה.** gate.ts משתמש
// ב-fetch, Request, Response ו-URL בלבד, וכולם קיימים ב-Node שרץ כאן.
// pool ייעודי היה מוסיף תלות ותאימות גרסאות בלי לקנות כיסוי נוסף.
//
// **הטסטים כאן לעולם אינם יוצאים לרשת.** ה-URL הוא סיומת invalid
// לפי RFC 2606, שלא ניתנת לפתרון DNS, ומעבר לזה beforeEach מתקין
// fetch שזורק, כך שטסט ששכח מוק ייפול במקום לצאת החוצה.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FREE_MONTHLY_AI_LIMIT, gate, type Env } from './gate';

const env: Env = {
  SUPABASE_URL: 'https://project.supabase.invalid',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-for-tests',
  OPENROUTER_API_KEY: 'openrouter-key-for-tests',
};

const USER_ID = '22222222-2222-4222-8222-222222222222';
const FARM_ID = '11111111-1111-4111-8111-111111111111';

// ============================================================
// המוק. מנתב לפי הכתובת, לא לפי סדר הקריאות.
//
// ניתוב לפי סדר היה הופך כל טסט לתלוי בסדר שאותו אנחנו בדיוק רוצים
// לבדוק, ובכך היה מסתיר בדיוק את הבאג שהטסט על הסדר מחפש.
// ============================================================

type StubResponse = { status?: number; body?: unknown };

type Handlers = {
  user?: StubResponse;
  members?: StubResponse;
  subscriptions?: StubResponse;
  quota?: StubResponse;
};

type RecordedCall = { url: string; body: unknown };

function routeFor(url: string, handlers: Handlers): StubResponse | undefined {
  if (url.includes('/auth/v1/user')) return handlers.user;
  if (url.includes('/rest/v1/rpc/consume_ai_quota')) return handlers.quota;
  if (url.includes('/rest/v1/farm_members')) return handlers.members;
  if (url.includes('/rest/v1/subscriptions')) return handlers.subscriptions;
  return undefined;
}

// מחזיר את יומן הקריאות. הטסטים על הסדר קוראים ממנו, ולכן הוא נאסף
// תמיד ולא רק כשמבקשים אותו.
function installFetch(handlers: Handlers): RecordedCall[] {
  const calls: RecordedCall[] = [];

  const spy = vi.fn((input: unknown, init?: { body?: unknown }) => {
    const url = String(input);
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ url, body });

    const stub = routeFor(url, handlers);
    // כתובת שהטסט לא צפה היא כשל בטסט, לא תשובה ריקה. תשובה ריקה
    // הייתה מסתירה שינוי בכתובות שהשומר קורא.
    if (!stub) throw new Error(`הטסט לא הגדיר תשובה עבור ${url}`);

    return Promise.resolve(
      new Response(JSON.stringify(stub.body ?? null), { status: stub.status ?? 200 }),
    );
  });

  vi.stubGlobal('fetch', spy);
  return calls;
}

// זרימה תקינה מלאה, שכל טסט משנה ממנה רק את מה שהוא בודק. כך ברור
// בקריאה מה בדיוק הטסט מפיל, ולא צריך לקרוא את כל ההקשר.
function passingHandlers(overrides: Partial<Handlers> = {}): Handlers {
  return {
    user: { body: { id: USER_ID } },
    members: { body: [{ farm_id: FARM_ID }] },
    subscriptions: { body: [] },
    quota: { body: true },
    ...overrides,
  };
}

function requestWith(authorization?: string): Request {
  const headers: Record<string, string> = {};
  if (authorization !== undefined) headers.Authorization = authorization;
  return new Request('https://worker.invalid/ai', { headers });
}

function quotaCalls(calls: RecordedCall[]): RecordedCall[] {
  return calls.filter((call) => call.url.includes('/rest/v1/rpc/consume_ai_quota'));
}

beforeEach(() => {
  vi.stubGlobal('fetch', () => {
    throw new Error('הטסט לא התקין מוק ל-fetch');
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ============================================================
// אימות הטוקן.
// ============================================================

describe('gate, אימות', () => {
  it('דוחה בקשה בלי כותרת Authorization', async () => {
    installFetch(passingHandlers());

    const result = await gate(requestWith(), env);

    expect(result).toEqual({ ok: false, status: 401, reason: 'missing token' });
  });

  // סכמת אימות אחרת אינה "טוקן פגום", היא בכלל לא טוקן. בלי הבדיקה
  // הזו כותרת Basic הייתה נחתכת ב-slice(7) לזבל ונשלחת ל-Supabase.
  it('דוחה כותרת שאינה מתחילה ב-Bearer', async () => {
    installFetch(passingHandlers());

    const result = await gate(requestWith('Basic dXNlcjpwYXNz'), env);

    expect(result).toEqual({ ok: false, status: 401, reason: 'missing token' });
  });

  it('דוחה טוקן ש-/auth/v1/user לא אישר', async () => {
    installFetch(passingHandlers({ user: { status: 401, body: { message: 'bad jwt' } } }));

    const result = await gate(requestWith('Bearer expired-token'), env);

    expect(result).toEqual({ ok: false, status: 401, reason: 'invalid token' });
  });

  // תשובה 200 בלי id היא מצב שלא אמור לקרות, ולכן דווקא כדאי שיהיה
  // ברור מה קורה בו: דחייה, ולא משתמש בלי זהות שממשיך הלאה.
  it('דוחה תשובת אימות תקינה שאין בה מזהה משתמש', async () => {
    installFetch(passingHandlers({ user: { body: {} } }));

    const result = await gate(requestWith('Bearer token-without-id'), env);

    expect(result).toEqual({ ok: false, status: 401, reason: 'invalid token' });
  });
});

// ============================================================
// זהות המשק והמסלול.
// ============================================================

describe('gate, זהות משק ומסלול', () => {
  it('דוחה משתמש מאומת שאין לו שורת farm_members פעילה', async () => {
    installFetch(passingHandlers({ members: { body: [] } }));

    const result = await gate(requestWith('Bearer good-token'), env);

    expect(result).toEqual({ ok: false, status: 403, reason: 'no active farm' });
  });

  // היעדר שורת מנוי הוא המסלול החינמי, לא שגיאה. הבדיקה מאמתת גם
  // את התוצאה וגם את המכסה שנשלחה בפועל, כי entitled: false בלי
  // המספר הנכון ב-RPC הוא עדיין מסלול חינמי ללא הגבלה.
  it('משק בלי שורת מנוי עובר כלא מנוי, ושולח מכסה של עשר', async () => {
    const calls = installFetch(passingHandlers({ subscriptions: { body: [] } }));

    const result = await gate(requestWith('Bearer good-token'), env);

    expect(result).toEqual({ ok: true, userId: USER_ID, farmId: FARM_ID, entitled: false });
    expect(quotaCalls(calls)).toHaveLength(1);
    expect(quotaCalls(calls)[0]?.body).toEqual({ p_farm_id: FARM_ID, p_limit: 10 });
    expect(FREE_MONTHLY_AI_LIMIT).toBe(10);
  });

  it('מנוי פעיל בלי תאריך תפוגה עובר כמנוי, ושולח מכסה null', async () => {
    const calls = installFetch(
      passingHandlers({
        subscriptions: { body: [{ entitlement_active: true, expires_at: null }] },
      }),
    );

    const result = await gate(requestWith('Bearer good-token'), env);

    expect(result).toEqual({ ok: true, userId: USER_ID, farmId: FARM_ID, entitled: true });
    expect(quotaCalls(calls)[0]?.body).toEqual({ p_farm_id: FARM_ID, p_limit: null });
  });

  // **הטסט שההערה בגוף הקוד הבטיחה ואף אחד לא בדק.** entitlement_active
  // לבדו היה משאיר מנוי שפג כפעיל עד שהוובהוק הבא יעדכן, כלומר גישה
  // חינם ללא הגבלה בפער שבין השניים. התאריך יחסי לרגע הריצה ולא קבוע,
  // אחרת הטסט היה מפסיק לבדוק את מה שהוא מתיימר לבדוק ביום שבו התאריך
  // הקבוע הופך לעתיד.
  it('מנוי עם דגל פעיל אבל תפוגה שחלפה אינו מנוי', async () => {
    const expired = new Date(Date.now() - 60_000).toISOString();
    const calls = installFetch(
      passingHandlers({
        subscriptions: { body: [{ entitlement_active: true, expires_at: expired }] },
      }),
    );

    const result = await gate(requestWith('Bearer good-token'), env);

    expect(result).toEqual({ ok: true, userId: USER_ID, farmId: FARM_ID, entitled: false });
    // ההוכחה שזו אינה רק תווית: המכסה שנשלחה היא המכסה החינמית.
    expect(quotaCalls(calls)[0]?.body).toEqual({ p_farm_id: FARM_ID, p_limit: 10 });
  });
});

// ============================================================
// המכסה.
// ============================================================

describe('gate, מכסה', () => {
  it('מחזיר 429 כשה-RPC אומר שהמכסה מוצתה', async () => {
    installFetch(passingHandlers({ quota: { body: false } }));

    const result = await gate(requestWith('Bearer good-token'), env);

    expect(result).toEqual({ ok: false, status: 429, reason: 'monthly quota exhausted' });
  });

  it('זרימה תקינה מלאה מחזירה את המשתמש, המשק והמסלול', async () => {
    const calls = installFetch(
      passingHandlers({
        subscriptions: { body: [{ entitlement_active: true, expires_at: null }] },
      }),
    );

    const result = await gate(requestWith('Bearer good-token'), env);

    expect(result).toEqual({ ok: true, userId: USER_ID, farmId: FARM_ID, entitled: true });
    expect(calls).toHaveLength(4);
  });
});

// ============================================================
// סדר הבדיקות.
//
// gate.ts מבטיח במפורש: "אימות לפני זהות משק, וזהות משק לפני מכסה,
// כדי שבקשה לא מאומתת לעולם לא תיגע במונה". **מוק שרק מחזיר ערכים
// אינו בודק את ההבטחה הזו**, כי גם מימוש שקורא ל-RPC קודם ומתעלם
// מהתוצאה היה מחזיר בדיוק את אותם קודי שגיאה. לכן כאן סופרים את
// הקריאות בפועל ולא מסתכלים על התוצאה.
//
// זה חשוב מעשית ולא רק תיאורטית: כל קריאה ל-consume_ai_quota מגדילה
// מונה חודשי אמיתי. מימוש שיקרא לו לפני האימות היה שורף מכסה של משק
// אמיתי מבקשות של תוקף שאין לו טוקן בכלל.
// ============================================================

describe('gate, סדר הבדיקות', () => {
  it('בקשה בלי טוקן אינה פותחת שום קריאת רשת', async () => {
    const calls = installFetch(passingHandlers());

    await gate(requestWith(), env);

    expect(calls).toHaveLength(0);
  });

  it('טוקן פסול אינו נוגע במונה, וגם לא בטבלאות המשק', async () => {
    const calls = installFetch(passingHandlers({ user: { status: 401, body: {} } }));

    await gate(requestWith('Bearer forged-token'), env);

    expect(quotaCalls(calls)).toHaveLength(0);
    expect(calls.filter((call) => call.url.includes('/rest/v1/'))).toHaveLength(0);
    expect(calls).toHaveLength(1);
  });

  it('משתמש מאומת בלי משק אינו נוגע במונה', async () => {
    const calls = installFetch(passingHandlers({ members: { body: [] } }));

    await gate(requestWith('Bearer good-token'), env);

    expect(quotaCalls(calls)).toHaveLength(0);
  });
});

// ============================================================
// התנהגות ידועה ולא רצויה, מתועדת ולא מתוקנת.
//
// **הטסט הבא נועל באג בכוונה.** gate.ts שורה 118, `if (!response.ok)
// return false`, אינה מבחינה בין "המכסה מוצתה" לבין "Supabase לא ענה".
// נפילת רשת או שגיאת שרת הופכות ל-429 ולהודעה "מכסה חודשית מוצתה"
// לחקלאי שהמכסה שלו שלמה לגמרי.
//
// זה fail-closed ולכן אינו עולה כסף ואינו חור אבטחה, אבל זה שקר
// למשתמש: הוא יראה שנשארו לו רישומים במסך ויקבל הודעה שנגמרו.
//
// **התיקון שייך לצעד מאוחר יותר בתוכנית ולא לצעד הזה**, ולכן הטסט
// מתעד את ההתנהגות הקיימת. ביום שבו התיקון ינחת, הטסט הזה אמור
// להיכשל, וזו בדיוק המטרה: הוא ישתנה ל-500 עם reason נפרד יחד עם
// הקוד, במקום שהשינוי יעבור בלי ששמו לב.
// ============================================================

describe('gate, באג מתועד: כשל שרת מוצג כמכסה מוצתה', () => {
  it('נפילת ה-RPC מתורגמת היום ל-429, למרות שהמכסה שלמה', async () => {
    installFetch(passingHandlers({ quota: { status: 500, body: { message: 'boom' } } }));

    const result = await gate(requestWith('Bearer good-token'), env);

    expect(result).toEqual({ ok: false, status: 429, reason: 'monthly quota exhausted' });
  });
});
