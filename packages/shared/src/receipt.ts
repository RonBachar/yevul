// The receipt OCR schema, stage 5, docs/roadmap.md: "OCR לקבלות, אותו Worker,
// אותה מכסה חודשית משותפת עם הקול" — receipts through the same Worker, against
// the same monthly quota as voice.
//
// **A receipt is an expense, so it reuses the expense contract rather than
// copying it.** prd.md line 121 names the three things the app reads off a
// photographed invoice: the supplier, the amount and the date. prd.md section 3
// then says that everything understood "מקול או מקבלה", from voice *or from a
// receipt*, is shown to the farmer for confirmation before it goes in. There is
// one confirmation sheet in this product (voiceConfirm.ts, step 9) and one
// expense row in the database, and the record a receipt produces is not merely
// similar to the record a spoken expense produces — it is the same record, in
// the same columns, confirmed on the same screen and written by the same
// createExpense call.
//
// So of the three parts a schema has in this codebase, two are shared verbatim:
//
//   1. **The type** is VoiceExpense, unchanged, re-exported below so a reader of
//      this file sees all three parts without leaving it.
//   2. **The validator** is parseVoiceExpense, unchanged, wrapped here only to
//      hand back the same { kind, value } envelope parseVoiceResult produces.
//   3. **The JSON schema sent to the model is receipt-specific**, and it is the
//      only part that differs — because the one real difference between the two
//      routes is not what the app stores, it is what the model is told to look
//      for. A photograph of an invoice is not a spoken sentence, and the field
//      descriptions are how that gets said.
//
// **The argument against reuse, and why it loses.** A receipt has a supplier,
// and a supplier is not the same idea as "what was bought". True — but both land
// in the identical place: expenses.category, free text, the same column the
// manual form fills (there are no categories in this product; the picker was cut
// in stage 3, see the comment at the top of voice.ts). A second type carrying a
// `supplier` field instead of `name` would differ from VoiceExpense in the
// spelling of one key and in nothing else, and it would buy a second validator,
// a fourth arm on VoiceParsed, a second branch in voiceEditableFields, and a
// second voiceExpenseInput — an entire parallel confirmation path for a row that
// is byte-for-byte the same in Postgres. The distinction is real and it is
// carried where it belongs: in the description the model reads.
//
// **Two fields VoiceExpense has are deliberately not asked of the model.**
// `plotName`, because an invoice does not say which plot the diesel was for, and
// `hasMoreItems`, because a receipt is one document with one total and there is
// no second receipt hiding behind it. parseVoiceExpense already turns an absent
// plotName into null and an absent hasMoreItems into false, which are exactly
// the right answers, so leaving them out of the schema costs nothing and stops
// the model inventing either one.
//
// **There is no `transcript` here, and that is not an oversight.** The voice
// wire schema adds one because audio cannot be shown back to the farmer, so
// without it a failed extraction leaves him facing an empty screen instead of
// "this is what we heard" (see the long comment at the end of voice.ts). A
// receipt is different: the farmer is looking at the photograph he just took.
// Asking the model to also transcribe the whole document would spend the output
// budget — MAX_OUTPUT_TOKENS in the Worker's openrouter.ts is 400 — on text he
// can already read, and the failure that budget overrun produces is a truncated
// answer, i.e. a scan he paid for and cannot use.

import {
  parseVoiceExpense,
  withoutNumericBounds,
  VOICE_EXPENSE_JSON_SCHEMA,
  type VoiceParsed,
  type VoiceParseResult,
} from './voice';

// Part one of three. The receipt route produces exactly this record; see the
// header for why it is not a near-identical twin of it.
export type { VoiceExpense } from './voice';

// ============================================================
// Part two, the JSON schema sent to the model.
//
// **Field order is the extraction order, not decoration.** In structured
// outputs the model emits properties in the order they appear, so each field is
// generated with the earlier ones already written. The order here is the order a
// receipt is read: whose it is, when it was issued, what it came to. Confidence
// is last because it is a judgement about the three above it, and a model asked
// to rate an answer it has not written yet is guessing about itself.
//
// additionalProperties: false and a `required` that lists every field, including
// the nullable one, for the same reason the voice schemas do it: "I left it out"
// and "I looked and it is not there" are different facts, and only an explicit
// null says the second.
// ============================================================

