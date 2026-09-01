// אינטגרציית OpenRouter, שלב 5, docs/roadmap.md: "אינטגרציית OpenRouter,
// תמלול עברית, ואז LLM שמחזיר JSON מובנה לפי אחת משלוש הסכמות, הוצאה,
// משימה, יומן".
//
// **קריאה אחת ולא שתיים.** האודיו נכנס, והתמלול והחילוץ יוצאים יחד
// באותו JSON. זו הסיבה ששדה transcript יושב בסכמת החוט, ראה
// voiceWireJsonSchema ב-packages/shared/src/voice.ts, ואין כאן מסלול
// תמלול נפרד. שתי קריאות היו שתי חשבוניות, שתי נקודות כשל, והאודיו
// עולה לרשת פעמיים.
//
// **המודול הזה אינו נוגע ב-fetch הגלובלי, הוא מקבל fetch כפרמטר.** זו
// דרישה ולא סגנון. כשה-fetch מוזרק אין דרך שטסט יצא לרשת בטעות ויחייב
// כרטיס אשראי אמיתי, וזה ההבדל בין "המוק לא נקרא" לבין "אין דרך לצאת".
//
// **הוולידציה אינה כאן, בכוונה.** המודול מחזיר את האובייקט הגולמי
// שהמודל החזיר, ו-parseVoiceResult רץ בשכבה שמעליו. כך "OpenRouter לא
// ענה" ו"המודל ענה שטויות" הם שני כשלים נפרדים, שנבדקים בנפרד ומוצגים
// לחקלאי אחרת.

import { voiceWireJsonSchema, type VoiceKind } from '@yevul/shared/src/voice';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// שתי הכותרות שהתיעוד של OpenRouter מבקש, לשיוך הקריאות לאפליקציה בלוח
// שלהם. **אין כאן בקשת רשת לכתובת הזו**, זה מזהה בלבד, ולכן הוא נגזר
// ממזהה החבילה com.yevul.app ולא מדומיין חי שעדיין לא קיים.
const APP_REFERER = 'https://yevul.app';
const APP_TITLE = 'Yevul';

// תקרת פלט. **Gemini מחייב על טוקני חשיבה במחיר טוקני פלט**, ובלי תקרה
// חשבון הפלט של קריאה בודדת יכול לצאת פי כמה מהמשוער. הסכמה הגדולה
// ביותר היא היומן, תשעה שדות ותמלול, ונכנסת בנוחות במסגרת הזו.
const MAX_OUTPUT_TOKENS = 400;

// ============================================================
// הטיפוסים.
// ============================================================

// חתימה מצומצמת בכוונה, בדיוק מה שהמודול שולח ולא יותר. חתימת fetch
// המלאה הייתה מחייבת כל מוק בטסט לספק עומסים שאיש כאן לא משתמש בהם,
// ובפועל מסתירה את מה שכן נשלח. ה-fetch האמיתי של workerd עונה על
// החתימה הזו, וזה נבדק בטסט.
export type FetchInit = {
  method: string;
  headers: Record<string, string>;
  body: string;
};

export type FetchLike = (url: string, init: FetchInit) => Promise<Response>;

// הפורמטים ש-OpenRouter מקבל בשדה input_audio. רשימה סגורה ולא string,
// כדי שפורמט שגוי ייפול בקומפילציה ולא ב-400 מהספק.
export type AudioFormat = 'm4a' | 'mp3' | 'wav' | 'ogg' | 'flac' | 'webm' | 'aac';

export type OpenRouterConfig = {
  apiKey: string;
  // מזהי המודלים מגיעים מ-[vars] ב-wrangler.toml ואינם קבועים בקוד. ראה
  // את הנימוק המלא ב-Env בתוך gate.ts.
  model: string;
  fallbackModel: string;
};

