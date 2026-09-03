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
//
// **Two entry points, one core, and deliberately not two modules.** Stage 5 adds
// receipt OCR, and everything that makes talking to this provider correct is
// identical for a photograph and for a recording: the `models` array with its
// fallback, provider.require_parameters, temperature 0, the output ceiling, the
// base64 chunking, the markdown fence that has to be stripped off an otherwise
// perfect answer, and every one of the four ways a reply can be unusable. A
// second copy of that would be a second thing to fix on the day OpenRouter
// changes an error shape, and the copy nobody is currently debugging is the one
// that stays broken.
//
// What actually differs between the two is three values — which schema the model
// is held to, what it is told to do, and one content part carrying either audio
// or an image — so those are the three the two entry points supply and the rest
// is shared. See requestBody and callOpenRouter below.

import { receiptWireJsonSchema } from '@yevul/shared/src/receipt';
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
//
// The list is a runtime value and the type is derived from it, rather than the
// other way round. The wiring layer has to check a client-supplied string
// against this same closed set, and a hand-written second copy of the list
// there would drift silently the day a format is added here.
export const AUDIO_FORMATS = ['m4a', 'mp3', 'wav', 'ogg', 'flac', 'webm', 'aac'] as const;

export type AudioFormat = (typeof AUDIO_FORMATS)[number];

// ============================================================
// The image formats receipts may arrive in.
//
// **Three, and the list is short on purpose.** These are what a phone camera and
// a desktop file picker actually produce for a document: expo-image-picker and
// expo-camera hand back JPEG on both platforms, a screenshot or a scan from a
// computer is a PNG, and WEBP turns up from Android galleries and from anything
// that has been through a browser. Every one of them is a format the vision
// models behind this endpoint read directly, with no server-side conversion and
// no extra dependency in a Worker.
//
// **What is left out is left out because accepting it would cost quota to
// refuse.** A format the provider rejects comes back as a 400 from OpenRouter,
// which the wiring layer maps to a 502 — and by then the farm's counter has
// already been incremented for a scan that never happened. Refusing at the edge,
// before the gate, is free. That is the reasoning behind both exclusions:
//
//   HEIC/HEIF  What an iPhone stores natively when a file is picked rather than
//              captured. Support is uneven across providers, and the fix belongs
//              on the client, where it now is: the compression step re-encodes
//              every resized receipt to JPEG on the way out, so this endpoint
//              sees a HEIC only when that resize failed. See
//              RECEIPT_COMPRESSED_MIME_TYPE in packages/shared/src/receiptImage.ts.
//   PDF        Not an image at all. OpenRouter takes a PDF through a different
//              content part and a separately priced document parsing plugin,
//              billed per page, which is a second cost model rather than one
//              more entry in this list. attachReceipt in packages/shared still
//              stores PDFs happily; it is only OCR that does not read them.
// ============================================================

export const IMAGE_FORMATS = ['jpeg', 'png', 'webp'] as const;

export type ImageFormat = (typeof IMAGE_FORMATS)[number];

const IMAGE_MIME_TYPES: Record<ImageFormat, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

// **The format is detected from the bytes, never taken from the client.** Audio
// is the opposite case — m4a, mp3 and aac share a container family that cannot
// be told apart cheaply, and the recorder genuinely is the one that knows — so
// AudioFormat is a parameter. An image needs no such trust: the first eight
// bytes are definitive. Detecting rather than believing removes a whole failure
// mode, the one where a client labels a PNG as JPEG, the provider answers 400,
// and the farmer has paid a scan to find out.
const JPEG_MAGIC = [0xff, 0xd8, 0xff];
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
// WEBP is a RIFF container: "RIFF", four bytes of length, then "WEBP". Both
// halves are checked, because "RIFF" alone is also a WAV file.
const RIFF_MAGIC = [0x52, 0x49, 0x46, 0x46];
const WEBP_MAGIC = [0x57, 0x45, 0x42, 0x50];
const WEBP_MAGIC_OFFSET = 8;

function bytesMatch(bytes: Uint8Array, magic: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + magic.length) return false;
  return magic.every((byte, index) => bytes[offset + index] === byte);
}

