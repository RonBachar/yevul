// Tests for the receipt compression policy, packages/shared/src/receiptImage.ts.
//
// These exist because neither client has a test runner and neither ever will
// have one for this: the resize itself is a native module on the phone and a
// canvas in the browser, and both need a real photograph to say anything. What
// is testable is everything that was deliberately pulled out of them — the box a
// photograph is scaled into, the decision not to touch one at all, and what is
// uploaded when the resize throws.
//
// The arithmetic is asserted rather than trusted, the way voiceRecording.test.ts
// asserts the bitrate the recording cap is derived from. Both numbers here have
// a cost attached: one side of RECEIPT_MAX_EDGE_PIXELS is small print the model
// cannot read, the other is seconds a farmer waits on rural cellular.

import { describe, expect, it } from 'vitest';
import {
  compressedOrOriginal,
  receiptResizeTarget,
  RECEIPT_COMPRESSED_MIME_TYPE,
  RECEIPT_JPEG_QUALITY,
  RECEIPT_MAX_EDGE_PIXELS,
} from './receiptImage';

// The frame the whole policy was sized against: a 12MP phone photograph, which
// is what expo-image-picker hands back on default settings on both platforms,
// and which produced the single 907KB receipt in the bucket.
const TWELVE_MP_LANDSCAPE = { width: 4032, height: 3024 };

describe('the target the arithmetic produces', () => {
  it('puts a 12MP photograph inside the box, on its longest edge exactly', () => {
    const target = receiptResizeTarget(TWELVE_MP_LANDSCAPE.width, TWELVE_MP_LANDSCAPE.height);
    expect(target).not.toBeNull();
    // Landed on, not merely under: the scale is computed off the longest edge,
    // so anything else means the ratio was applied to the wrong one.
    expect(target?.width).toBe(RECEIPT_MAX_EDGE_PIXELS);
    expect(target?.height).toBe(1200);
  });

  it('cuts a 12MP frame to about a sixth of its pixels', () => {
    // The reduction the 907KB observation was reasoned from. If either number
    // moves, this is the test that says the expectation moved with it: 12
    // million pixels becoming under 2 million is what turns roughly seven
    // seconds of rural upload into roughly one.
    const target = receiptResizeTarget(TWELVE_MP_LANDSCAPE.width, TWELVE_MP_LANDSCAPE.height);
    const before = TWELVE_MP_LANDSCAPE.width * TWELVE_MP_LANDSCAPE.height;
    const after = (target?.width ?? 0) * (target?.height ?? 0);
    expect(before / after).toBeGreaterThan(6);
    expect(after).toBeLessThan(2_000_000);
  });

  it('keeps a receipt a receipt and does not stretch it', () => {
    // A till receipt photographed portrait is a tall narrow rectangle, and a
    // stretched one is a receipt whose columns no longer line up.
    const portrait = receiptResizeTarget(3024, 4032);
    expect(portrait).toEqual({ width: 1200, height: RECEIPT_MAX_EDGE_PIXELS });

    const ratioBefore = 3024 / 4032;
    const ratioAfter = (portrait?.width ?? 0) / (portrait?.height ?? 1);
    expect(Math.abs(ratioAfter - ratioBefore)).toBeLessThan(0.01);
  });

  it('scales whichever edge is the long one', () => {
    // A very wide scan of a landscape invoice, and its mirror image. Neither may
    // come out with an edge over the ceiling.
    for (const [width, height] of [
      [6000, 800],
      [800, 6000],
      [5000, 5000],
    ] as const) {
      const target = receiptResizeTarget(width, height);
      expect(Math.max(target?.width ?? 0, target?.height ?? 0)).toBe(RECEIPT_MAX_EDGE_PIXELS);
    }
  });

  it('never produces a zero edge on a long thin image', () => {
    // 0 is what a native resize call throws on, or draws as an empty canvas.
    // The short edge here scales to well under half a pixel.
    const target = receiptResizeTarget(20_000, 3);
    expect(target).toEqual({ width: RECEIPT_MAX_EDGE_PIXELS, height: 1 });
  });

  it('returns whole pixels', () => {
    const target = receiptResizeTarget(4001, 2999);
    expect(Number.isInteger(target?.width)).toBe(true);
    expect(Number.isInteger(target?.height)).toBe(true);
  });
});

