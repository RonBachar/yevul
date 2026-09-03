// Shrinking a receipt photograph before it leaves the device, stage 5,
// docs/roadmap.md: "דחיסת תמונה בקליינט לפני העלאה".
//
// **This module resizes nothing.** Resizing an image is a native call on the
// phone (expo-image-manipulator) and a canvas in the browser, and neither exists
// in both places. What is left once those are removed is a handful of decisions
// — how large is too large, what quality, whether a given photograph needs
// touching at all, and what happens when the resize fails — and every one of
// them is something the farmer feels: as seconds of waiting, as an accountant's
// document he can or cannot read, or as a receipt he loses. They live here so
// they are covered by tests, because neither client has a test runner. Same
// argument, same shape, as voiceRecording.ts.
//
// The two call sites are frontend/mobile/src/lib/receiptImage.ts and
// frontend/web/src/lib/receiptImage.ts.

// ============================================================
// The target.
// ============================================================

// **1600 pixels on the longest edge, and the number is the model's, not ours.**
//
// A vision model does not look at the pixels it is sent. It rescales the image
// into a fixed budget of tiles first and reasons about that, and the budgets in
// use today put the ceiling at roughly 1500-1600 on the long edge. Every pixel
// above that line is a pixel the farmer waited to upload and the provider threw
// away before reading a single character. Sitting just above the line rather
// than below it means the provider's own downsample is close to a no-op instead
// of a second reduction of an already-shrunk photograph.
//
// **The other constraint is the small print on a crumpled thermal receipt, and
// 1600 clears it with room.** A till receipt is about 80mm across. A photograph
// where the receipt fills the frame therefore has something like 1100-1200
// pixels spanning those 80mm, i.e. about 14 pixels per millimetre. Receipt body
// text is 2.5-3mm tall, which lands at 35-40 pixels of glyph height — far above
// the point where character recognition starts to struggle. What actually
// decides whether the model can read a receipt is how much of the frame the
// paper fills, and no compression setting can rescue a receipt photographed from
// a metre away; that is what 'receipt.hint' on the capture panel is for.
//
// **What it is worth.** The one receipt in the bucket at the time this was
// written is 907KB, taken on a phone at quality 0.7 with no resize — a 12MP
// frame, about 12 million pixels. 1600 on the long edge is 1600x1200, about 1.9
// million, a factor of 6.25 fewer. JPEG size does not fall quite linearly with
// pixel count, but it falls faster than linearly on a photograph rather than
// slower, because most of what disappears is sensor noise and paper grain, which
// is the most expensive thing in the file to encode. So 907KB should become
// something on the order of 150KB and certainly under 300KB. On rural cellular
// at a realistic 1 Mbps that is the difference between about seven seconds of
// waiting and about one — and on the scan route it counts twice, because the
// same file is uploaded once to the Worker to be read and again to storage to be
// filed.
export const RECEIPT_MAX_EDGE_PIXELS = 1600;

// **0.7, which is exactly what the pipeline already used, and holding it still
// is the point.** expo-image-picker has been re-encoding at this quality since
// the feature was built, so the 907KB above is an observation *at 0.7*. Moving
// the quality and the size in the same change would throw that baseline away and
// leave nothing to compare a measurement on a device against. The whole of the
// reduction is therefore attributable to the resize, and 907KB stays a usable
// reference point.
//
// Lower would start eating the small print, which is the one thing the model has
// to read. Higher buys nothing: the provider has already rescaled the image
// before it is charged for, so the extra bytes are paid for by the farmer in
// upload time and by nobody in accuracy.
export const RECEIPT_JPEG_QUALITY = 0.7;

// **Every compressed receipt is a JPEG, and that is what settles HEIC.** An
// iPhone hands back image/heic when a photograph is picked out of the library
// rather than taken; the OCR endpoint refuses it (400 unsupported_format, see
// IMAGE_FORMATS in the Worker's openrouter.ts) and the farmer spends a trip to
// the camera to find out. Re-encoding on the way out means the endpoint never
// sees one on the compressed path.
//
// It is also the extension the document is filed under: attachReceipt derives
// the storage path's extension from the mime type, so this is what stops an
// accountant being handed a .heic he cannot open.
//
// **Not a promise about the fallback.** If the resize fails the original file
// goes up untouched, HEIC included, and that is the behaviour at HEAD — see
// compressedOrOriginal.
export const RECEIPT_COMPRESSED_MIME_TYPE = 'image/jpeg';

// ============================================================
// Whether this photograph needs resizing at all, and to what.
// ============================================================

export type ReceiptResizeTarget = { width: number; height: number };

// `null` is "leave this file exactly as it is", and it covers two cases that
// happen to want the same answer.
//
// **It is already small enough.** A screenshot of an emailed invoice, or a photo
// that has already been through a messaging app, arrives at 1200 pixels and a
// few tens of kilobytes. Re-encoding it would cost a second lossy pass over
// text, and a flat PNG screenshot re-encoded as JPEG can come out *larger* than
// it went in. There is nothing to win, so nothing is touched.
//
// **Or the dimensions are not known.** expo-image-picker documents that width
// and height "can be 0 if the system did not provide" them. Without both there
// is no aspect ratio, and a box guessed from one edge is how a receipt gets
// stretched. Refusing is the same safe path a failed resize takes: the original
// is uploaded, which is what happens today.
export function receiptResizeTarget(width: number, height: number): ReceiptResizeTarget | null {
  if (!isUsableDimension(width) || !isUsableDimension(height)) return null;

  const longest = Math.max(width, height);
  if (longest <= RECEIPT_MAX_EDGE_PIXELS) return null;

  // Scaled off the longest edge rather than off each edge separately, so the
  // aspect ratio survives. A receipt is a tall narrow rectangle and a stretched
  // one is a receipt whose columns no longer line up.
  const scale = RECEIPT_MAX_EDGE_PIXELS / longest;
  return { width: scaledEdge(width, scale), height: scaledEdge(height, scale) };
}

function isUsableDimension(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

// Rounded, because both platforms want whole pixels, and floored at 1, because
// a very long thin image scales its short edge below half a pixel and a zero
// there is a native call that throws or an empty canvas.
function scaledEdge(edge: number, scale: number): number {
  return Math.max(1, Math.round(edge * scale));
}

// ============================================================
// What happens when the resize fails.
// ============================================================

// **The farmer is holding a piece of paper, and a resize that threw must not
// cost him the receipt.** Everything below the fallback is a path that already
// works: the OCR endpoint has taken uncompressed photographs since the feature
// shipped and still caps them at 8MB with an actionable 413, and attachReceipt
// stores whatever bytes it is handed. So a failure here is slower and heavier,
// never lost.
//
// He is told nothing, deliberately. "We could not shrink your photo" is a
// sentence with no action attached to it, on a screen whose whole job is to get
// a document filed.
//
// Generic over the image because the two clients hold different things — the
// phone a file:// uri with a mime type beside it, the browser a File — and the
// rule is the same rule. `null` from the compressor means the same as a throw
// and exists for the platform that decides mid-way that there is nothing to do.
export async function compressedOrOriginal<TImage>(
  original: TImage,
  compress: () => Promise<TImage | null>,
): Promise<TImage> {
  try {
    return (await compress()) ?? original;
  } catch {
    return original;
  }
}
