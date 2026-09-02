// Tests for the receipt OCR schema, packages/shared/src/receipt.ts.
//
// **Two things are under test here, and they are not the same thing.** The
// first is that the model's output is still treated as hostile on this route —
// a receipt is read by the same class of model that mishears a recording, and
// the number it reads off a crumpled thermal print is money. The second, and the
// reason this file exists at all rather than trusting voice.test.ts, is the
// *reuse itself*: the whole justification for not writing a second expense
// schema is that a receipt lands in the identical record on the identical
// confirmation sheet, and that claim has to be asserted rather than asserted in
// a comment.

import { describe, expect, it } from 'vitest';
import { parseReceipt, receiptWireJsonSchema, RECEIPT_JSON_SCHEMA } from './receipt';
import { parseVoiceExpense, VOICE_EXPENSE_JSON_SCHEMA } from './voice';

// What a clean read off a supplier invoice looks like: the four fields the
// schema asks for and nothing else. plotName and hasMoreItems are absent
// deliberately — an invoice names neither.
const validReceipt = {
  name: 'חממות הגליל בע"מ',
  date: '2026-08-30',
  amount: 1450.5,
  confidence: 0.88,
};

// The keys the wire schema is allowed to leave out because the validator already
// answers them correctly by itself. Named here so the reasoning is in one place.
const NOT_ASKED_OF_THE_MODEL = ['plotName', 'hasMoreItems'];

function keysDeep(node: unknown): string[] {
  if (Array.isArray(node)) return node.flatMap(keysDeep);
  if (typeof node !== 'object' || node === null) return [];
  return Object.entries(node).flatMap(([key, value]) => [key, ...keysDeep(value)]);
}

// ============================================================
// The validator.
// ============================================================