export type VoiceRequest = {
  kind: VoiceKind;
  audio: ArrayBuffer;
  // YYYY-MM-DD **מהקליינט ולא מהשרת**. ה-Worker רץ ב-UTC, כלומר אחרי
  // 21:00 בשעון ישראל בקיץ הוא כבר במחר, והמודל היה מפענח "אתמול" ביום
  // אחד קדימה. הוולידטורים דוחים רשומה בלי תאריך תקין, ולכן המודל חייב
  // לדעת מה היום.
  //
  // **הערך הזה נכנס לטקסט ההנחיה והוא מגיע מהקליינט**, כלומר הוא חייב
  // להיות מאומת כתאריך לפני שהוא מגיע לכאן. אימות שייך לשכבת החיווט,
  // שם יושבת קריאת הגוף של הבקשה, ולא כאן.
  today: string;
  // ברירת המחדל היא m4a, כי RecordingPresets.HIGH_QUALITY ב-expo-audio
  // מפיק m4a בשתי הפלטפורמות ואין המרה בשום מקום בצינור. הפרמטר קיים
  // כי **מי שמחזיק את הקובץ הוא זה שיודע מה הפורמט שלו**, ולא שכבת
  // התעבורה. סקריפט ה-probe שולח wav, ובעתיד גם קבלות בווב לא יהיו m4a.
  format?: AudioFormat;
};

export type VoiceUsage = {
  // **המודל שבאמת ענה, מתוך התשובה, ולא הראשי שביקשנו.** מערך models
  // אומר שהתשובה עשויה להגיע מהגיבוי, ומשלמים על מי שענה. null כשהתשובה
  // לא כללה את השדה, כי "לא ידוע" עדיף על ייחוס שגוי בחשבון.
  model: string | null;
  costUsd: number | null;
};

export type VoiceCallResult =
  // הצלחה. raw הוא unknown ולא אובייקט מטופס, כי מי שמחליט אם הוא תקין
  // הוא parseVoiceResult בשכבה שמעל, ולא הקוד הזה.
  | { ok: true; raw: unknown; transcript: string | null; usage: VoiceUsage }
  // רשת נפלה, OpenRouter החזיר שגיאה, או שהגוף אינו מה שהובטח. status
  // הוא null כשהבקשה לא הגיעה בכלל לשרת.
  | { ok: false; failure: 'upstream'; status: number | null; reason: string }
  // התשובה הגיעה ואפילו שולם עליה, אבל התוכן אינו JSON.
  | { ok: false; failure: 'parse'; reason: string; content: string; usage: VoiceUsage };

// ============================================================
// המרת האודיו ל-base64.
// ============================================================

// חלון של 32KB. **לא String.fromCharCode(...new Uint8Array(buf)).**
// פריסת מערך לארגומנטים מעמיסה איבר לאיבר על מחסנית הקריאות, וקובץ
// אודיו אמיתי, מאות אלפי בתים, זורק שם RangeError. הקלטה של דקה היא
// בדיוק הגודל הזה, כלומר זה מסלול הרוב ולא מקרה קצה.
const BASE64_CHUNK_BYTES = 0x8000;

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunks: string[] = [];

  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK_BYTES) {
    // subarray ולא slice, חלון על אותו זיכרון בלי העתקה נוספת של האודיו.
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + BASE64_CHUNK_BYTES)));
  }

  // btoa קיים ב-workerd. Buffer אינו קיים שם, ולכן אין כאן קיצור דרך.
  return btoa(chunks.join(''));
}

// ============================================================
// בניית הבקשה.
// ============================================================

const KIND_SUBJECT: Record<VoiceKind, string> = {
  expense: 'הוצאה ששילם',
  task: 'משימה שצריך לעשות',
  journal: 'פעולה שביצע בשדה, לרישום ביומן העבודה',
};