export function detectImageFormat(image: ArrayBuffer): ImageFormat | null {
  const bytes = new Uint8Array(image);

  if (bytesMatch(bytes, JPEG_MAGIC)) return 'jpeg';
  if (bytesMatch(bytes, PNG_MAGIC)) return 'png';
  if (bytesMatch(bytes, RIFF_MAGIC) && bytesMatch(bytes, WEBP_MAGIC, WEBP_MAGIC_OFFSET)) {
    return 'webp';
  }
  // null and not a throw: an unrecognised upload is an ordinary client mistake
  // that the wiring layer answers with a 400, not an exception.
  return null;
}

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

export type ReceiptRequest = {
  image: ArrayBuffer;
  // **Detected from the bytes by the wiring layer, not supplied by the client.**
  // It is still a field rather than something this module sniffs itself, because
  // the wiring layer has to reject an unknown format with a 400 *before* the
  // gate, and sniffing twice would mean two places that decide what is readable.
  format: ImageFormat;
  // YYYY-MM-DD from the client, validated there, for the same two reasons it is
  // on VoiceRequest: the Worker runs in UTC and cannot supply the farmer's own
  // date, and this value is interpolated into the instruction text so it must
  // never be free text. It matters on a receipt too — a printed "30/08/25" is
  // ambiguous without a reference year, and a receipt dated after today is a
  // misreading rather than a purchase.
  today: string;
};

export type ExtractionUsage = {
  // **המודל שבאמת ענה, מתוך התשובה, ולא הראשי שביקשנו.** מערך models
  // אומר שהתשובה עשויה להגיע מהגיבוי, ומשלמים על מי שענה. null כשהתשובה
  // לא כללה את השדה, כי "לא ידוע" עדיף על ייחוס שגוי בחשבון.
  model: string | null;
  costUsd: number | null;
};

// One result type for both entry points, because the four things that can
// happen to a call are the same four whether audio or an image went out.
// `transcript` is always null on the receipt route: the receipt schema does not
// ask for one, deliberately — the farmer is looking at the photograph, and
// transcribing a document he can already read would spend the output budget and
// truncate the answer he paid for. See the header of packages/shared/src/receipt.ts.
export type ExtractionResult =
  // הצלחה. raw הוא unknown ולא אובייקט מטופס, כי מי שמחליט אם הוא תקין
  // הוא parseVoiceResult בשכבה שמעל, ולא הקוד הזה.
  | { ok: true; raw: unknown; transcript: string | null; usage: ExtractionUsage }
  // רשת נפלה, OpenRouter החזיר שגיאה, או שהגוף אינו מה שהובטח. status
  // הוא null כשהבקשה לא הגיעה בכלל לשרת.
  | { ok: false; failure: 'upstream'; status: number | null; reason: string }
  // התשובה הגיעה ואפילו שולם עליה, אבל התוכן אינו JSON.
  | { ok: false; failure: 'parse'; reason: string; content: string; usage: ExtractionUsage };

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
function voiceInstructionText(kind: VoiceKind, today: string): string {
  return [
    `היום ${today}.`,
    `בהקלטה הבאה חקלאי מדבר עברית על ${KIND_SUBJECT[kind]}.`,
    'העתק את ההקלטה מילה במילה לשדה transcript, ורק אחר כך מלא את שאר השדות ממה שנאמר.',
    `כל תאריך בתשובה בפורמט YYYY-MM-DD, ו"היום", "אתמול" ו"שלשום" מחושבים ביחס ל-${today}.`,
    'שדה שלא נאמר בהקלטה מקבל null. אל תמציא ערכים ואל תשלים מידע שלא נשמע בהקלטה.',
  ].join(' ');
}