describe('parseReceipt', () => {
  it('accepts a clean read and returns it as an expense record', () => {
    const result = parseReceipt(validReceipt);

    expect(result.ok).toBe(true);
    // **The kind is 'expense' and not 'receipt'.** This is the assertion the
    // reuse decision rests on: the value goes straight to the step 9
    // confirmation sheet, which knows three kinds and would have needed a
    // fourth.
    expect(result.ok && result.value.kind).toBe('expense');
    expect(result.ok && result.value.value).toEqual({
      amount: 1450.5,
      name: 'חממות הגליל בע"מ',
      // Never asked for, never guessed. An invoice does not say which plot the
      // diesel was for.
      plotName: null,
      date: '2026-08-30',
      confidence: 0.88,
      // A receipt is one document with one total. There is no second receipt
      // behind it, so the sheet must not offer "one at a time".
      hasMoreItems: false,
    });
  });

  // **The most important test in the file.** A model that answers "1450.50"
  // instead of 1450.5 ignored the schema, and this is the total on an invoice.
  // Coercing it would mean guessing at a financial figure; deleting it silently
  // would file an expense with no amount. Both are worse than asking the farmer
  // to photograph it again.
  it('rejects an amount that arrived as a string, not a number', () => {
    expect(parseReceipt({ ...validReceipt, amount: '1450.50' }).ok).toBe(false);
  });

  it('rejects a zero, negative or non-finite amount', () => {
    expect(parseReceipt({ ...validReceipt, amount: 0 }).ok).toBe(false);
    expect(parseReceipt({ ...validReceipt, amount: -1450.5 }).ok).toBe(false);
    expect(parseReceipt({ ...validReceipt, amount: Number.NaN }).ok).toBe(false);
  });

  it('rejects a missing amount', () => {
    expect(parseReceipt({ name: 'ספק', date: '2026-08-30', confidence: 0.5 }).ok).toBe(false);
  });

  // A date printed as 30/08/2026 on the paper still has to come back as
  // YYYY-MM-DD, and a date the model rolled over never existed.
  it('rejects a date that is not a real calendar date', () => {
    expect(parseReceipt({ ...validReceipt, date: '30/08/2026' }).ok).toBe(false);
    expect(parseReceipt({ ...validReceipt, date: '2026-02-31' }).ok).toBe(false);
    expect(parseReceipt({ ...validReceipt, date: '2026-8-3' }).ok).toBe(false);
    expect(parseReceipt({ ...validReceipt, date: null }).ok).toBe(false);
  });

  // **An unreadable supplier is a null, not a rejection, and that asymmetry is
  // the rule.** A missing value is a legitimate record — the farmer sees the
  // amount and the date on the sheet and can name the shop himself. An invalid
  // value is not, and the two must not collapse into each other.
  it('turns an unreadable or blank supplier into null without rejecting the record', () => {
    for (const name of [null, undefined, '', '   ', 42]) {
      const result = parseReceipt({ ...validReceipt, name });
      expect(result.ok, String(name)).toBe(true);
      expect(result.ok && result.value.value.name, String(name)).toBe(null);
    }
  });

  it('trims a supplier that came back padded', () => {
    const result = parseReceipt({ ...validReceipt, name: '  חממות הגליל  ' });
    expect(result.ok && result.value.value.name).toBe('חממות הגליל');
  });

  // Confidence only drives emphasis on a sheet the farmer confirms anyway, so an
  // out-of-range value is clamped rather than allowed to throw away an otherwise
  // good read of the amount and the date.
  it('clamps confidence instead of rejecting the read', () => {
    expect(parseReceipt({ ...validReceipt, confidence: 4 }).ok).toBe(true);
    expect(
      parseReceipt({ ...validReceipt, confidence: 4 }).ok &&
        parseReceipt({ ...validReceipt, confidence: 4 }),
    ).toMatchObject({ value: { value: { confidence: 1 } } });
    expect(parseReceipt({ ...validReceipt, confidence: 'גבוהה' })).toMatchObject({
      value: { value: { confidence: 0 } },
    });
  });

  it('rejects anything that is not an object at all', () => {
    for (const raw of [null, undefined, 'לא הצלחתי לקרוא את הקבלה', 42, [validReceipt]]) {
      expect(parseReceipt(raw).ok, String(raw)).toBe(false);
    }
  });

  // A model that invented a plot or a second item is answering a question it was
  // never asked. The validator reads only the keys it knows, so the invention is
  // dropped rather than believed — but plotName is a real key, so this is worth
  // pinning: a hallucinated plot name would be attributed to a real plot by
  // resolvePlotName further down the line.
  it('does not reject a record carrying fields the schema never asked for', () => {
    const result = parseReceipt({ ...validReceipt, vatAmount: 210, lineItems: ['טפטפות'] });
    expect(result.ok).toBe(true);
  });

  // **The reuse, asserted.** parseReceipt is parseVoiceExpense in an envelope,
  // and if that ever stops being true the two routes have started to disagree
  // about what an expense is.
  it('is the expense validator, not a second one that resembles it', () => {
    const throughReceipt = parseReceipt(validReceipt);
    const throughVoice = parseVoiceExpense(validReceipt);

    expect(throughReceipt.ok && throughReceipt.value.value).toEqual(
      throughVoice.ok && throughVoice.value,
    );
  });
});

// ============================================================
// The JSON schema sent to the model.
// ============================================================

