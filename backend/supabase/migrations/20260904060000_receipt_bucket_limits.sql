-- A ceiling on what a single receipt may be, and on what a receipt may be at
-- all, stage 5, docs/roadmap.md: "מכסת אחסון, מעקב עלות מול הלקוח".
--
-- **This is not a storage quota, and a quota was deliberately not built.** The
-- arithmetic is why. A compressed receipt is about 150KB, a farmer
-- photographing twenty a month accumulates under 4MB a year, and Supabase
-- storage is roughly two cents per gigabyte per month -- so a whole farm costs a
-- fraction of an agora annually. A quota exists to protect a cost, and there is
-- no cost here to protect. Receipts are also a paid-only feature (prd.md
-- section 9), so a free farm stores nothing at all and has nothing to limit.
--
-- **What is worth having is a ceiling against the abnormal**, and the Worker
-- already enforces one at 8MB on the OCR route. The gap this closes is the web:
-- the browser uploads straight to storage and never passes through the Worker,
-- so until now a 40MB flatbed scan landed whole and nothing would have stopped
-- it. The bucket is the only place that path can be bounded.
--
-- 8MB matches the Worker's own cap on purpose, so the two routes refuse the
-- same file rather than one accepting what the other rejects.
--
-- The MIME list is the same closed set the OCR endpoint accepts, plus PDF:
-- attachReceipt has always stored PDFs even though OCR refuses to read one, and
-- an accountant's invoice arriving as a PDF is a normal thing that must keep
-- working. Anything outside the list is rejected by storage itself, which means
-- a client bug can no longer put an executable or a video in a farm's receipts.
--
-- update rather than insert-on-conflict: the bucket has existed since
-- 20260820120000 and this migration only tightens it.

update storage.buckets
set
  file_size_limit = 8388608,
  allowed_mime_types = array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf'
  ]
where id = 'receipts';
