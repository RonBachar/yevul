import {
  avatarResizeTarget,
  compressedOrOriginal,
  AVATAR_COMPRESSED_MIME_TYPE,
  AVATAR_JPEG_QUALITY,
} from '@yevul/shared';

// Shrinking a profile picture in the browser. The sibling of
// frontend/web/src/lib/receiptImage.ts, same canvas, same fallback helper, but a
// different rule, and the difference is the bug this file exists to fix.
//
// The avatar picker used to call compressReceiptFile. That function returns the
// ORIGINAL file whenever the image is already under 1600 pixels on its longest
// edge, which is correct for a receipt and wrong here: the avatars bucket
// rejects on bytes (8MB) and on mime type, not on dimensions. A flat PNG at
// 800x800 clears the receipt threshold, goes up untouched as image/png at tens
// of megabytes, and storage answers 400. All the farmer sees is
// "members.avatar.error". So here every decodable image is re-encoded, always.

// A canvas cannot read a PDF, and rasterising an SVG throws away the one thing
// that made it an SVG. Neither is a plausible profile picture; both are left
// alone rather than mangled, and the bucket's own allow list is what refuses
// them.
function isResizableImage(file: File): boolean {
  const type = file.type.trim().toLowerCase();
  return type.startsWith('image/') && type !== 'image/svg+xml';
}

// An <img> and an object URL rather than createImageBitmap, for EXIF rotation:
// browsers apply orientation to <img> by default, so what is drawn is already
// upright. Taking the other path would file a portrait selfie on its side.
function decode(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('avatar_image_decode_failed'));
    image.src = url;
  });
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), AVATAR_COMPRESSED_MIME_TYPE, AVATAR_JPEG_QUALITY);
  });
}

function jpegName(original: string): string {
  const trimmed = original.replace(/\.[^./\\]+$/, '');
  return `${trimmed === '' ? 'avatar' : trimmed}.jpg`;
}

// Returns a small JPEG, or the original when the file is not a raster image or
// when anything at all went wrong. Never throws: a failed canvas should not cost
// the user the attempt, and the upload's own error message covers the rest.
export async function compressAvatarFile(file: File): Promise<File> {
  if (!isResizableImage(file)) return file;

  return compressedOrOriginal(file, async () => {
    const url = URL.createObjectURL(file);
    try {
      const image = await decode(url);
      // null only when the decoded image has no usable dimensions. Anything
      // else, including a picture already smaller than the ceiling, comes back
      // with a target and is re-encoded.
      const target = avatarResizeTarget(image.naturalWidth, image.naturalHeight);
      if (target === null) return null;

      const canvas = document.createElement('canvas');
      canvas.width = target.width;
      canvas.height = target.height;
      const context = canvas.getContext('2d');
      if (context === null) return null;
      // The bucket allows a transparent PNG in but JPEG has no alpha, and an
      // unpainted canvas encodes transparency as black. White keeps a cut-out
      // logo or a PNG portrait looking like itself.
      context.fillStyle = '#FFFFFF';
      context.fillRect(0, 0, target.width, target.height);
      context.drawImage(image, 0, 0, target.width, target.height);

      const blob = await toBlob(canvas);
      if (blob === null) return null;

      return new File([blob], jpegName(file.name), { type: AVATAR_COMPRESSED_MIME_TYPE });
    } finally {
      URL.revokeObjectURL(url);
    }
  });
}
