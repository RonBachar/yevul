// טסטים לאינטגרציית OpenRouter, backend/worker/src/openrouter.ts.
//
// **אפס יציאה לרשת, ולא בזכות משמעת אלא בזכות המבנה.** extractVoice
// מקבל fetch כפרמטר, כלומר גם טסט ששכח להזריק מוק לא יכול לצאת החוצה,
// הוא פשוט לא יתקמפל. מעבר לזה beforeEach מתקין fetch גלובלי שזורק,
// כדי שאם מישהו יחזיר יום אחד את המודול לגלובל, כל הקובץ הזה ייפול
// מיד. כל קריאה אמיתית ל-OpenRouter היא כסף אמיתי.
//
// **הטסטים כאן בודקים גם את מה שנשלח ולא רק את מה שחוזר.** שלושה
// פרמטרים בגוף הבקשה, provider.require_parameters, מערך models, וסכמת
// החוט, הם ההבדל בין JSON מובנה לבין טקסט חופשי או 400, וכולם נראים
// נכון בקוד גם כשהם חסרים. לכן הם נבדקים מתוך הבקשה שנרשמה בפועל.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  arrayBufferToBase64,
  detectImageFormat,
  extractReceipt,
  extractVoice,
  IMAGE_FORMATS,
  type FetchInit,
  type FetchLike,
  type ImageFormat,
  type OpenRouterConfig,
  type ReceiptRequest,
  type VoiceRequest,
} from './openrouter';

import expenseSuccess from './__fixtures__/expense-success.json';
import journalFenced from './__fixtures__/journal-fenced.json';
import expenseTruncated from './__fixtures__/expense-truncated.json';
import emptyChoices from './__fixtures__/empty-choices.json';
import rateLimited from './__fixtures__/rate-limited.json';
import serverError from './__fixtures__/server-error.json';
import taskFromFallback from './__fixtures__/task-from-fallback.json';

const config: OpenRouterConfig = {
  apiKey: 'openrouter-key-for-tests',
  model: 'google/gemini-3.7-flash',
  fallbackModel: 'google/gemini-2.5-flash',
};

const TODAY = '2026-09-01';

// אודיו קצר ומזוהה, כדי שאפשר יהיה לחשב את ה-base64 הצפוי בטסט בדרך
// אחרת מזו של הקוד הנבדק. הבתים 0 ו-255 בפנים בכוונה, הם הקצוות של
// טווח הבית.
const AUDIO_BYTES = [0, 1, 2, 250, 251, 255];

function requestFor(kind: VoiceRequest['kind'] = 'expense'): VoiceRequest {
  return { kind, audio: new Uint8Array(AUDIO_BYTES).buffer, today: TODAY };
}

// ============================================================
// המוק. תשובה אחת, כי extractVoice עושה בדיוק קריאה אחת.
// ============================================================

type Stub = {
  status?: number;
  // גוף JSON, או טקסט גולמי כשבודקים גוף שאינו JSON בכלל, או שגיאה
  // שנזרקת במקום תשובה כשבודקים נפילת רשת.
  body?: unknown;
  text?: string;
  throws?: Error;
};

// מה שהקוד באמת שולח, כפי שהמוק רואה אותו. הטיפוס הזה הוא הצהרת
// כוונות של הטסט, ולכן הוא נכתב כאן ולא מיובא מהמודול: אם הוא ייגזר
// מהמודול, שינוי במודול היה משנה גם את הציפייה ולא היה נתפס.
type SentBody = {
  models: string[];
  provider: { require_parameters: boolean };
  response_format: {
    type: string;
    json_schema: {
      name: string;
      strict: boolean;
      schema: { required: string[]; properties: Record<string, unknown> };
    };
  };
  temperature: number;
  max_tokens: number;
  messages: {
    role: string;
    content: {
      type: string;
      text?: string;
      input_audio?: { data: string; format: string };
      image_url?: { url: string };
    }[];
  }[];
};

type RecordedCall = { url: string; init: FetchInit; body: SentBody };

function stubFetch(stub: Stub = {}): { fetchImpl: FetchLike; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];

  const fetchImpl: FetchLike = (url, init) => {
    // הפירוק כאן הוא גם אימות: גוף שאינו JSON תקין היה מפיל את המוק.
    calls.push({ url, init, body: JSON.parse(init.body) as SentBody });

    if (stub.throws) return Promise.reject(stub.throws);

    const payload = stub.text ?? JSON.stringify(stub.body ?? null);
    return Promise.resolve(new Response(payload, { status: stub.status ?? 200 }));
  };

  return { fetchImpl, calls };
}

