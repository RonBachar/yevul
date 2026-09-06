import { describe, expect, it } from 'vitest';
import { AVATAR_MAX_EDGE_PIXELS, avatarResizeTarget } from './avatarImage';

describe('avatarResizeTarget', () => {
  it('scales an oversized picture down by its longest edge', () => {
    expect(avatarResizeTarget(2048, 1024)).toEqual({ width: 512, height: 256 });
    expect(avatarResizeTarget(1024, 2048)).toEqual({ width: 256, height: 512 });
  });

  it('keeps the aspect ratio rather than squaring the face', () => {
    const target = avatarResizeTarget(3000, 2000);
    expect(target).not.toBeNull();
    expect(target!.width / target!.height).toBeCloseTo(1.5, 2);
  });

  // The whole point of this module: unlike receiptResizeTarget, a picture that
  // is already small still comes back with dimensions, so the caller re-encodes
  // it. A flat PNG under the ceiling can still be tens of megabytes, which is
  // what the storage bucket rejects.
  it('still returns a target for a picture already under the ceiling', () => {
    expect(avatarResizeTarget(300, 200)).toEqual({ width: 300, height: 200 });
    expect(avatarResizeTarget(AVATAR_MAX_EDGE_PIXELS, AVATAR_MAX_EDGE_PIXELS)).toEqual({
      width: AVATAR_MAX_EDGE_PIXELS,
      height: AVATAR_MAX_EDGE_PIXELS,
    });
  });

  it('never returns a zero edge for a very long thin picture', () => {
    const target = avatarResizeTarget(4000, 3);
    expect(target).toEqual({ width: 512, height: 1 });
  });

  it('refuses dimensions it cannot build an aspect ratio from', () => {
    expect(avatarResizeTarget(0, 800)).toBeNull();
    expect(avatarResizeTarget(800, 0)).toBeNull();
    expect(avatarResizeTarget(Number.NaN, 800)).toBeNull();
    expect(avatarResizeTarget(-10, 800)).toBeNull();
  });

  it('rounds to whole pixels', () => {
    const target = avatarResizeTarget(1000, 333);
    expect(target).toEqual({ width: 512, height: 170 });
    expect(Number.isInteger(target!.width)).toBe(true);
    expect(Number.isInteger(target!.height)).toBe(true);
  });
});
