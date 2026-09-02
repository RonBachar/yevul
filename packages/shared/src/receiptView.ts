// Looking at a receipt that has already been filed.
//
// **The half of the feature that was never built.** attachReceipt (expenses.ts)
// puts a document in the bucket and a row in `receipts`, and until now nothing
// in any client could open either one: the expense sheet offered to *replace* a
// receipt it would not show you. prd.md section 9 is unambiguous that this is
// the point of storing it at all — "המסמך נשמר לצד ההוצאה ואפשר לפתוח אותו מכל
// מקום שההוצאה מופיעה בו", and "רואה החשבון צריך את המסמך עצמו, לא רק את
// המספר". A number with an unopenable attachment is the number on its own.
//
// **The bucket is private, so a URL has to be signed.** `storage.buckets.public`
// is false for `receipts` (core schema), which means the public object URL
// answers 400 and there is no path to the bytes except a signed one.
// `createSignedUrl` is issued against the caller's own session and is therefore
// subject to `receipts_storage_select`, which permits SELECT on
// `storage.objects` when the *first path segment* is a farm the caller is an
// owner or manager of. attachReceipt writes `{farm_id}/{expense_id}.{ext}`
// precisely so that policy can read the farm off the folder, so the signature
// this module asks for is one the policy already allows. A worker — blocked from
// the whole money side at row level — gets an error here, which is the same
// answer he gets from the `receipts` table above it.
//
// **This module fetches; it does not render and does not hold.** Both clients
// call it when the farmer asks to see the document and drop the result when he
// closes the viewer, which is what keeps the expiry below honest. See the note
// on RECEIPT_SIGNED_URL_SECONDS.

import type { SupabaseClient } from '@supabase/supabase-js';

// **Five minutes, and the number is a compromise between two real failures.**
//
// Too short and the picture never arrives: the receipt already sitting in the
// bucket is a 907KB JPEG, which is over half a minute on a rural 3G link and
// past two minutes on a bad one, before the farmer has looked at anything. A
// signature that dies mid-download cannot be retried — the retry carries the
// same dead token — so the failure reads to him as "the app cannot show my
// receipt", which is exactly the bug being fixed.
//
// Too long and the URL becomes a bearer token for a private financial document
// with a long life: anyone holding the string can read the file, no session
// required, and strings leak into history, logs and forwarded messages.
//
// Five minutes covers a slow download plus one retry plus time spent actually
// reading the page, and buys nothing beyond that, because a viewer that is
// re-opened signs a fresh URL rather than reusing this one.
export const RECEIPT_SIGNED_URL_SECONDS = 300;

// **Two kinds, because a client has exactly two ways to draw one.** Everything
// an <img>/<Image> can attempt is 'image'; a PDF cannot be attempted at all and
// has to be handed to something else. There is deliberately no 'unknown': a
// third kind would need a third screen, and the honest fallback for a file we
// cannot classify is to try to draw it and let the load error offer the way out.
export type ReceiptKind = 'image' | 'pdf';

export type ReceiptDocument = {
  storagePath: string;
  // As stored. Nullable in the schema, so it is nullable here.
  mimeType: string | null;
  kind: ReceiptKind;
  // Valid for RECEIPT_SIGNED_URL_SECONDS from the moment it was signed.
  signedUrl: string;
  // Epoch millis at which signedUrl stops working. Exposed so a caller that
  // holds a document can tell whether it is still worth drawing, rather than
  // discovering it from a broken image.
  expiresAt: number;
};

// **'none' and 'error' are two different screens, which is why they are not one
// reason.** 'none' means we asked and this expense genuinely has no live
// receipt — nothing is broken, there is simply no document, and the farmer
// should be told that and offered the camera. 'error' means the document may
// well exist and we could not reach it, which is a "try again" and never a
// "there is nothing here". Collapsing them would tell a farmer whose receipt is
// safe in the bucket that his receipt is gone.
export type ReceiptViewResult =
  { ok: true; document: ReceiptDocument } | { ok: false; reason: 'none' | 'error' };

// The three columns needed to draw the thing. `deleted_at` is selected even
// though the query filters on it — see pickLiveReceipt.
export type ReceiptRow = {
  storage_path: string;
  mime_type: string | null;
  deleted_at: string | null;
};

// **Both signals are consulted, and either one is enough.** attachReceipt
// derives the stored extension from the mime type, so a path ending in `.pdf`
// can only have come from `application/pdf` — but `receipts.mime_type` is
// nullable in the schema, so a row can carry the extension and nothing else.
// Reading both means a null mime does not silently turn a PDF into a broken
// image.
export function receiptKind(mimeType: string | null | undefined, storagePath: string): ReceiptKind {
  if (mimeType?.trim().toLowerCase() === 'application/pdf') return 'pdf';
  if (storagePath.trim().toLowerCase().endsWith('.pdf')) return 'pdf';
  return 'image';
}

// **The replace flow is why this exists.** attachReceipt soft-deletes the
// previous row and inserts a new one, so an expense whose receipt has been
// replaced has two rows and only one of them is the document the farmer means.
// `receipts_one_active_per_expense` — a unique index over expense_id `where
// deleted_at is null` — guarantees at most one live row, and the query below
// filters on it as well; this is the invariant restated where it is relied on,
// exactly as mapExpense restates it for the embedded select in useExpenses.
// Showing a soft-deleted receipt would show the farmer the document he
// deliberately replaced.
export function pickLiveReceipt(rows: ReceiptRow[] | null | undefined): ReceiptRow | null {
  return rows?.find((row) => !row.deleted_at) ?? null;
}

// `now` is a parameter, and pure, for the reason farmEntitled's is: it makes
// expiresAt assertable without freezing the clock.
export async function loadReceiptDocument(
  supabase: SupabaseClient,
  expenseId: string,
  now: Date = new Date(),
): Promise<ReceiptViewResult> {
  const { data, error } = await supabase
    .from('receipts')
    .select('storage_path, mime_type, deleted_at')
    .eq('expense_id', expenseId)
    .is('deleted_at', null);

  if (error) return { ok: false, reason: 'error' };

  const row = pickLiveReceipt(data as ReceiptRow[] | null);
  // Not an error. An expense with no document is an ordinary expense, and the
  // list row already knows it — see the note on Expense.receiptPath. Reaching
  // this branch usually means the receipt was deleted after the list loaded.
  if (!row) return { ok: false, reason: 'none' };

  const signed = await supabase.storage
    .from('receipts')
    .createSignedUrl(row.storage_path, RECEIPT_SIGNED_URL_SECONDS);

  // Both halves are checked. A storage error is the obvious failure, but
  // supabase-js can also answer with no error and no data, and a `signedUrl` of
  // undefined would reach an <img> as the string "undefined" and render as a
  // broken document rather than as a problem.
  const signedUrl = signed.data?.signedUrl;
  if (signed.error || !signedUrl) return { ok: false, reason: 'error' };

  return {
    ok: true,
    document: {
      storagePath: row.storage_path,
      mimeType: row.mime_type,
      kind: receiptKind(row.mime_type, row.storage_path),
      signedUrl,
      expiresAt: now.getTime() + RECEIPT_SIGNED_URL_SECONDS * 1000,
    },
  };
}
