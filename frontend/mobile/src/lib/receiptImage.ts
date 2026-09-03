import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import {
  compressedOrOriginal,
  receiptResizeTarget,
  RECEIPT_COMPRESSED_MIME_TYPE,
  RECEIPT_JPEG_QUALITY,
} from '@yevul/shared';

// Shrinking a picked receipt before it is uploaded, stage 5, docs/roadmap.md:
// "דחיסת תמונה בקליינט לפני העלאה".
//
// **The only place in the app that touches expo-image-manipulator**, the same
// promise useReceiptScan makes about expo-image-picker: one place a native call
// can fail and one place to read when it does.
//
// **Compression happens once, here, at the moment the picker returns — not at
// each upload.** There are two pickers (useReceiptScan and ExpenseSheet) and
// three uploads, and on the scan route the *same file* is uploaded twice: once
// to the Worker to be read, and again to storage when the farmer confirms the
// expense. Compressing per upload would run the manipulator twice over the same
// bytes and, worse, would let the two drift — the model reading one image and
// the accountant filing another. Doing it at the picker makes the invariant flat
// and checkable: **a picked receipt is already compressed.**
//
// **This is not what ImagePicker's `quality` option does, and both are kept.**
// `quality` re-encodes the JPEG at a lower quality and hands back the full 12MP
// raster; the pixel count is where the bytes actually are. The picker still
// asks for 0.7 and this still resizes, because they are two different savings.
//
// The numbers, and why 1600 and 0.7, are in packages/shared/src/receiptImage.ts
// with the tests. Nothing is decided here.

// What the picker handed back, once it has been through this module. The uri is
// a local file:// path — the manipulator writes its result into the cache
// directory — and the mime is what attachReceipt turns into the storage
// extension and what the receipt viewer reads back.
export type PickedReceipt = { uri: string; mimeType: string };

// The asset fields this needs off ImagePickerAsset. Structural rather than the
// library's own type, so nothing outside the two picker call sites has to import
// expo-image-picker to describe a photograph.
export type PickedImageAsset = {
  uri: string;
  width: number;
  height: number;
  mimeType?: string | null;
};

// **image/jpeg is the fallback and not a claim**, and it is the same fallback
// that was here before compression existed: the OCR endpoint reads the real
// format off the magic bytes and answers 400 unsupported_format if it cannot, so
// a wrong guess cannot mislabel what is scanned. What it decides is the
// extension the document is filed under.
function pickedMimeType(asset: PickedImageAsset): string {
  return asset.mimeType ?? 'image/jpeg';
}

export async function compressPickedReceipt(asset: PickedImageAsset): Promise<PickedReceipt> {
  const original: PickedReceipt = { uri: asset.uri, mimeType: pickedMimeType(asset) };

  // Asked before the native module is touched, so a photograph that is already
  // small costs nothing at all — no decode, no re-encode, no second file in the
  // cache directory. See receiptResizeTarget for the second reason this can be
  // null: a picker that reported no dimensions.
  const target = receiptResizeTarget(asset.width, asset.height);
  if (target === null) return original;

  // **A failure here uploads the original and says nothing.** See
  // compressedOrOriginal: everything downstream of the fallback is a path that
  // already works, because it is the path every receipt took before this module
  // existed.
  return compressedOrOriginal(original, async () => {
    const context = ImageManipulator.manipulate(asset.uri).resize(target);
    const rendered = await context.renderAsync();
    try {
      // JPEG unconditionally, which is what settles HEIC: an iPhone hands back
      // image/heic for a library pick, the OCR endpoint refuses it, and the
      // farmer spends a trip to the camera to find out. The manipulator decodes
      // HEIC natively on iOS, so the endpoint never sees one on this path.
      const saved = await rendered.saveAsync({
        compress: RECEIPT_JPEG_QUALITY,
        format: SaveFormat.JPEG,
      });
      return { uri: saved.uri, mimeType: RECEIPT_COMPRESSED_MIME_TYPE };
    } finally {
      // Both, and in this order, which is what expo-image-manipulator's own
      // deprecated manipulateAsync does. They hold native bitmaps: the rendered
      // one is roughly 8MB at this size and the context still has the decode of
      // the 12MP original behind it, which is several times that. Handing them
      // back now rather than at the next collection is the one case
      // SharedObject.release documents itself for, and this is a phone that may
      // be old.
      //
      // Guarded, because a release that throws must not turn a file that was
      // written perfectly well into a fallback upload of the 12MP original.
      try {
        context.release();
        rendered.release();
      } catch {
        // The collector will take them instead. The file is already on disk.
      }
    }
  });
}