// **התאריך מופיע פעמיים ובמפורש.** בלעדיו המודל אינו יודע מה היום, ואין
// לו שום דרך לפענח "אתמול" או "שלשום", וכל רשומה כזו נדחית אחר כך
// בוולידטור על תאריך פסול.
function instructionText(kind: VoiceKind, today: string): string {
  return [
    `היום ${today}.`,
    `בהקלטה הבאה חקלאי מדבר עברית על ${KIND_SUBJECT[kind]}.`,
    'העתק את ההקלטה מילה במילה לשדה transcript, ורק אחר כך מלא את שאר השדות ממה שנאמר.',
    `כל תאריך בתשובה בפורמט YYYY-MM-DD, ו"היום", "אתמול" ו"שלשום" מחושבים ביחס ל-${today}.`,
    'שדה שלא נאמר בהקלטה מקבל null. אל תמציא ערכים ואל תשלים מידע שלא נשמע בהקלטה.',
  ].join(' ');
}

function requestBody(config: OpenRouterConfig, request: VoiceRequest, audioBase64: string): object {
  return {
    // **models ולא model יחיד.** הפולבק האוטומטי של OpenRouter עובר
    // לגיבוי על downtime ועל rate limit, **אבל לא על 400**, ולכן סכמה
    // פסולה נכשלת בקול ואינה מחליקה בשקט לגיבוי ומסתירה את הבאג.
    models: [config.model, config.fallbackModel],
    // **חובה, ולא אופטימיזציה.** בלי require_parameters, response_format
    // הוא רק העדפה רכה בבחירת ספק, וספק שאינו תומך בו פשוט מתעלם ממנו.
    // כלומר קיים מסלול שבו חוזר 200 עם טקסט חופשי בעברית במקום JSON,
    // וזה נראה בדיוק כמו מודל שנכשל.
    provider: { require_parameters: true },
    response_format: {
      type: 'json_schema',
      json_schema: {
        // מזהה לטיני. זה שם הסכמה אצל הספק ולא טקסט שמישהו קורא.
        name: `voice_${request.kind}`,
        strict: true,
        // **voiceWireJsonSchema ולא voiceJsonSchema.** גרסת החוט מסירה
        // minimum, maximum ו-exclusiveMinimum, שספקי structured outputs
        // דוחים ב-400, ומוסיפה את transcript. ראה את ההסבר המלא בסוף
        // packages/shared/src/voice.ts.
        schema: voiceWireJsonSchema(request.kind),
      },
    },
    // חילוץ ולא כתיבה יוצרת. אותה הקלטה צריכה להחזיר את אותו JSON.
    temperature: 0,
    max_tokens: MAX_OUTPUT_TOKENS,
    messages: [
      {
        role: 'user',
        content: [
          // ההנחיה לפני האודיו. מודל שקורא קודם מה מבקשים ממנו מקשיב
          // להקלטה כשהמשימה כבר ידועה לו.
          { type: 'text', text: instructionText(request.kind, request.today) },
          {
            type: 'input_audio',
            input_audio: { data: audioBase64, format: request.format ?? 'm4a' },
          },
        ],
      },
    ],
  };
}

// ============================================================
// פירוק התשובה. **כל מה שחוזר מכאן הוא קלט עוין**, כולל המעטפת עצמה,
// ולכן אין כאן שום גישה ישירה לשדה בלי בדיקה.
// ============================================================

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

async function readJsonBody(
  response: Response,
): Promise<{ read: true; value: unknown } | { read: false }> {
  try {
    return { read: true, value: await response.json() };
  } catch {
    // גוף שאינו JSON בכלל, למשל דף שגיאה של פרוקסי או של שכבת CDN
    // שיושבת בדרך. הבחנה בין זה לבין null אמיתי בגוף חשובה, כי null
    // אמיתי הוא תשובה תקינה תחבירית שרק חסר בה תוכן.
    return { read: false };
  }
}

// ההודעה של OpenRouter כשהיא קיימת, אחרת רק הקוד. היא נכנסת ללוג ולא
// למסך, החקלאי רואה "לא הצלחנו" בכל מקרה.
function upstreamReason(payload: unknown, status: number): string {
  const message = asRecord(asRecord(payload)?.error)?.message;
  return typeof message === 'string' && message.trim() !== ''
    ? message
    : `openrouter returned ${status}`;
}

function firstMessageContent(payload: Record<string, unknown> | null): string | null {
  const choices = payload?.choices;
  if (!Array.isArray(choices)) return null;
  const content = asRecord(asRecord(choices[0])?.message)?.content;
  return typeof content === 'string' && content.trim() !== '' ? content : null;
}