describe('RECEIPT_JSON_SCHEMA', () => {
  // prd.md line 121: "מצלמים חשבונית, והאפליקציה קוראת ממנה את הספק, הסכום
  // והתאריך" — you photograph an invoice and the app reads the supplier, the
  // amount and the date off it. Three fields, plus the confidence every
  // extraction carries.
  it('asks for exactly the supplier, the date, the amount and a confidence', () => {
    expect(Object.keys(RECEIPT_JSON_SCHEMA.properties)).toEqual([
      'name',
      'date',
      'amount',
      'confidence',
    ]);
  });

  // Order is generation order in structured outputs: whose receipt, when, how
  // much, and only then how sure. A confidence generated first would be a model
  // rating an answer it has not written.
  it('puts confidence last, after the three fields it judges', () => {
    const keys = Object.keys(RECEIPT_JSON_SCHEMA.properties);
    expect(keys[keys.length - 1]).toBe('confidence');
  });

  // A closed schema with a field outside `required` is exactly what providers of
  // structured outputs reject, and "omitted" must stay distinguishable from
  // "looked and did not find".
  it('requires every property it declares, and declares nothing more', () => {
    expect([...RECEIPT_JSON_SCHEMA.required].sort()).toEqual(
      Object.keys(RECEIPT_JSON_SCHEMA.properties).sort(),
    );
    expect(RECEIPT_JSON_SCHEMA.additionalProperties).toBe(false);
  });

  // **The two fields the model is deliberately not asked for.** An invoice names
  // no plot, and a receipt is one document with one total. The validator answers
  // both correctly on its own, which is asserted above.
  it('does not ask the model for the plot or for a "more items" flag', () => {
    for (const key of NOT_ASKED_OF_THE_MODEL) {
      expect(Object.keys(RECEIPT_JSON_SCHEMA.properties)).not.toContain(key);
    }
  });

  // The voice schema adds a transcript because audio cannot be shown back. The
  // farmer is holding the photograph, so the same field here would spend the 400
  // token output budget transcribing a document he is looking at — and the way
  // that budget runs out is a truncated answer he already paid for.
  it('does not ask the model to transcribe the document', () => {
    expect(Object.keys(RECEIPT_JSON_SCHEMA.properties)).not.toContain('transcript');
    expect(RECEIPT_JSON_SCHEMA.required).not.toContain('transcript');
  });

  // Every key the model is asked for must be a key the validator reads. The two
  // describe one contract from its two sides, and a field in the schema that the
  // validator ignores is a field the model spends tokens on for nothing.
  it('asks only for fields the expense validator actually reads', () => {
    const parsed = parseReceipt(validReceipt);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    for (const key of Object.keys(RECEIPT_JSON_SCHEMA.properties)) {
      expect(Object.keys(parsed.value.value)).toContain(key);
    }
  });

  it('shares the confidence field with the voice expense schema rather than copying it', () => {
    expect(RECEIPT_JSON_SCHEMA.properties.confidence).toEqual(
      VOICE_EXPENSE_JSON_SCHEMA.properties.confidence,
    );
  });
});

// ============================================================
// The wire copy.
// ============================================================

describe('receiptWireJsonSchema', () => {
  // The request goes out with a `models` array, so there is a real path on which
  // the fallback provider is handed this schema. A provider that rejects a
  // numeric bound keyword rejects the entire request with a 400, and it would
  // happen on the day the primary model is down.
  it('carries no numeric bound keyword at any depth', () => {
    const keys = keysDeep(receiptWireJsonSchema());

    expect(keys).not.toContain('minimum');
    expect(keys).not.toContain('maximum');
    expect(keys).not.toContain('exclusiveMinimum');
    expect(keys).not.toContain('exclusiveMaximum');
  });

  // The constraint is not dropped, it changes form: the bound becomes words the
  // model reads, and finitePositive still enforces the real thing on the way
  // back. Dropping it silently is what would make the removal unsafe.
  it('keeps the amount bound as words in the description', () => {
    const wire = receiptWireJsonSchema() as {
      properties: { amount: { description: string } };
    };

    expect(wire.properties.amount.description).toContain('מספר חיובי');
  });

  it('keeps the fields, the order and the required list of the canonical schema', () => {
    const wire = receiptWireJsonSchema() as {
      required: string[];
      properties: Record<string, unknown>;
      additionalProperties: boolean;
    };

    expect(Object.keys(wire.properties)).toEqual(Object.keys(RECEIPT_JSON_SCHEMA.properties));
    expect(wire.required).toEqual([...RECEIPT_JSON_SCHEMA.required]);
    expect(wire.additionalProperties).toBe(false);
  });

  // The canonical schemas are `as const` objects shared between callers —
  // CONFIDENCE_FIELD is literally the same object as the voice expense schema's.
  // A walk that mutated in place would poison every schema in the process.
  it('returns a fresh copy and never mutates the canonical schema', () => {
    const before = JSON.stringify(RECEIPT_JSON_SCHEMA);

    const first = receiptWireJsonSchema();
    const second = receiptWireJsonSchema();

    expect(JSON.stringify(RECEIPT_JSON_SCHEMA)).toBe(before);
    expect(first).not.toBe(second);
    expect(first).toEqual(second);
    // The shared confidence object in the voice schema is untouched too.
    expect(VOICE_EXPENSE_JSON_SCHEMA.properties.confidence).toMatchObject({
      minimum: 0,
      maximum: 1,
    });
  });
});
