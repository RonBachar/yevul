// Tests for packages/shared/src/receiptView.ts.
//
// **Everything here is the part of the receipt viewer that is not a component.**
// Neither client has a test runner, so the rule about which row is the current
// one, the mapping from a storage answer to a screen, and the choice of expiry
// are all decided in this package and asserted here; what stays on the device is
// the drawing.
//
// The case that would be silently wrong is the replaced receipt. attachReceipt
// soft-deletes the old row and inserts a new one, so an expense that has had its
// document replaced holds two rows, and picking the wrong one shows the farmer
// the receipt he deliberately threw away — with no error anywhere to notice.

import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  loadReceiptDocument,
  pickLiveReceipt,
  receiptKind,
  RECEIPT_SIGNED_URL_SECONDS,
  type ReceiptRow,
} from './receiptView';

const NOW = new Date('2026-09-02T09:00:00Z');

const LIVE: ReceiptRow = {
  storage_path: 'farm-1/expense-1.jpg',
  mime_type: 'image/jpeg',
  deleted_at: null,
};

const REPLACED: ReceiptRow = {
  storage_path: 'farm-1/expense-1.png',
  mime_type: 'image/png',
  deleted_at: '2026-09-01T12:00:00Z',
};

type SelectOutcome = { data: ReceiptRow[] | null; error: { message: string } | null };
type SignOutcome = { data: { signedUrl?: string } | null; error: { message: string } | null };

type Recorded = {
  table: string | null;
  columns: string | null;
  filters: string[];
  bucket: string | null;
  signedPath: string | null;
  signedSeconds: number | null;
};

// A supabase client the size of what loadReceiptDocument actually touches, and
// no larger. It records the query it was asked for, because the filter on
// `deleted_at` is load-bearing and an assertion on the returned document alone
// would still pass if it were dropped.
function fakeSupabase(select: SelectOutcome, sign: SignOutcome) {
  const recorded: Recorded = {
    table: null,
    columns: null,
    filters: [],
    bucket: null,
    signedPath: null,
    signedSeconds: null,
  };

  const builder = {
    select(columns: string) {
      recorded.columns = columns;
      return builder;
    },
    eq(column: string, value: string) {
      recorded.filters.push(`${column} = ${value}`);
      return builder;
    },
    // The last link in the chain, so this is where the query resolves.
    is(column: string, value: unknown) {
      recorded.filters.push(`${column} is ${String(value)}`);
      return Promise.resolve(select);
    },
  };

  const client = {
    from(table: string) {
      recorded.table = table;
      return builder;
    },
    storage: {
      from(bucket: string) {
        recorded.bucket = bucket;
        return {
          createSignedUrl(path: string, seconds: number) {
            recorded.signedPath = path;
            recorded.signedSeconds = seconds;
            return Promise.resolve(sign);
          },
        };
      },
    },
  };

  return { supabase: client as unknown as SupabaseClient, recorded };
}

function signedOk(url = 'https://storage.example/signed?token=abc'): SignOutcome {
  return { data: { signedUrl: url }, error: null };
}

describe('receiptKind', () => {
  it('reads a PDF off its mime type', () => {
    expect(receiptKind('application/pdf', 'farm-1/expense-1.pdf')).toBe('pdf');
  });

  // mime_type is nullable in the schema, so the extension has to be able to
  // carry the answer on its own.
  it('reads a PDF off the stored path when the mime type is missing', () => {
    expect(receiptKind(null, 'farm-1/expense-1.pdf')).toBe('pdf');
    expect(receiptKind(undefined, 'farm-1/expense-1.PDF')).toBe('pdf');
  });

  it('treats a photograph as an image', () => {
    expect(receiptKind('image/jpeg', 'farm-1/expense-1.jpg')).toBe('image');
    expect(receiptKind(null, 'farm-1/expense-1.jpg')).toBe('image');
  });

  // A HEIC out of an iPhone gallery, or anything else stored by a client we do
  // not control. Drawing it and letting the load error offer a way out is a
  // better answer than a third screen for "we are not sure".
  it('falls back to image for a type it does not recognise', () => {
    expect(receiptKind('image/heic', 'farm-1/expense-1.heic')).toBe('image');
    expect(receiptKind('application/octet-stream', 'farm-1/expense-1.bin')).toBe('image');
  });

  it('is not fooled by case or padding around the mime type', () => {
    expect(receiptKind(' Application/PDF ', 'farm-1/expense-1.pdf')).toBe('pdf');
  });
});

describe('pickLiveReceipt', () => {
  // The replace flow, at row level: the soft-deleted row is the one that was
  // inserted first, so it arrives first from an unordered select.
  it('picks the live row over a soft-deleted one', () => {
    expect(pickLiveReceipt([REPLACED, LIVE])).toBe(LIVE);
  });

  it('returns null when every row is soft-deleted', () => {
    expect(pickLiveReceipt([REPLACED])).toBeNull();
  });

  it('returns null for no rows at all', () => {
    expect(pickLiveReceipt([])).toBeNull();
    expect(pickLiveReceipt(null)).toBeNull();
    expect(pickLiveReceipt(undefined)).toBeNull();
  });
});

