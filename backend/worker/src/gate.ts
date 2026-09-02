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
  // **מזהי המודלים הם קונפיגורציה ולא קבוע בקוד.** אין בהם סוד, ולכן
  // הם יושבים ב-[vars] ב-wrangler.toml ולא ב-secret. הסיבה שהם בכלל
  // קונפיגורציה: שני חוקרים החזירו רשימות מודלים שונות מאותו API, כלומר
  // לא ידוע בוודאות אילו מזהים קיימים היום. מזהה קבוע בקוד היה מחייב PR
  // כדי להחליף מודל שנעלם מהספק.
  //
  // **אופציונליים בסימן שאלה, וזה מכוון.** הטיפוס מתאר את מה ש-wrangler
  // מזריק בפועל, ו-var שנמחק מ-wrangler.toml פשוט אינו קיים בזמן ריצה.
  // הכרזה עליו כמחויב הייתה הבטחה שאין לטיפוסים דרך לאכוף. שכבת החיווט
  // היא זו שמחליטה מה קורה כשהם חסרים, ו-openrouter.ts מקבל ממנה
  // OpenRouterConfig עם שני מחרוזות מחויבות.
  OPENROUTER_MODEL?: string;
  OPENROUTER_MODEL_FALLBACK?: string;
};

// המכסה החודשית במסלול החינמי. prd.md סעיף 11: "עשרה רישומים בקול
// בחודש". מסלול בתשלום הוא ללא הגבלה, כלומר null, אבל עדיין נספר.
export const FREE_MONTHLY_AI_LIMIT = 10;

export type GateResult =
  | { ok: true; userId: string; farmId: string; entitled: boolean }
  | { ok: false; status: 401 | 403 | 429 | 500; reason: string };

// **The reason code for a free tier farm asking for a paid-only feature.** It is
// its own string and not the existing 'no active farm', because from the client
// both are a 403 and the two send the farmer to completely different places: one
// is an offer to upgrade, the other is something broken that he cannot fix. A
// single shared 403 would force the app to guess which sentence to show him.
export const PAID_PLAN_REQUIRED = 'paid plan required';

// **Which features the free tier may reach at all, as opposed to how often.**
// The two are genuinely different questions and only receipts ask the second
// one. prd.md section 11: the free tier gets "עשרה רישומים בקול בחודש", ten
// voice records a month — capped, but allowed. prd.md section 9 says the
// opposite about receipts: "הקבלות הן פיצ'ר בתשלום במלואו. במסלול החינמי אין
// צילום, אין סריקה ואין ארכיון", receipts are a paid feature in full, and line
// 121 repeats it — "זמין במסלולים בתשלום בלבד".
//
// **It is an option on gate() rather than a check the caller does afterwards,
// and that is the whole point of it.** gate() consumes a month of quota
// atomically and there is no refund path, so a caller that asked gate() first
// and inspected `entitled` second would already have charged a farmer for a
// call he was never entitled to make. Putting the question inside gate() is what
// makes the ordering structural instead of a rule every future endpoint has to
// remember: the check sits between loading the farm and consuming the quota, in
// the one function that owns both.
export type GateOptions = {
  // Defaults to false, which is exactly the behaviour every existing caller
  // already has. Voice is unchanged by this: the free tier may record, it is
  // simply counted against FREE_MONTHLY_AI_LIMIT.
  requireEntitlement?: boolean;
};

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
//
// The entitlement check added for receipts extends that same rule by one step
// rather than bending it: authentication, then farm identity, then **whether
// this farm may use this feature at all**, and only then the counter. Each
// question that can refuse for free is asked before the one that costs
// something, and the counter stays last because it is the only step that cannot
// be undone.
// ============================================================

export async function gate(
  request: Request,
  env: Env,
  options: GateOptions = {},
): Promise<GateResult> {
  const auth = request.headers.get('Authorization');
  const token = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : null;
  if (!token) return { ok: false, status: 401, reason: 'missing token' };

  const userId = await verifyToken(env, token);
  if (!userId) return { ok: false, status: 401, reason: 'invalid token' };

  const farm = await loadFarm(env, userId);
  if (!farm) return { ok: false, status: 403, reason: 'no active farm' };

  // **Before consumeQuota, and that placement is the requirement.** A farmer on
  // the free tier photographing a receipt is asking for something he was never
  // entitled to, and consume_ai_quota only ever increments. Refusing him one
  // line later would take a month of voice recordings from him — the shared
  // counter, per docs/roadmap.md — as the price of being told no.
  if (options.requireEntitlement && !farm.entitled) {
    return { ok: false, status: 403, reason: PAID_PLAN_REQUIRED };
  }

  const limit = farm.entitled ? null : FREE_MONTHLY_AI_LIMIT;
  const allowed = await consumeQuota(env, farm.farmId, limit);
  if (!allowed) return { ok: false, status: 429, reason: 'monthly quota exhausted' };

  return { ok: true, userId, farmId: farm.farmId, entitled: farm.entitled };
}
