import {
  compressedOrOriginal,
  receiptResizeTarget,
  RECEIPT_COMPRESSED_MIME_TYPE,
  RECEIPT_JPEG_QUALITY,
} from '@yevul/shared';

// Shrinking a receipt before it is uploaded, the browser half of
// frontend/mobile/src/lib/receiptImage.ts. Same two numbers, same fallback, same
// module in packages/shared deciding both.
//
// **expo-image-manipulator does not exist here, and nothing was installed to
// replace it.** A canvas resizes an image with no dependency at all, which is
// the whole of what this file is.
//
// **The web was compressed even though it is not the phone, and the reason is
// that it is the *least* bounded path in the product.** The OCR endpoint's 8MB
// ceiling is on the Worker, and the browser never calls it — a receipt attached
// here goes straight into Supabase Storage, where the bucket has no
// file_size_limit set. So this is the one place a 40MB flatbed scan or a DSLR
// photograph can land whole, and it is also where the bookkeeping actually gets
// done. It was the easiest path to leave alone and the worst one to.

// ============================================================
// What is left alone.
// ============================================================

// The file input accepts `image/*,application/pdf`, and a PDF invoice emailed by
// a supplier is a real thing an accountant attaches. A canvas cannot read one,
// and a PDF that came out of this function as a JPEG of its first page would be
// a document quietly replaced by a picture of part of it.
//
// SVG is excluded for a different reason: a browser will happily draw one to a
// canvas, and the result would be a raster of a thing that was infinitely
// scalable. Nobody photographs a receipt as an SVG, so the case only arises by
// accident, and the accident is better left untouched.
function isResizableImage(file: File): boolean {
  const type = file.type.trim().toLowerCase();
  return type.startsWith('image/') && type !== 'image/svg+xml';
}

// ============================================================
// The resize.
// ============================================================

// **An <img> and an object URL, not createImageBitmap, and the reason is EXIF
// rotation.** A photograph off a phone carries its orientation in EXIF rather
// than in the pixels. Browsers have applied it to <img> by default since 2020
// (`image-orientation: from-image` became the initial value), and both
// naturalWidth/naturalHeight and drawImage see the corrected image, so what this
// writes out is upright with no EXIF needed. createImageBitmap needs an explicit
// `imageOrientation` option that older Safari ignores, and ignoring it here
// would mean stripping the EXIF off a photograph whose pixels were never
// rotated: a receipt filed sideways, permanently.
function decode(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('receipt_image_decode_failed'));
    image.src = url;
  });
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), RECEIPT_COMPRESSED_MIME_TYPE, RECEIPT_JPEG_QUALITY);
  });
}

// The name matters: attachReceipt builds the storage path out of the farm and
// the expense id, so this is never read as a path — but a File with the old
// .heic or .png name and JPEG bytes inside it is the sort of thing that is
// confusing for years afterwards the one time somebody downloads it.
function jpegName(original: string): string {
  const trimmed = original.replace(/\.[^./\\]+$/, '');
  return `${trimmed === '' ? 'receipt' : trimmed}.jpg`;
}

// Returns the compressed file, or the original untouched when there was nothing
// to do or when anything at all went wrong. It never throws and never rejects:
// a bookkeeper mid-way through filing a receipt must not lose it to a canvas.
export async function compressReceiptFile(file: File): Promise<File> {
  if (!isResizableImage(file)) return file;

  return compressedOrOriginal(file, async () => {
    const url = URL.createObjectURL(file);
    try {
      const image = await decode(url);
      // Asked after the decode rather than before, because unlike the phone's
      // picker the browser hands over no dimensions with the file. `null` here
      // is a receipt already inside the box — a screenshot of an emailed
      // invoice, typically — and re-encoding one would cost a second lossy pass
      // over text for nothing. See receiptResizeTarget.
      const target = receiptResizeTarget(image.naturalWidth, image.naturalHeight);
      if (target === null) return null;

      const canvas = document.createElement('canvas');
      canvas.width = target.width;
      canvas.height = target.height;
      const context = canvas.getContext('2d');
      // A context is null when the browser refuses one, which happens on a page
      // that has exhausted its canvas memory. Treated as "leave the file alone",
      // which is what every other failure here does.
      if (context === null) return null;
      context.drawImage(image, 0, 0, target.width, target.height);

      const blob = await toBlob(canvas);
      // toBlob answers null when the encode failed, and it does so without
      // throwing, so this is the one failure the try/catch would miss.
      if (blob === null) return null;

      return new File([blob], jpegName(file.name), { type: RECEIPT_COMPRESSED_MIME_TYPE });
    } finally {
      // The blob URL pins the whole original file in memory until it is revoked,
      // and on this path the original is the largest thing on the page.
      URL.revokeObjectURL(url);
    }
  });
}