function onlyCall(calls: RecordedCall[]): RecordedCall {
  const call = calls[0];
  // היעדר קריאה הוא כשל בטסט, ולא ציפייה שנכשלת מאוחר יותר על undefined.
  if (!call) throw new Error('הטסט ציפה לקריאה אחת ל-OpenRouter ולא נרשמה אף קריאה');
  return call;
}

// כל שמות המפתחות בעץ, בכל עומק. הבדיקה על מילות המפתח המספריות
// חייבת להיות עמוקה, כי הן יושבות בתוך properties ולא בשורש.
function keysDeep(node: unknown): string[] {
  if (Array.isArray(node)) return node.flatMap(keysDeep);
  if (typeof node !== 'object' || node === null) return [];
  return Object.entries(node).flatMap(([key, value]) => [key, ...keysDeep(value)]);
}

// **fetch גלובלי שזורק, לכל הטסטים בקובץ.** המודול אינו אמור לגעת בו
// אף פעם, ולכן כל נגיעה בו היא כשל רועש ולא בקשה שיוצאת בשקט לרשת.
beforeEach(() => {
  vi.stubGlobal('fetch', () => {
    throw new Error('openrouter.ts נגע ב-fetch הגלובלי במקום ב-fetch המוזרק');
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ============================================================
// בניית הבקשה.
// ============================================================

describe('openrouter, בניית הבקשה', () => {
  it('שולח POST לכתובת של OpenRouter עם הכותרות שהתיעוד מבקש', async () => {
    const { fetchImpl, calls } = stubFetch({ body: expenseSuccess });

    await extractVoice(config, requestFor(), fetchImpl);

    const call = onlyCall(calls);
    expect(call.url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(call.init.method).toBe('POST');
    expect(call.init.headers).toEqual({
      Authorization: 'Bearer openrouter-key-for-tests',
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://yevul.app',
      'X-Title': 'Yevul',
    });
  });

  // **הטסט הזה שומר על הדלת שדרכה נכנס טקסט חופשי במקום JSON.** בלי
  // require_parameters, response_format הוא רק העדפה רכה בבחירת ספק,
  // וספק שאינו תומך בו מחזיר 200 עם עברית חופשית. מי שימחק את השורה
  // הזו יום אחד לא יראה שום שגיאה, רק חילוצים שמתחילים להיכשל.
  it('שולח provider.require_parameters כ-true', async () => {
    const { fetchImpl, calls } = stubFetch({ body: expenseSuccess });

    await extractVoice(config, requestFor(), fetchImpl);

    expect(onlyCall(calls).body.provider).toEqual({ require_parameters: true });
  });

  // מערך ולא מודל יחיד, וסדר שבו הראשי ראשון. הפולבק האוטומטי עובד על
  // downtime ועל rate limit בלבד, ולכן סדר הפוך היה מעביר את כל התנועה
  // לגיבוי בשקט.
  it('שולח models כמערך של שניים, ראשי ואז גיבוי', async () => {
    const { fetchImpl, calls } = stubFetch({ body: expenseSuccess });

    await extractVoice(config, requestFor(), fetchImpl);

    expect(onlyCall(calls).body.models).toEqual([
      'google/gemini-3.7-flash',
      'google/gemini-2.5-flash',
    ]);
  });

  // **החיבור בין סכמת החוט לבין הבקשה בפועל.** voiceWireJsonSchema הוא
  // הפונקציה שמסירה את מילות המפתח המספריות, ו-voiceJsonSchema הוא
  // הפונקציה שמשאירה אותן. שתיהן מיוצאות, שתיהן נראות נכון בקוד, ורק
  // אחת מהן לא מפילה את הבקשה ב-400 אצל ספק שאינו הראשי.
  it('שולח את סכמת החוט, בלי מילות מפתח מספריות בשום עומק', async () => {
    for (const kind of ['expense', 'task', 'journal'] as const) {
      const { fetchImpl, calls } = stubFetch({ body: expenseSuccess });

      await extractVoice(config, requestFor(kind), fetchImpl);

      const keys = keysDeep(onlyCall(calls).body.response_format.json_schema.schema);
      expect(keys).not.toContain('minimum');
      expect(keys).not.toContain('maximum');
      expect(keys).not.toContain('exclusiveMinimum');
    }
  });

  // transcript הוא השדה שבלעדיו חילוץ שנכשל משאיר את החקלאי מול מסך
  // ריק במקום מול "זה מה ששמענו". בסכמה סגורה הוא חייב להיות גם
  // ב-required, אחרת ספקי structured outputs דוחים את הבקשה.
  it('שולח סכמה שיש בה transcript, גם ב-required וגם ב-properties', async () => {
    for (const kind of ['expense', 'task', 'journal'] as const) {
      const { fetchImpl, calls } = stubFetch({ body: expenseSuccess });

      await extractVoice(config, requestFor(kind), fetchImpl);

      const schema = onlyCall(calls).body.response_format.json_schema.schema;
      expect(schema.required).toContain('transcript');
      expect(Object.keys(schema.properties)).toContain('transcript');
    }
  });

  it('שם הסכמה הוא מזהה לטיני לפי הסוג', async () => {
    for (const kind of ['expense', 'task', 'journal'] as const) {
      const { fetchImpl, calls } = stubFetch({ body: expenseSuccess });

      await extractVoice(config, requestFor(kind), fetchImpl);

      const jsonSchema = onlyCall(calls).body.response_format.json_schema;
      expect(jsonSchema.name).toBe(`voice_${kind}`);
      expect(jsonSchema.strict).toBe(true);
    }
  });

  // בלי התאריך אין למודל שום דרך לפענח "אתמול", וכל רשומה כזו נדחית
  // אחר כך בוולידטור על תאריך פסול. ה-Worker רץ ב-UTC ולכן הוא לא יכול
  // לספק את התאריך בעצמו.
  it('טקסט ההנחיה כולל את התאריך של היום', async () => {
    const { fetchImpl, calls } = stubFetch({ body: expenseSuccess });

    await extractVoice(config, requestFor(), fetchImpl);

    const content = onlyCall(calls).body.messages[0]?.content ?? [];
    const text = content.find((part) => part.type === 'text')?.text ?? '';
    expect(text).toContain(TODAY);
  });

  it('שולח את האודיו כ-input_audio בפורמט m4a, מקודד base64', async () => {
    const { fetchImpl, calls } = stubFetch({ body: expenseSuccess });

    await extractVoice(config, requestFor(), fetchImpl);

    const content = onlyCall(calls).body.messages[0]?.content ?? [];
    const audioPart = content.find((part) => part.type === 'input_audio')?.input_audio;
    expect(audioPart?.format).toBe('m4a');
    // חישוב עצמאי, לא דרך arrayBufferToBase64, כדי שהטסט לא יאשר את
    // עצמו. על שישה בתים הדרך הנאיבית תקפה לגמרי.
    expect(audioPart?.data).toBe(btoa(String.fromCharCode(...AUDIO_BYTES)));
  });

  // ההנחיה לפני האודיו, ולא הפוך. מודל שקורא קודם מה מבקשים ממנו מקשיב
  // להקלטה כשהמשימה כבר ידועה לו.
  it('שולח הודעת user אחת, טקסט ואז אודיו', async () => {
    const { fetchImpl, calls } = stubFetch({ body: expenseSuccess });

    await extractVoice(config, requestFor(), fetchImpl);

    const messages = onlyCall(calls).body.messages;
    expect(messages).toHaveLength(1);
    expect(messages[0]?.role).toBe('user');
    expect(messages[0]?.content.map((part) => part.type)).toEqual(['text', 'input_audio']);
  });

  // temperature 0 כי זה חילוץ ולא כתיבה יוצרת, ותקרת טוקנים כי Gemini
  // מחייב על טוקני חשיבה במחיר טוקני פלט, ובלי תקרה חשבון קריאה בודדת
  // יכול לצאת פי כמה מהמשוער.
  it('שולח temperature אפס ותקרת טוקני פלט', async () => {
    const { fetchImpl, calls } = stubFetch({ body: expenseSuccess });

    await extractVoice(config, requestFor(), fetchImpl);

    const body = onlyCall(calls).body;
    expect(body.temperature).toBe(0);
    expect(body.max_tokens).toBe(400);
  });
});

// ============================================================
// פירוק התשובה.
// ============================================================

describe('openrouter, פירוק התשובה', () => {
  it('תשובה תקינה מחזירה את האובייקט הגולמי, את התמלול, את המודל ואת העלות', async () => {
    const { fetchImpl } = stubFetch({ body: expenseSuccess });

    const result = await extractVoice(config, requestFor(), fetchImpl);

    expect(result).toEqual({
      ok: true,
      raw: {
        transcript: 'קניתי היום דשן בחמש מאות שקל לחלקה הדרומית',
        amount: 500,
        name: 'דשן',
        plotName: 'הדרומית',
        date: '2026-09-01',
        confidence: 0.92,
        hasMoreItems: false,
      },
      transcript: 'קניתי היום דשן בחמש מאות שקל לחלקה הדרומית',
      usage: { model: 'google/gemini-3.7-flash', costUsd: 0.00042 },
    });
  });

  // **הוולידציה אינה כאן, וזה נבדק ולא רק נאמר בהערה.** אובייקט
  // שהוולידטור היה דוחה, סכום שלילי ותאריך מומצא, עדיין חוזר מכאן
  // כהצלחה, כי התפקיד של המודול הזה הוא לדבר עם OpenRouter ולא לשפוט
  // את התוכן. פיצול השכבות הוא מה שמאפשר להבדיל בין "OpenRouter נפל"
  // לבין "המודל ענה שטויות".
  it('אינו מריץ את הוולידטורים, ומחזיר גם אובייקט שהם היו דוחים', async () => {
    const { fetchImpl } = stubFetch({
      body: {
        model: 'google/gemini-3.7-flash',
        choices: [{ message: { content: '{"amount":-5,"date":"אתמול"}' } }],
        usage: { cost: 0.0001 },
      },
    });

    const result = await extractVoice(config, requestFor(), fetchImpl);

    expect(result.ok).toBe(true);
    expect(result.ok && result.raw).toEqual({ amount: -5, date: 'אתמול' });
    // אין transcript באובייקט הזה, ולכן אין מה להציג, אבל זו אינה שגיאה.
    expect(result.ok && result.transcript).toBe(null);
  });

  // JSON תקין בעטיפה שגויה. דחייה כאן הייתה שולחת את החקלאי להקליט
  // מחדש ולשלם שוב על תשובה שכבר הייתה נכונה.
  it('חותך גדרות markdown ומפענח את מה שבפנים', async () => {
    const { fetchImpl } = stubFetch({ body: journalFenced });

    const result = await extractVoice(config, requestFor('journal'), fetchImpl);

    expect(result.ok).toBe(true);
    expect(result.ok && result.raw).toMatchObject({
      date: '2026-08-31',
      type: 'spray',
      sprayMaterial: 'מובנטו',
      sprayPhiDays: 14,
    });
    expect(result.ok && result.transcript).toContain('רססתי');
  });

  // תשובה שנחתכה ב-max_tokens. **התוכן חוזר עם הכשל**, כי בלי הטקסט
  // אי אפשר להבדיל בין חיתוך לבין מודל שהתעלם מהסכמה, ואלה שתי תקלות
  // שונות לגמרי. גם העלות חוזרת, כי שילמנו על התשובה החתוכה הזו.
  it('תשובה חתוכה באמצע מחזירה כשל פירוק עם התוכן והעלות', async () => {
    const { fetchImpl } = stubFetch({ body: expenseTruncated });

    const result = await extractVoice(config, requestFor(), fetchImpl);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.failure).toBe('parse');
    expect(!result.ok && result.failure === 'parse' && result.content).toContain('"amount":500');
    expect(!result.ok && result.failure === 'parse' && result.usage).toEqual({
      model: 'google/gemini-3.7-flash',
      costUsd: 0.00118,
    });
  });

  // טקסט חופשי בעברית במקום JSON, כלומר בדיוק מה שקורה כשספק מתעלם
  // מ-response_format. זו הסיבה ש-require_parameters נשלח.
  it('טקסט חופשי במקום JSON מחזיר כשל פירוק', async () => {
    const { fetchImpl } = stubFetch({
      body: {
        model: 'google/gemini-3.7-flash',
        choices: [{ message: { content: 'החקלאי אמר שהוא קנה דשן בחמש מאות שקל.' } }],
        usage: { cost: 0.0003 },
      },
    });

    const result = await extractVoice(config, requestFor(), fetchImpl);

    expect(!result.ok && result.failure).toBe('parse');
  });

  // 200 עם choices ריק הוא הפרה של הפרוטוקול ולא תוכן פגום, ולכן זה
  // כשל upstream ולא כשל פירוק. אין כאן שום דבר לפרק.
  it('choices ריק מחזיר כשל upstream', async () => {
    const { fetchImpl } = stubFetch({ body: emptyChoices });

    const result = await extractVoice(config, requestFor(), fetchImpl);

    expect(result).toEqual({
      ok: false,
      failure: 'upstream',
      status: 200,
      reason: 'no message content in response',
    });
  });

  it('429 מ-OpenRouter מחזיר כשל upstream עם הסטטוס וההודעה', async () => {
    const { fetchImpl } = stubFetch({ status: 429, body: rateLimited });

    const result = await extractVoice(config, requestFor(), fetchImpl);

    expect(result).toEqual({
      ok: false,
      failure: 'upstream',
      status: 429,
      reason: 'Rate limit exceeded: provider google is temporarily rate limited',
    });
  });

  it('500 מ-OpenRouter מחזיר כשל upstream עם הסטטוס וההודעה', async () => {
    const { fetchImpl } = stubFetch({ status: 500, body: serverError });

    const result = await extractVoice(config, requestFor(), fetchImpl);

    expect(result).toEqual({
      ok: false,
      failure: 'upstream',
      status: 500,
      reason: 'Provider returned error',
    });
  });

  // דף שגיאה של פרוקסי או של שכבת CDN בדרך, כלומר גוף שאינו JSON בכלל.
  // response.json() זורק, וזה חייב להיות כשל upstream ולא קריסה.
  it('גוף שאינו JSON בכלל מחזיר כשל upstream ולא זורק', async () => {
    const { fetchImpl } = stubFetch({ text: '<html><body>502 Bad Gateway</body></html>' });

    const result = await extractVoice(config, requestFor(), fetchImpl);

    expect(result).toEqual({
      ok: false,
      failure: 'upstream',
      status: 200,
      reason: 'response body is not json',
    });
  });

  // שגיאה בקוד לא-200 שגופה אינו JSON. כאן אין הודעה לקרוא, ולכן הקוד
  // עצמו הוא ההודעה, ובלבד שלא נופלים.
  it('שגיאה עם גוף שאינו JSON מחזירה את הסטטוס בלבד', async () => {
    const { fetchImpl } = stubFetch({ status: 502, text: 'Bad Gateway' });

    const result = await extractVoice(config, requestFor(), fetchImpl);

    expect(result).toEqual({
      ok: false,
      failure: 'upstream',
      status: 502,
      reason: 'openrouter returned 502',
    });
  });

  // נפילת רשת, כלומר fetch שזרק. status הוא null כי הבקשה לא הגיעה
  // בכלל לשרת, וזה מידע אחר מ-500.
  it('נפילת רשת מחזירה כשל upstream בלי סטטוס', async () => {
    const { fetchImpl } = stubFetch({ throws: new TypeError('fetch failed') });

    const result = await extractVoice(config, requestFor(), fetchImpl);

    expect(result).toEqual({
      ok: false,
      failure: 'upstream',
      status: null,
      reason: 'fetch failed',
    });
  });

  // **המודל שבאמת ענה, ולא זה שביקשנו.** מערך models אומר שהתשובה
  // עשויה להגיע מהגיבוי, ומשלמים על מי שענה. ייחוס לראשי היה הופך את
  // רישום העלויות לשקר שקט.
  it('תשובה מהגיבוי מדווחת את הגיבוי ולא את המודל הראשי', async () => {
    const { fetchImpl } = stubFetch({ body: taskFromFallback });

    const result = await extractVoice(config, requestFor('task'), fetchImpl);

    expect(result.ok && result.usage).toEqual({
      model: 'google/gemini-2.5-flash',
      costUsd: 0.00026,
    });
    expect(result.ok && result.usage.model).not.toBe(config.model);
  });

  // תשובה בלי usage אינה שגיאה, היא פשוט עלות לא ידועה. אפס היה נרשם
  // כקריאה חינם, וזה שקר.
  it('תשובה בלי usage מחזירה עלות null ולא אפס', async () => {
    const { fetchImpl } = stubFetch({
      body: {
        model: 'google/gemini-3.7-flash',
        choices: [{ message: { content: '{"transcript":"שלום"}' } }],
      },
    });

    const result = await extractVoice(config, requestFor(), fetchImpl);

    expect(result.ok && result.usage).toEqual({ model: 'google/gemini-3.7-flash', costUsd: null });
  });
});

// ============================================================
// המרת האודיו ל-base64.
// ============================================================

describe('openrouter, base64', () => {
  it('באפר ריק מחזיר מחרוזת ריקה', () => {
    expect(arrayBufferToBase64(new Uint8Array([]).buffer)).toBe('');
  });

  it('באפר קטן זהה לחישוב הישיר', () => {
    const bytes = new Uint8Array(AUDIO_BYTES);
    expect(arrayBufferToBase64(bytes.buffer)).toBe(btoa(String.fromCharCode(...AUDIO_BYTES)));
  });

  // **הטסט שמצדיק את לולאת החלקים.** 400KB הוא הגודל של הקלטת אודיו
  // אמיתית של כדקה, כלומר מסלול הרוב ולא מקרה קצה, והדרך הנאיבית זורקת
  // עליו RangeError כי היא מעמיסה איבר לאיבר על מחסנית הקריאות.
  it('באפר בגודל של הקלטה אמיתית עובר, בעוד שהפריסה הנאיבית זורקת', () => {
    const bytes = new Uint8Array(400_000);
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = (i * 31 + 7) % 256;

    expect(() => String.fromCharCode(...bytes)).toThrow(RangeError);
    expect(() => arrayBufferToBase64(bytes.buffer)).not.toThrow();
  });

  // נכונות ולא רק היעדר קריסה. הפענוח חזרה חייב להחזיר בדיוק את אותם
  // בתים, אחרת גבול בין חלקים היה יכול לשבור בשקט את הקידוד.
  it('באפר גדול עובר הלוך ושוב בלי לאבד ולו בית אחד', () => {
    const bytes = new Uint8Array(400_000);
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = (i * 31 + 7) % 256;

    const decoded = atob(arrayBufferToBase64(bytes.buffer));

    expect(decoded).toHaveLength(bytes.length);
    let firstMismatch = -1;
    for (let i = 0; i < bytes.length; i += 1) {
      if (decoded.charCodeAt(i) !== bytes[i]) {
        firstMismatch = i;
        break;
      }
    }
    expect(firstMismatch).toBe(-1);
  });
});

// ============================================================
// ההזרקה עצמה.
// ============================================================

describe('openrouter, fetch מוזרק', () => {
  // **זו ההבטחה המרכזית של המודול.** כל קריאה אמיתית ל-OpenRouter היא
  // חיוב בכרטיס אשראי, ולכן לא מספיק שהמוק נקרא, צריך גם שהגלובל לא
  // ייגע. הטסט הזה נכשל ברגע שמישהו יחזיר קריאה ישירה ל-fetch.
  it('אינו נוגע ב-fetch הגלובלי גם במסלול המלא', async () => {
    const globalFetch = vi.fn(() => {
      throw new Error('יציאה לרשת');
    });
    vi.stubGlobal('fetch', globalFetch);
    const { fetchImpl, calls } = stubFetch({ body: expenseSuccess });

    const result = await extractVoice(config, requestFor(), fetchImpl);

    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(globalFetch).not.toHaveBeenCalled();
  });

  // בדיקת טיפוסים במסווה של טסט. FetchLike הוא חתימה מצומצמת, ואם היא
  // תיסחף יום אחד למקום שה-fetch של workerd אינו עונה עליו, השורה הזו
  // לא תתקמפל. בלעדיה השבירה הייתה מתגלה רק בשכבת החיווט, שם מזריקים
  // את ה-fetch האמיתי.
  it('החתימה המצומצמת עדיין מקבלת את ה-fetch של הסביבה', () => {
    const injectable: FetchLike = fetch;
    expect(typeof injectable).toBe('function');
  });
});

// ============================================================
// Detecting the image format from the bytes.
//
// **The endpoint detects rather than believes, and this is what makes that
// safe.** A client that mislabels a PNG as a JPEG would otherwise produce a 400
// from the provider, which the wiring layer maps to a 502 — after the farm's
// monthly counter has already been incremented for a scan that never happened.
// ============================================================

function bufferOf(bytes: number[]): ArrayBuffer {
  return new Uint8Array(bytes).buffer;
}

// A magic number followed by a recognisable tail that includes both ends of the
// byte range, so a base64 computed independently in a test would disagree with a
// buggy encoder rather than happening to match.
function withTail(magic: number[]): number[] {
  return [...magic, 0x00, 0x01, 0x7f, 0xfe, 0xff];
}

const JPEG_BYTES = withTail([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG_BYTES = withTail([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x0d]);
// "RIFF", four bytes of length, "WEBP", then a chunk header.
const WEBP_BYTES = withTail([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38,
]);

describe('openrouter, detectImageFormat', () => {
  const recognised: [string, number[], ImageFormat][] = [
    ['a jpeg from a phone camera', JPEG_BYTES, 'jpeg'],
    ['a png screenshot or scan', PNG_BYTES, 'png'],
    ['a webp from a browser or gallery', WEBP_BYTES, 'webp'],
  ];

  for (const [name, bytes, format] of recognised) {
    it(`recognises ${name}`, () => {
      expect(detectImageFormat(bufferOf(bytes))).toBe(format);
    });
  }

  it('recognises exactly the formats it advertises, and no others', () => {
    const detected = recognised.map(([, , format]) => format);
    expect([...detected].sort()).toEqual([...IMAGE_FORMATS].sort());
  });

  // The two a farmer genuinely holds and this endpoint deliberately does not
  // read: a PDF goes through a separately priced document parsing plugin, and
  // HEIC support is uneven across providers. Both are still storable by
  // attachReceipt; only OCR refuses them, and it refuses them for free.
  const refused: [string, number[]][] = [
    ['a pdf invoice', [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]],
    ['an iphone heic', [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]],
    ['a gif', [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x00, 0xff]],
    ['a tiff', [0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00]],
    ['plain text', [0x68, 0x65, 0x6c, 0x6c, 0x6f]],
    ['an empty upload', []],
  ];

  for (const [name, bytes] of refused) {
    it(`refuses ${name}`, () => {
      expect(detectImageFormat(bufferOf(bytes))).toBe(null);
    });
  }

  // **"RIFF" alone is not WEBP**, it is also a WAV file — which is a format the
  // *voice* endpoint accepts, so an upload to the wrong endpoint is a realistic
  // mistake rather than an invented one.
  it('refuses a RIFF container whose payload is not WEBP', () => {
    const wav = [0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45];
    expect(detectImageFormat(bufferOf(wav))).toBe(null);
  });

  // A magic number that is cut short is not a match. Reading past the end of a
  // three-byte upload would be the classic way to turn a truncated file into a
  // confident wrong answer.
  it('refuses a header too short to be conclusive', () => {
    expect(detectImageFormat(bufferOf([0xff, 0xd8]))).toBe(null);
    expect(detectImageFormat(bufferOf([0x89, 0x50, 0x4e]))).toBe(null);
    // "RIFF" and then nothing: the WEBP check reads at offset 8.
    expect(detectImageFormat(bufferOf([0x52, 0x49, 0x46, 0x46]))).toBe(null);
  });
});

// ============================================================
// The receipt route. Same core, one different content part.
// ============================================================

const RECEIPT_TODAY = '2026-09-02';

function receiptFor(bytes: number[] = JPEG_BYTES, format: ImageFormat = 'jpeg'): ReceiptRequest {
  return { image: bufferOf(bytes), format, today: RECEIPT_TODAY };
}

function imageUrlOf(call: RecordedCall): string {
  const part = call.body.messages[0]?.content.find((entry) => entry.type === 'image_url');
  const url = part?.image_url?.url;
  if (!url) throw new Error('the request carried no image_url content part');
  return url;
}

describe('openrouter, extractReceipt', () => {
  // **An image goes as a data: URI, not as a link.** There is no URL to give —
  // the photograph is the request body — and handing out a signed Storage URL
  // would mean publishing a farmer's invoice to a third party to read it.
  it('sends the image as an image_url content part carrying a data URI', async () => {
    const { fetchImpl, calls } = stubFetch({ body: expenseSuccess });

    await extractReceipt(config, receiptFor(), fetchImpl);

    expect(imageUrlOf(onlyCall(calls))).toBe(
      // Computed independently of the code under test. On these few bytes the
      // naive form is perfectly valid.
      `data:image/jpeg;base64,${btoa(String.fromCharCode(...JPEG_BYTES))}`,
    );
  });

  it('declares the mime type of the format it was given', async () => {
    const cases: [ImageFormat, number[], string][] = [
      ['jpeg', JPEG_BYTES, 'data:image/jpeg;base64,'],
      ['png', PNG_BYTES, 'data:image/png;base64,'],
      ['webp', WEBP_BYTES, 'data:image/webp;base64,'],
    ];

    for (const [format, bytes, prefix] of cases) {
      const { fetchImpl, calls } = stubFetch({ body: expenseSuccess });

      await extractReceipt(config, receiptFor(bytes, format), fetchImpl);

      expect(imageUrlOf(onlyCall(calls)).startsWith(prefix), format).toBe(true);
    }
  });

  // A real photograph crosses the 32KB chunk boundary many times, which is the
  // reason arrayBufferToBase64 has a loop rather than a spread. Decoding it back
  // here proves the loop is correct on this route too.
  it('sends a full sized photograph through without losing a byte', async () => {
    const bytes = new Uint8Array(300_000);
    bytes.set(JPEG_BYTES);
    for (let i = JPEG_BYTES.length; i < bytes.length; i += 1) bytes[i] = (i * 31 + 7) % 256;
    const { fetchImpl, calls } = stubFetch({ body: expenseSuccess });

    await extractReceipt(
      config,
      { image: bytes.buffer, format: 'jpeg', today: RECEIPT_TODAY },
      fetchImpl,
    );

    const decoded = atob(imageUrlOf(onlyCall(calls)).slice('data:image/jpeg;base64,'.length));
    expect(decoded).toHaveLength(bytes.length);
    let firstMismatch = -1;
    for (let i = 0; i < bytes.length; i += 1) {
      if (decoded.charCodeAt(i) !== bytes[i]) {
        firstMismatch = i;
        break;
      }
    }
    expect(firstMismatch).toBe(-1);
  });

  // The instruction before the image, for the same reason it comes before the
  // audio: a model that reads the task first looks at the document already
  // knowing what it is looking for.
  it('sends one user message, the instruction and then the image', async () => {
    const { fetchImpl, calls } = stubFetch({ body: expenseSuccess });

    await extractReceipt(config, receiptFor(), fetchImpl);

    const messages = onlyCall(calls).body.messages;
    expect(messages).toHaveLength(1);
    expect(messages[0]?.role).toBe('user');
    expect(messages[0]?.content.map((part) => part.type)).toEqual(['text', 'image_url']);
  });

  // The date bounds a two-digit printed year, rules out a receipt dated in the
  // future, and is the fallback for a date that is genuinely unreadable.
  it('puts today into the instruction text', async () => {
    const { fetchImpl, calls } = stubFetch({ body: expenseSuccess });

    await extractReceipt(config, receiptFor(), fetchImpl);

    const content = onlyCall(calls).body.messages[0]?.content ?? [];
    expect(content.find((part) => part.type === 'text')?.text).toContain(RECEIPT_TODAY);
  });

  // **The same door voice's test guards.** Without require_parameters,
  // response_format is only a soft preference and a provider that ignores it
  // answers 200 with free Hebrew text instead of JSON. Deleting the line
  // produces no error, only extractions that start failing.
  it('sends the same provider settings the voice route sends', async () => {
    const { fetchImpl, calls } = stubFetch({ body: expenseSuccess });

    await extractReceipt(config, receiptFor(), fetchImpl);

    const body = onlyCall(calls).body;
    expect(body.provider).toEqual({ require_parameters: true });
    expect(body.models).toEqual(['google/gemini-3.7-flash', 'google/gemini-2.5-flash']);
    expect(body.temperature).toBe(0);
    expect(body.max_tokens).toBe(400);
  });

  it('sends the same headers and the same url', async () => {
    const { fetchImpl, calls } = stubFetch({ body: expenseSuccess });

    await extractReceipt(config, receiptFor(), fetchImpl);

    const call = onlyCall(calls);
    expect(call.url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(call.init.method).toBe('POST');
    expect(call.init.headers).toEqual({
      Authorization: 'Bearer openrouter-key-for-tests',
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://yevul.app',
      'X-Title': 'Yevul',
    });
  });

  // The wire copy, for the same reason the voice route sends one: the request
  // goes out with a fallback model behind it, and a provider that sees a numeric
  // bound keyword rejects the whole request with a 400.
  it('sends the receipt wire schema, with no numeric bound keywords at any depth', async () => {
    const { fetchImpl, calls } = stubFetch({ body: expenseSuccess });

    await extractReceipt(config, receiptFor(), fetchImpl);

    const jsonSchema = onlyCall(calls).body.response_format.json_schema;
    expect(jsonSchema.name).toBe('receipt');
    expect(jsonSchema.strict).toBe(true);

    const keys = keysDeep(jsonSchema.schema);
    expect(keys).not.toContain('minimum');
    expect(keys).not.toContain('maximum');
    expect(keys).not.toContain('exclusiveMinimum');
  });

  // The farmer is holding the photograph. Asking the model to also transcribe
  // the document would spend the 400 token output budget on text he can already
  // read, and the way that budget runs out is a truncated answer he paid for.
  it('does not ask for a transcript, and asks for no plot or "more items" flag', async () => {
    const { fetchImpl, calls } = stubFetch({ body: expenseSuccess });

    await extractReceipt(config, receiptFor(), fetchImpl);

    const schema = onlyCall(calls).body.response_format.json_schema.schema;
    expect(Object.keys(schema.properties)).toEqual(['name', 'date', 'amount', 'confidence']);
    expect(schema.required).not.toContain('transcript');
  });

  // The core is shared, so the four failure shapes are shared too. Spot-checked
  // rather than re-enumerated: the exhaustive versions are on the voice route
  // above, and both routes now run through the same callOpenRouter.
  it('reports upstream failures through the same shape the voice route uses', async () => {
    const { fetchImpl } = stubFetch({ status: 429, body: rateLimited });

    const result = await extractReceipt(config, receiptFor(), fetchImpl);

    expect(result).toEqual({
      ok: false,
      failure: 'upstream',
      status: 429,
      reason: 'Rate limit exceeded: provider google is temporarily rate limited',
    });
  });

  // Markdown fences come off on this route too, and the validators still do not
  // run here — the raw object comes back for the layer above to judge.
  it('strips a markdown fence and returns the raw object without validating it', async () => {
    const { fetchImpl } = stubFetch({
      body: {
        model: 'google/gemini-2.5-flash',
        choices: [
          { message: { content: '```json\n{"name":"סונול","amount":-5,"date":"אתמול"}\n```' } },
        ],
        usage: { cost: 0.00021 },
      },
    });

    const result = await extractReceipt(config, receiptFor(), fetchImpl);

    expect(result.ok).toBe(true);
    expect(result.ok && result.raw).toEqual({ name: 'סונול', amount: -5, date: 'אתמול' });
    // No transcript on this route, structurally. It is not an error, there is
    // simply nothing of the sort to display.
    expect(result.ok && result.transcript).toBe(null);
  });

  it('does not touch the global fetch', async () => {
    const globalFetch = vi.fn(() => {
      throw new Error('יציאה לרשת');
    });
    vi.stubGlobal('fetch', globalFetch);
    const { fetchImpl, calls } = stubFetch({ body: expenseSuccess });

    const result = await extractReceipt(config, receiptFor(), fetchImpl);

    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(globalFetch).not.toHaveBeenCalled();
  });
});