// **The same object the voice expense schema uses, referenced and not retyped.**
// Confidence means the identical thing on both routes and is clamped by the
// identical code (clampConfidence in voice.ts), so a second hand-written copy
// here would exist only to disagree with that one eventually.
const CONFIDENCE_FIELD = VOICE_EXPENSE_JSON_SCHEMA.properties.confidence;

export const RECEIPT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'date', 'amount', 'confidence'],
  properties: {
    // **`name` and not `supplier`, and the key is deliberate.** This is the
    // field the validator reads and the column the app writes, and renaming it
    // for this route would mean a translation step between the model and the
    // validator that neither of them can see. What a receipt puts in it is said
    // in the description, which is the part the model actually reads.
    name: {
      type: ['string', 'null'],
      description:
        'שם הספק או בית העסק שהנפיק את הקבלה, כפי שהוא מודפס עליה. null אם אינו קריא בתמונה',
    },
    // Bounded by `today` on both sides in the instruction text, because a
    // two-digit year on a printed receipt is ambiguous and a receipt for a
    // purchase that has not happened yet is a misreading.
    date: {
      type: 'string',
      description: 'תאריך הקבלה בפורמט YYYY-MM-DD, כפי שהוא מודפס עליה',
    },
    // **The total, not a line item.** A receipt lists items and then one number
    // to pay, and the number to pay is the expense. exclusiveMinimum is stripped
    // from the wire copy and survives as words; the enforcement is finitePositive
    // in voice.ts either way.
    amount: {
      type: 'number',
      exclusiveMinimum: 0,
      description: 'הסכום הכולל לתשלום בקבלה, כולל מע"מ, מספר בלבד ובלי סימן מטבע',
    },
    confidence: { ...CONFIDENCE_FIELD },
  },
} as const;

// The wire copy, for the same two reasons voiceWireJsonSchema exists — minus the
// transcript, see the header. The numeric bound keywords are removed because
// providers of structured outputs reject the whole request with a 400 when they
// see them, and the request goes out with a `models` array, so there is a real
// path on which a second provider is handed this schema on the day the primary
// one is down. The constraint is not lost: withoutNumericBounds moves it into
// the description in words, and finitePositive enforces it on what comes back.
// The full argument is at the end of voice.ts.
export function receiptWireJsonSchema(): object {
  return withoutNumericBounds(RECEIPT_JSON_SCHEMA) as object;
}

// ============================================================
// Part three, the validator.
//
// **parseVoiceExpense, untouched.** Model output is hostile input on this route
// exactly as it is on the voice route, and the rules are the same rules: an
// invalid value is rejected rather than silently dropped, a missing value
// becomes null, and the two stay distinguishable. A number that arrived as a
// string ("1500") is refused and not coerced — this is money, and a model that
// ignored the schema on the amount is a model whose answer should be thrown
// away rather than guessed at.
//
// The envelope mirrors parseVoiceResult so a caller can hand the value straight
// to the step 9 confirmation sheet, which is the whole point of the reuse.
// ============================================================

// **Narrower than parseVoiceResult's return, and derived from it rather than
// written out.** A receipt can only ever produce an expense, so promising a
// union would make every caller narrow a value that has one possible shape —
// and the client transport in the next step is the first that would have to.
// Extract keeps it tied to VoiceParsed, so it stays assignable everywhere the
// confirmation sheet expects one and cannot drift away from it.
export type ReceiptParsed = Extract<VoiceParsed, { kind: 'expense' }>;

export function parseReceipt(raw: unknown): VoiceParseResult<ReceiptParsed> {
  const result = parseVoiceExpense(raw);
  return result.ok ? { ok: true, value: { kind: 'expense', value: result.value } } : result;
}
