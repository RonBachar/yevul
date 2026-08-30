// שומר הסף, שלב 5, docs/roadmap.md, "Cloudflare Worker כשומר סף,
// בודק מסלול ומכסה לפני כל קריאה ל-AI, אוכף בשרת ולא בקליינט".
//
// **כל בקשה שעוברת כאן עולה כסף אמיתי** בקריאה ל-OpenRouter, ולכן
// זהו הקוד היחיד בפרויקט שמחליט אם מותר להוציא. prd.md סעיף 12:
// "אכיפת מסלול בשרת ולא בקליינט... זה נכון גם כי קליינט ניתן לעקיפה
// וגם כי המכסה היא כסף אמיתי".
//
// הקובץ הזה אינו יודע דבר על תמלול או על LLM. הוא עונה על שאלה אחת,
// "האם למשק של המשתמש הזה מותר עוד קריאה עכשיו", ומחזיר את התשובה
// יחד עם ה-farm_id שכל שלב הבא יצטרך.

export type Env = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  OPENROUTER_API_KEY: string;
};

// המכסה החודשית במסלול החינמי. prd.md סעיף 11: "עשרה רישומים בקול
// בחודש". מסלול בתשלום הוא ללא הגבלה, כלומר null, אבל עדיין נספר.
export const FREE_MONTHLY_AI_LIMIT = 10;

export type GateResult =
  | { ok: true; userId: string; farmId: string; entitled: boolean }
  | { ok: false; status: 401 | 403 | 429 | 500; reason: string };

// ============================================================
// אימות הטוקן.
//
// **דרך /auth/v1/user ולא אימות חתימה מקומי, בכוונה.** Supabase תומך
// גם ב-HS256 מדור קודם וגם ב-ES256 עם מפתחות מסתובבים, ואימות מקומי
// היה מחייב אותנו לעקוב אחרי הסיבוב הזה ולהחזיק סוד נוסף ב-Worker.
// סבב רשת אחד לשירות שממילא נקרא בהמשך זול בהרבה מטעות אימות שקטה.
// ============================================================

async function verifyToken(env: Env, token: string): Promise<string | null> {
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    },
  });
  if (!response.ok) return null;
  const user = (await response.json()) as { id?: string };
  return user.id ?? null;
}

// ============================================================
// המשק של המשתמש והמסלול שלו.
//
// service role עוקף RLS, ולכן הסינון לפי user_id וסטטוס נכתב כאן
// במפורש. **זו נקודה שבה טעות שקטה הופכת לדליפה בין משקים**, ולכן
// אין כאן שאילתה גורפת שמסתמכת על מדיניות שלא פועלת בהקשר הזה.
// ============================================================

async function loadFarm(
  env: Env,
  userId: string,
): Promise<{ farmId: string; entitled: boolean } | null> {
  const rest = `${env.SUPABASE_URL}/rest/v1`;
  const headers = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  };

  const memberResponse = await fetch(
    `${rest}/farm_members?select=farm_id&user_id=eq.${userId}&status=eq.active&deleted_at=is.null&limit=1`,
    { headers },
  );
  if (!memberResponse.ok) return null;
  const members = (await memberResponse.json()) as { farm_id: string }[];
  const farmId = members[0]?.farm_id;
  if (!farmId) return null;

  // היעדר שורת מנוי אינו שגיאה, הוא פשוט המסלול החינמי.
  const subResponse = await fetch(
    `${rest}/subscriptions?select=entitlement_active,expires_at&farm_id=eq.${farmId}&limit=1`,
    { headers },
  );
  if (!subResponse.ok) return null;
  const subs = (await subResponse.json()) as {
    entitlement_active: boolean;
    expires_at: string | null;
  }[];

  const sub = subs[0];
  // **תוקף פג נבדק כאן ולא רק הדגל.** entitlement_active לבדו היה
  // משאיר מנוי שפג כפעיל עד שהוובהוק הבא יעדכן אותו, כלומר גישה
  // חינם ללא הגבלה בפער שבין השניים.
  const entitled =
    sub?.entitlement_active === true &&
    (sub.expires_at === null || new Date(sub.expires_at).getTime() > Date.now());

  return { farmId, entitled };
}

// ============================================================
// צריכת המכסה, דרך פונקציית Postgres אטומית אחת.
//
// הבדיקה וההגדלה חייבות להיות אותה פעולה, אחרת שתי בקשות מקבילות
// בקצה המכסה שתיהן עוברות. ראה את הנימוק המלא במיגרציה
// 20260830060000_ai_usage_quota.sql.
// ============================================================

async function consumeQuota(env: Env, farmId: string, limit: number | null): Promise<boolean> {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/consume_ai_quota`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      // הפונקציה יושבת בסכימת private, שאינה חשופה ל-PostgREST כברירת
      // מחדל. ראה את המיגרציה שחושפת אותה דרך עטיפה בסכימת public.
      'Content-Profile': 'public',
    },
    body: JSON.stringify({ p_farm_id: farmId, p_limit: limit }),
  });
  if (!response.ok) return false;
  return (await response.json()) === true;
}

// ============================================================
// השומר עצמו. סדר הבדיקות אינו שרירותי: אימות לפני זהות משק, וזהות
// משק לפני מכסה, כדי שבקשה לא מאומתת לעולם לא תיגע במונה.
// ============================================================

export async function gate(request: Request, env: Env): Promise<GateResult> {
  const auth = request.headers.get('Authorization');
  const token = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : null;
  if (!token) return { ok: false, status: 401, reason: 'missing token' };

  const userId = await verifyToken(env, token);
  if (!userId) return { ok: false, status: 401, reason: 'invalid token' };

  const farm = await loadFarm(env, userId);
  if (!farm) return { ok: false, status: 403, reason: 'no active farm' };

  const limit = farm.entitled ? null : FREE_MONTHLY_AI_LIMIT;
  const allowed = await consumeQuota(env, farm.farmId, limit);
  if (!allowed) return { ok: false, status: 429, reason: 'monthly quota exhausted' };

  return { ok: true, userId, farmId: farm.farmId, entitled: farm.entitled };
}