// usage.cost הוא הדולרים בפועל של הקריאה, וזה המספר שנרשם לחשבון.
function readCost(payload: Record<string, unknown> | null): number | null {
  const cost = asRecord(payload?.usage)?.cost;
  return typeof cost === 'number' && Number.isFinite(cost) ? cost : null;
}

// transcript אינו שדה של הרשומה ואינו נכנס לוולידטורים, הוא נתון תצוגה,
// "זה מה ששמענו". הוא נקרא כאן מהאובייקט הגולמי כי הוולידטור שמעל
// מתעלם ממנו לגמרי.
function readTranscript(raw: unknown): string | null {
  const value = asRecord(raw)?.transcript;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

const CODE_FENCE = /^```[a-z]*\s*\r?\n([\s\S]*?)\r?\n?```$/i;

// **גדרות markdown נחתכות ולא מפילות את הקריאה.** מודל שעטף JSON תקין
// ב-```json החזיר תוכן נכון בעטיפה שגויה, ודחייה כאן הייתה שולחת את
// החקלאי להקליט מחדש ולשלם שוב על תשובה שכבר הייתה נכונה. זה אינו ריכוך
// של כשל אמיתי: אם מה שבתוך הגדר אינו JSON, JSON.parse עדיין נכשל.
function stripCodeFence(content: string): string {
  const trimmed = content.trim();
  return CODE_FENCE.exec(trimmed)?.[1]?.trim() ?? trimmed;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ============================================================
// הקריאה עצמה.
// ============================================================

export async function extractVoice(
  config: OpenRouterConfig,
  request: VoiceRequest,
  fetchImpl: FetchLike,
): Promise<VoiceCallResult> {
  const body = requestBody(config, request, arrayBufferToBase64(request.audio));

  let response: Response;
  try {
    response = await fetchImpl(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': APP_REFERER,
        'X-Title': APP_TITLE,
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    // **אין כאן retry.** השכבה שמעל היא זו שיודעת שהמכסה כבר נצרכה,
    // וניסיון חוזר עיוור מכאן הוא חיוב כפול על אותה הקלטה.
    return { ok: false, failure: 'upstream', status: null, reason: describeError(error) };
  }

  const parsedBody = await readJsonBody(response);

  if (!response.ok) {
    return {
      ok: false,
      failure: 'upstream',
      status: response.status,
      reason: parsedBody.read
        ? upstreamReason(parsedBody.value, response.status)
        : `openrouter returned ${response.status}`,
    };
  }

  if (!parsedBody.read) {
    return {
      ok: false,
      failure: 'upstream',
      status: response.status,
      reason: 'response body is not json',
    };
  }

  const payload = asRecord(parsedBody.value);
  const usage: VoiceUsage = {
    model: typeof payload?.model === 'string' ? payload.model : null,
    costUsd: readCost(payload),
  };

  const content = firstMessageContent(payload);
  if (content === null) {
    // choices ריק, או הודעה בלי תוכן. **זה כשל upstream ולא כשל פירוק**,
    // כי אין כאן שום דבר לפרק, ההבטחה של הפרוטוקול עצמה הופרה.
    return {
      ok: false,
      failure: 'upstream',
      status: response.status,
      reason: 'no message content in response',
    };
  }

  try {
    const raw: unknown = JSON.parse(stripCodeFence(content));
    return { ok: true, raw, transcript: readTranscript(raw), usage };
  } catch (error) {
    // תשובה שנחתכה ב-max_tokens, או טקסט חופשי במקום JSON. **התוכן חוזר
    // כמות שהוא** כדי שהשכבה שמעל תוכל לרשום אותו ללוג, כי בלי הטקסט
    // אי אפשר להבדיל בין חיתוך לבין מודל שהתעלם מהסכמה, ואלה שתי תקלות
    // שונות לגמרי.
    return { ok: false, failure: 'parse', reason: describeError(error), content, usage };
  }
}