// **The date appears here for three separate jobs, not one.** It disambiguates a
// two-digit year on a printed receipt, it rules out a "purchase" dated in the
// future, and it is the fallback for a date that is genuinely unreadable —
// smudged thermal paper is ordinary, and the validator refuses a record with no
// date at all. Falling back to today is not the app guessing behind the
// farmer's back: prd.md section 3 sends every receipt through the confirmation
// sheet, and the sheet gives an expense's date an edit box (voiceConfirm.ts).
// Refusing the whole extraction over one smudged field would instead throw away
// a correctly read supplier and total, and charge him for the privilege.
function receiptInstructionText(today: string): string {
  return [
    `היום ${today}.`,
    'בתמונה הבאה קבלה או חשבונית של חקלאי, בדרך כלל בעברית.',
    'קרא ממנה את שם הספק, את תאריך הקבלה ואת הסכום הכולל לתשלום.',
    'הסכום הוא הסכום הסופי לתשלום כולל מע"מ, ולא שורת פריט בודדת ולא סכום ביניים.',
    `התאריך בפורמט YYYY-MM-DD, והוא לעולם אינו מאוחר מ-${today}.`,
    `אם התאריך אינו קריא בתמונה, החזר ${today} והחזר ודאות נמוכה.`,
    'שם ספק שאינו קריא מקבל null. אל תמציא ערכים ואל תשלים מידע שאינו מופיע בתמונה.',
  ].join(' ');
}

// The one content part that differs between the two routes. Everything else in
// the message is identical, which is why this is a parameter rather than a
// second requestBody.
type MediaPart =
  | { type: 'input_audio'; input_audio: { data: string; format: AudioFormat } }
  | { type: 'image_url'; image_url: { url: string } };

type BodyOptions = {
  // The provider-facing name of the schema. A latin identifier, not prose.
  schemaName: string;
  schema: object;
  instruction: string;
  media: MediaPart;
};

function requestBody(config: OpenRouterConfig, options: BodyOptions): object {
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
        name: options.schemaName,
        strict: true,
        // **The wire copy of the schema, never the canonical one.** Both routes
        // pass one: it strips minimum, maximum and exclusiveMinimum, which
        // providers of structured outputs answer with a 400. See the long
        // comment at the end of packages/shared/src/voice.ts.
        schema: options.schema,
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
          { type: 'text', text: options.instruction },
          options.media,
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
//
// **The core both entry points run through.** It knows nothing about audio,
// images or schemas — it posts a body and turns the answer into one of the four
// outcomes. That is the whole reason there is no second copy of this for
// receipts: every one of those four outcomes, and the exact line at which each
// is decided, is a fact about OpenRouter rather than about what was sent to it.
// ============================================================

async function callOpenRouter(
  config: OpenRouterConfig,
  body: object,
  fetchImpl: FetchLike,
): Promise<ExtractionResult> {
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
  const usage: ExtractionUsage = {
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

// ============================================================
// The two entry points. Each supplies the three values that differ and nothing
// else, which is the shape that keeps them honest: there is nowhere here for one
// route to quietly acquire a different temperature or a missing
// require_parameters.
// ============================================================

export function extractVoice(
  config: OpenRouterConfig,
  request: VoiceRequest,
  fetchImpl: FetchLike,
): Promise<ExtractionResult> {
  const body = requestBody(config, {
    schemaName: `voice_${request.kind}`,
    schema: voiceWireJsonSchema(request.kind),
    instruction: voiceInstructionText(request.kind, request.today),
    media: {
      type: 'input_audio',
      input_audio: { data: arrayBufferToBase64(request.audio), format: request.format ?? 'm4a' },
    },
  });

  return callOpenRouter(config, body, fetchImpl);
}

export function extractReceipt(
  config: OpenRouterConfig,
  request: ReceiptRequest,
  fetchImpl: FetchLike,
): Promise<ExtractionResult> {
  const body = requestBody(config, {
    schemaName: 'receipt',
    schema: receiptWireJsonSchema(),
    instruction: receiptInstructionText(request.today),
    media: {
      // **An image goes as an image_url content part carrying a data: URI, not
      // as a link.** There is no URL to give — the photograph is the request
      // body, it lives nowhere the provider could fetch it from, and handing
      // out a signed Storage URL would mean publishing a farmer's invoice to a
      // third party in order to read it. The mime type is the detected one, so
      // what the URI declares is always what the bytes actually are.
      type: 'image_url',
      image_url: {
        url: `data:${IMAGE_MIME_TYPES[request.format]};base64,${arrayBufferToBase64(request.image)}`,
      },
    },
  });

  return callOpenRouter(config, body, fetchImpl);
}
