// Shrinking a profile picture before it is uploaded.
//
// **Why this is not receiptImage.ts.** The avatar path reused the receipt
// compressor and that is exactly what broke it. `receiptResizeTarget` returns
// null for anything already under 1600 pixels on the long edge, on purpose: a
// screenshot of an emailed invoice should not take a second lossy pass over its
// text. For a receipt that is right. For an avatar it is the bug, because
// "already small enough" is a statement about DIMENSIONS and the storage bucket
// rejects on BYTES. A flat PNG at 800x800 is comfortably under the receipt
// threshold and can still be tens of megabytes, so it went up untouched, as
// image/png, and the avatars bucket answered 400 (its ceiling is 8MB). The
// farmer saw only "we could not upload the picture".
//
// So the rule here is the opposite one: **an avatar is always re-encoded.**
// Re-encoding is what guarantees both things the bucket cares about, a small
// number of bytes and a mime type on its allow list, and it costs nothing worth
// protecting — a face at 512 pixels is not a document whose small print has to
// survive.
//
// The decisions live here rather than in either client because neither client
// has a test runner, the same argument as receiptImage.ts and voiceRecording.ts.

// **512 on the longest edge.** The picture is rendered as a 32px circle beside a
// member's name and, at the largest, as a preview a few times that. 512 leaves
// room for a high-density screen and for whatever bigger placement this grows
// into later, and still lands a JPEG in the tens of kilobytes.
export const AVATAR_MAX_EDGE_PIXELS = 512;

// Higher than the receipt's 0.7 because the subject is a face rather than
// printed characters, and a face shows JPEG blocking earlier than text does. At
// 512 pixels the extra quality costs a few kilobytes.
export const AVATAR_JPEG_QUALITY = 0.82;

// JPEG for the same reason receipts are: it is on the bucket's allow list, it
// settles the iPhone's image/heic, and it is what the stored object's extension
// is derived from (see uploadAvatar in members.ts).
export const AVATAR_COMPRESSED_MIME_TYPE = 'image/jpeg';

export type AvatarResizeTarget = { width: number; height: number };

// The size to draw at. **Never null for a decodable image**, which is the whole
// difference from receiptResizeTarget: an image already under the ceiling still
// comes back with its own dimensions, so the caller re-encodes it instead of
// passing the original bytes through. null means only "these dimensions are
// unusable", the one case where there is no aspect ratio to preserve and
// guessing one would stretch the face.
export function avatarResizeTarget(width: number, height: number): AvatarResizeTarget | null {
  if (!isUsableDimension(width) || !isUsableDimension(height)) return null;

  const longest = Math.max(width, height);
  if (longest <= AVATAR_MAX_EDGE_PIXELS) {
    return { width: Math.round(width), height: Math.round(height) };
  }

  // Scaled off the longest edge so the aspect ratio survives; a stretched face
  // is worse than a small one.
  const scale = AVATAR_MAX_EDGE_PIXELS / longest;
  return { width: scaledEdge(width, scale), height: scaledEdge(height, scale) };
}

function isUsableDimension(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function scaledEdge(edge: number, scale: number): number {
  return Math.max(1, Math.round(edge * scale));
}
