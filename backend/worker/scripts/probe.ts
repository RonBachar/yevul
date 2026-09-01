// סקריפט probe ידני, שלב 5, צעד 5. **הצעד הראשון בתוכנית שעולה כסף.**
//
// הוא קיים כדי לענות בקריאה אחת אמיתית על מה שאי אפשר לדעת ממוק: האם
// מזהה המודל שרשום ב-wrangler.toml בכלל קיים אצל הספק היום, האם הוא
// מקבל input_audio כ-base64, האם response_format שורד או שחוזר טקסט
// חופשי במקום JSON, האם סכמת החוט עוברת בלי 400, ומה usage.cost בפועל.
//
// **הוא מריץ את extractVoice האמיתי ולא עותק שלו.** probe שבונה בקשה
// משלו בודק את עצמו ולא את המוצר, וזו בדיוק הטעות שהופכת בדיקה ידנית
// לחסרת ערך.
//
// **לעולם לא ב-CI.** הוא חסום מאחורי משתנה סביבה, כי כל ריצה מחייבת
// כרטיס אשראי אמיתי. הרצה:
//
//   OPENROUTER_PROBE=1 node scripts/probe.mjs <audio-file> [kind] [model...]
//
// המפתח נקרא מ-backend/worker/.dev.vars, אותו קובץ ש-wrangler dev קורא,
// כדי שלא יהיה עותק שני של הסוד במקום אחר.

import { readFileSync } from 'node:fs';
import { extractVoice, type AudioFormat, type OpenRouterConfig } from '../src/openrouter';
import { parseVoiceResult, VOICE_KINDS, type VoiceKind } from '@yevul/shared/src/voice';

const DEV_VARS = new URL('../.dev.vars', import.meta.url);

// קורא רק את המפתח ולא מדפיס אותו לעולם. ההדפסה היחידה היא האורך
// והקידומת, כדי שאפשר יהיה לאבחן "המפתח לא נטען" בלי לחשוף אותו בלוג.
function readApiKey(): string {
  const text = readFileSync(DEV_VARS, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*OPENROUTER_API_KEY\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const value = (match[1] ?? '').trim().replace(/^["']|["']$/g, '');
    if (value !== '') return value;
  }
  throw new Error('OPENROUTER_API_KEY is missing or empty in backend/worker/.dev.vars');
}

const EXTENSION_FORMAT: Record<string, AudioFormat> = {
  m4a: 'm4a',
  mp3: 'mp3',
  wav: 'wav',
  ogg: 'ogg',
  flac: 'flac',
  webm: 'webm',
  aac: 'aac',
};

function formatFromPath(path: string): AudioFormat {
  const extension = path.split('.').pop()?.toLowerCase() ?? '';
  const format = EXTENSION_FORMAT[extension];
  if (!format) throw new Error(`unsupported audio extension: ${extension}`);
  return format;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// חותך תשובה ארוכה בלוג. הפלט אמור להיקרא בעין, לא להישמר.
function preview(value: unknown, max = 600): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return text.length > max ? `${text.slice(0, max)}\n  ... (${text.length} chars)` : text;
}

async function probeModel(
  apiKey: string,
  model: string,
  kind: VoiceKind,
  audio: ArrayBuffer,
  format: AudioFormat,
): Promise<void> {
  // הגיבוי מכוון לאותו מודל בכוונה. probe שנופל בשקט לגיבוי היה עונה
  // על השאלה "האם משהו עובד" במקום על "האם המודל הזה עובד".
  const config: OpenRouterConfig = { apiKey, model, fallbackModel: model };

  console.log(`\n${'='.repeat(70)}\nמודל: ${model}\n${'='.repeat(70)}`);

  const startedAt = Date.now();
  const result = await extractVoice(config, { kind, audio, today: today(), format }, fetch);
  const elapsedMs = Date.now() - startedAt;

  console.log(`זמן תגובה: ${elapsedMs} ms`);

  if (!result.ok && result.failure === 'upstream') {
    console.log(`תוצאה: כשל upstream, status ${result.status ?? 'none'}`);
    console.log(`סיבה: ${result.reason}`);
    return;
  }

  if (!result.ok) {
    console.log('תוצאה: התשובה הגיעה אבל אינה JSON');
    console.log(`סיבה: ${result.reason}`);
    console.log(`מודל שענה: ${result.usage.model ?? 'לא ידוע'}`);
    console.log(`עלות: ${result.usage.costUsd ?? 'לא ידוע'}`);
    console.log(`תוכן גולמי:\n${preview(result.content)}`);
    return;
  }

  console.log('תוצאה: JSON תקין חזר');
  console.log(`מודל שענה: ${result.usage.model ?? 'לא ידוע'}`);
  console.log(`עלות: ${result.usage.costUsd ?? 'לא ידוע'} דולר`);
  console.log(`תמלול: ${result.transcript ?? 'אין'}`);
  console.log(`אובייקט גולמי:\n${preview(result.raw)}`);

  // **הבדיקה שבאמת חשובה.** JSON תקין אינו אומר שהוא עבר את הוולידטור,
  // וזה בדיוק ההבדל בין "המודל ענה" לבין "אפשר לשמור את זה במסד".
  const parsed = parseVoiceResult(kind, result.raw);
  console.log(parsed.ok ? 'ולידטור: עבר' : `ולידטור: נדחה, ${parsed.reason}`);
}

async function main(): Promise<void> {
  if (process.env.OPENROUTER_PROBE !== '1') {
    throw new Error('refusing to run without OPENROUTER_PROBE=1, every run costs real money');
  }

  const [audioPath, kindArg, ...models] = process.argv.slice(2);
  if (!audioPath) throw new Error('usage: probe.mjs <audio-file> [kind] [model...]');

  const kind = (kindArg ?? 'expense') as VoiceKind;
  if (!VOICE_KINDS.includes(kind)) throw new Error(`unknown kind: ${kind}`);

  const apiKey = readApiKey();
  const format = formatFromPath(audioPath);
  const bytes = readFileSync(audioPath);
  const audio = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

  console.log(`קובץ: ${audioPath}`);
  console.log(`גודל: ${bytes.byteLength} בתים, פורמט ${format}`);
  console.log(`סוג רישום: ${kind}`);
  console.log(`תאריך שנשלח למודל: ${today()}`);
  console.log(`מפתח: ${apiKey.length} תווים, מתחיל ב-${apiKey.slice(0, 9)}`);

  const targets = models.length > 0 ? models : ['google/gemini-3.7-flash'];
  for (const model of targets) {
    await probeModel(apiKey, model, kind, audio as ArrayBuffer, format);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