describe('deciding not to touch the photograph at all', () => {
  it('leaves an image already inside the box alone', () => {
    // A screenshot of an emailed invoice, or a photo that has been through a
    // messaging app: already small, and a second lossy pass over text buys
    // nothing. A flat PNG screenshot re-encoded as JPEG can even grow.
    expect(receiptResizeTarget(1200, 900)).toBeNull();
    expect(receiptResizeTarget(900, 1200)).toBeNull();
  });

  it('does nothing at the boundary and something one pixel past it', () => {
    expect(receiptResizeTarget(RECEIPT_MAX_EDGE_PIXELS, RECEIPT_MAX_EDGE_PIXELS)).toBeNull();
    expect(receiptResizeTarget(RECEIPT_MAX_EDGE_PIXELS + 1, 1000)).not.toBeNull();
  });

  it('refuses rather than guesses when the picker gave no dimensions', () => {
    // expo-image-picker documents that width and height "can be 0 if the system
    // did not provide" them. Without both there is no aspect ratio, and a box
    // guessed off one edge is how a receipt gets stretched.
    expect(receiptResizeTarget(0, 0)).toBeNull();
    expect(receiptResizeTarget(4032, 0)).toBeNull();
    expect(receiptResizeTarget(0, 3024)).toBeNull();
  });

  it('refuses a dimension that is not a usable number', () => {
    expect(receiptResizeTarget(Number.NaN, 3024)).toBeNull();
    expect(receiptResizeTarget(4032, Number.NaN)).toBeNull();
    expect(receiptResizeTarget(Number.POSITIVE_INFINITY, 3024)).toBeNull();
    expect(receiptResizeTarget(-4032, 3024)).toBeNull();
  });
});

describe('what is uploaded when the resize fails', () => {
  const original = { uri: 'file:///receipt.heic', mimeType: 'image/heic' };
  const compressed = { uri: 'file:///receipt.jpg', mimeType: RECEIPT_COMPRESSED_MIME_TYPE };

  it('uploads the compressed file when the resize worked', async () => {
    expect(await compressedOrOriginal(original, async () => compressed)).toBe(compressed);
  });

  it('uploads the original when the resize threw', async () => {
    // The farmer is holding a piece of paper. A resize that threw must cost him
    // waiting, never the receipt.
    const result = await compressedOrOriginal(original, async () => {
      throw new Error('native module unavailable');
    });
    expect(result).toBe(original);
  });

  it('uploads the original when the resize threw synchronously', async () => {
    // A native module that is missing entirely throws on the call itself rather
    // than rejecting, which is a different path through the same try.
    const result = await compressedOrOriginal(original, () => {
      throw new Error('not linked');
    });
    expect(result).toBe(original);
  });

  it('uploads the original when the platform declined to compress', async () => {
    expect(await compressedOrOriginal(original, async () => null)).toBe(original);
  });

  it('swallows the failure rather than surfacing it', async () => {
    // There is no sentence for "we could not shrink your photo" because there is
    // no action attached to one. This asserts the absence: a rejection here
    // would reach a screen whose only job is to get a document filed.
    await expect(
      compressedOrOriginal(original, async () => {
        throw new Error('boom');
      }),
    ).resolves.toBeDefined();
  });
});

describe('the constants themselves', () => {
  it('re-encodes to a format the OCR endpoint and the accountant can both read', () => {
    // The endpoint reads jpeg, png and webp off magic bytes and refuses
    // everything else for free (IMAGE_FORMATS in the Worker's openrouter.ts), so
    // an iPhone HEIC picked out of the library only stops being a wasted trip to
    // the camera if it leaves here as one of the three.
    expect(RECEIPT_COMPRESSED_MIME_TYPE).toBe('image/jpeg');
    // And it is the extension the document is filed under: attachReceipt splits
    // the mime type to build the storage path.
    expect(RECEIPT_COMPRESSED_MIME_TYPE.split('/')[1]).toBe('jpeg');
  });

  it('holds the quality the 907KB observation was taken at', () => {
    // Unchanged on purpose. Moving the quality and the size together would throw
    // away the one real measurement there is to compare a device against.
    expect(RECEIPT_JPEG_QUALITY).toBe(0.7);
  });

  it('stays above the tile budget a vision model rescales into', () => {
    // Below roughly 1500 the model is no longer the binding constraint and the
    // small print starts paying for it; far above it the extra pixels are
    // discarded before a single character is read.
    expect(RECEIPT_MAX_EDGE_PIXELS).toBeGreaterThanOrEqual(1500);
    expect(RECEIPT_MAX_EDGE_PIXELS).toBeLessThanOrEqual(2000);
  });

  it('produces a photograph the Worker cannot answer 413 to', () => {
    // The endpoint's ceiling is 8MB. Even at a wildly pessimistic 2 bits per
    // pixel — JPEG at 0.7 on a photograph is nearer a quarter of that — a
    // compressed receipt is an order of magnitude under it, which is why the cap
    // is left where it is rather than tightened onto a fallback that still
    // sends the original.
    const pixels = RECEIPT_MAX_EDGE_PIXELS * RECEIPT_MAX_EDGE_PIXELS;
    const pessimisticBytes = pixels / 4;
    expect(pessimisticBytes).toBeLessThan(8 * 1024 * 1024);
  });
});