describe('loadReceiptDocument', () => {
  it('returns a signed url for the live receipt', async () => {
    const { supabase, recorded } = fakeSupabase({ data: [LIVE], error: null }, signedOk());
    const result = await loadReceiptDocument(supabase, 'expense-1', NOW);

    expect(result).toEqual({
      ok: true,
      document: {
        storagePath: 'farm-1/expense-1.jpg',
        mimeType: 'image/jpeg',
        kind: 'image',
        signedUrl: 'https://storage.example/signed?token=abc',
        expiresAt: NOW.getTime() + RECEIPT_SIGNED_URL_SECONDS * 1000,
      },
    });
    expect(recorded.table).toBe('receipts');
    expect(recorded.bucket).toBe('receipts');
  });

  // The soft-delete filter belongs in the query and not only in the JS, because
  // the JS filter cannot save a row the database never sent.
  it('asks the database for the live row of this expense only', async () => {
    const { supabase, recorded } = fakeSupabase({ data: [LIVE], error: null }, signedOk());
    await loadReceiptDocument(supabase, 'expense-1', NOW);

    expect(recorded.filters).toContain('expense_id = expense-1');
    expect(recorded.filters).toContain('deleted_at is null');
  });

  // Defence in depth over the same invariant: even handed both rows, the
  // document that gets signed is the current one.
  it('signs the live receipt when a replaced one is also returned', async () => {
    const { supabase, recorded } = fakeSupabase(
      { data: [REPLACED, LIVE], error: null },
      signedOk(),
    );
    const result = await loadReceiptDocument(supabase, 'expense-1', NOW);

    expect(result.ok).toBe(true);
    expect(recorded.signedPath).toBe(LIVE.storage_path);
  });

  it('signs for the documented number of seconds', async () => {
    const { supabase, recorded } = fakeSupabase({ data: [LIVE], error: null }, signedOk());
    await loadReceiptDocument(supabase, 'expense-1', NOW);

    expect(recorded.signedSeconds).toBe(RECEIPT_SIGNED_URL_SECONDS);
  });

  it('classifies a stored PDF as a pdf', async () => {
    const pdf: ReceiptRow = {
      storage_path: 'farm-1/expense-1.pdf',
      mime_type: 'application/pdf',
      deleted_at: null,
    };
    const { supabase } = fakeSupabase({ data: [pdf], error: null }, signedOk());
    const result = await loadReceiptDocument(supabase, 'expense-1', NOW);

    expect(result.ok && result.document.kind).toBe('pdf');
  });

  // ---- The two failures that must not be one failure. ----

  // Nothing is broken; there is simply no document. The farmer is told that and
  // offered the camera, not asked to try again.
  it('reports none when the expense has no receipt row', async () => {
    const { supabase, recorded } = fakeSupabase({ data: [], error: null }, signedOk());
    const result = await loadReceiptDocument(supabase, 'expense-1', NOW);

    expect(result).toEqual({ ok: false, reason: 'none' });
    // Nothing to sign, so nothing was signed.
    expect(recorded.signedPath).toBeNull();
  });

  // The replaced-and-nothing-since case: rows exist, none of them live. Still
  // "there is no document", never "something went wrong".
  it('reports none when every receipt row is soft-deleted', async () => {
    const { supabase } = fakeSupabase({ data: [REPLACED], error: null }, signedOk());
    const result = await loadReceiptDocument(supabase, 'expense-1', NOW);

    expect(result).toEqual({ ok: false, reason: 'none' });
  });

  // The document may well be sitting in the bucket. Telling him it does not
  // exist would be a lie about the half prd.md section 9 cares about.
  it('reports error when the receipts query fails', async () => {
    const { supabase, recorded } = fakeSupabase(
      { data: null, error: { message: 'permission denied' } },
      signedOk(),
    );
    const result = await loadReceiptDocument(supabase, 'expense-1', NOW);

    expect(result).toEqual({ ok: false, reason: 'error' });
    expect(recorded.signedPath).toBeNull();
  });

  // The row is readable but the object is not: a path pointing at nothing, or a
  // storage policy that refused the signature.
  it('reports error when signing fails', async () => {
    const { supabase } = fakeSupabase(
      { data: [LIVE], error: null },
      { data: null, error: { message: 'Object not found' } },
    );
    const result = await loadReceiptDocument(supabase, 'expense-1', NOW);

    expect(result).toEqual({ ok: false, reason: 'error' });
  });

  // Success with nothing in it. Passing this through would put the string
  // "undefined" in an <img src>, which renders as a broken document rather than
  // as a problem anyone can act on.
  it('reports error when signing succeeds with no url', async () => {
    const { supabase } = fakeSupabase({ data: [LIVE], error: null }, { data: {}, error: null });
    const result = await loadReceiptDocument(supabase, 'expense-1', NOW);

    expect(result).toEqual({ ok: false, reason: 'error' });
  });
});
