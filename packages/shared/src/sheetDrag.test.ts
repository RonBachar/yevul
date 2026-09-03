import { describe, expect, it } from 'vitest';
import {
  SHEET_DISMISS_DISTANCE,
  SHEET_DISMISS_MAX_MS,
  SHEET_DISMISS_MIN_MS,
  SHEET_SCRIM_MIN_OPACITY,
  sheetDismissDistance,
  sheetDismissDuration,
  sheetDragOffset,
  sheetExitOffset,
  sheetScrimFade,
  shouldDismissSheet,
} from './sheetDrag';

// The mobile app has no test runner, so the gesture's arithmetic is decided
// here and only the wiring stays on the device. What these tests cannot judge,
// and nothing here pretends to, is whether the resulting motion feels smooth.

describe('sheetDragOffset', () => {
  it('follows the finger downward', () => {
    expect(sheetDragOffset(72)).toBe(72);
  });

  // The sheet already sits on the bottom edge. Lifting it would open a strip of
  // nothing underneath it.
  it('ignores an upward drag rather than lifting the sheet', () => {
    expect(sheetDragOffset(-40)).toBe(0);
    expect(sheetDragOffset(0)).toBe(0);
  });

  // A hand that wobbles up before pulling down nets out to the pull, which is
  // what a farmer means by it.
  it('reads a wobble up and then down as the downward distance that is left', () => {
    expect(sheetDragOffset(-30 + 80)).toBe(50);
  });
});

describe('sheetDismissDistance', () => {
  it('is two touch targets on any sheet tall enough to give them', () => {
    expect(sheetDismissDistance(600)).toBe(SHEET_DISMISS_DISTANCE);
    expect(SHEET_DISMISS_DISTANCE).toBe(96);
  });

  // No sheet in the app is this short today. The cap exists so one added later
  // cannot need to be dragged further than it is tall.
  it('never asks for more than half the sheet on a very short sheet', () => {
    expect(sheetDismissDistance(120)).toBe(60);
  });

  it('falls back to the flat distance before the sheet has been measured', () => {
    expect(sheetDismissDistance(0)).toBe(SHEET_DISMISS_DISTANCE);
  });
});

describe('shouldDismissSheet', () => {
  const tall = { sheetHeight: 600 };

  it('closes on a slow drag that went the whole distance', () => {
    expect(shouldDismissSheet({ dy: 96, vy: 0.05, ...tall })).toBe(true);
  });

  // The case that matters most: a half-typed expense must survive a hand that
  // rested on the grabber and slid a little.
  it('holds on to a short drag, however it was released', () => {
    expect(shouldDismissSheet({ dy: 20, vy: 0, ...tall })).toBe(false);
    expect(shouldDismissSheet({ dy: 20, vy: 2.5, ...tall })).toBe(false);
  });

  it('closes on a firm flick that also travelled far enough', () => {
    expect(shouldDismissSheet({ dy: 40, vy: 0.9, ...tall })).toBe(true);
  });

  // Velocity is never sufficient on its own. A fast gesture that moved almost
  // nowhere is a tap with a slip in it.
  it('refuses a fast flick that barely moved', () => {
    expect(shouldDismissSheet({ dy: 8, vy: 4, ...tall })).toBe(false);
  });

  it('refuses a long drag that was too slow to be a flick and too short to be a drag', () => {
    expect(shouldDismissSheet({ dy: 60, vy: 0.4, ...tall })).toBe(false);
  });

  it('never closes on an upward drag, at any speed', () => {
    expect(shouldDismissSheet({ dy: -200, vy: -3, ...tall })).toBe(false);
  });

  it('never closes when nothing moved', () => {
    expect(shouldDismissSheet({ dy: 0, vy: 0, ...tall })).toBe(false);
  });

  it('lets a short sheet close on its own halfway mark', () => {
    expect(shouldDismissSheet({ dy: 60, vy: 0, sheetHeight: 120 })).toBe(true);
    expect(shouldDismissSheet({ dy: 60, vy: 0, sheetHeight: 600 })).toBe(false);
  });
});

describe('sheetExitOffset', () => {
  it('is the sheet height, which is exactly what clears the bottom edge', () => {
    expect(sheetExitOffset(420, 900)).toBe(420);
  });

  // Overshooting is invisible; undershooting leaves the sheet stranded half on
  // screen at the end of its exit.
  it('overshoots with the window height before the sheet has been measured', () => {
    expect(sheetExitOffset(0, 900)).toBe(900);
  });
});

describe('sheetDismissDuration', () => {
  it('carries a thrown sheet at roughly the speed it was thrown', () => {
    // 300 points left at 1.5 points per millisecond.
    expect(sheetDismissDuration({ dy: 100, vy: 1.5, exitOffset: 400 })).toBe(200);
  });

  it('does not teleport a very hard flick', () => {
    expect(sheetDismissDuration({ dy: 100, vy: 20, exitOffset: 400 })).toBe(SHEET_DISMISS_MIN_MS);
  });

  it('does not crawl when the drag stopped dead before release', () => {
    expect(sheetDismissDuration({ dy: 100, vy: 0, exitOffset: 400 })).toBe(SHEET_DISMISS_MAX_MS);
  });

  it('treats an upward velocity at release as no velocity at all', () => {
    expect(sheetDismissDuration({ dy: 100, vy: -2, exitOffset: 400 })).toBe(SHEET_DISMISS_MAX_MS);
  });

  it('never returns a duration outside its own bounds', () => {
    for (const vy of [0, 0.1, 0.7, 1, 3, 40]) {
      const duration = sheetDismissDuration({ dy: 0, vy, exitOffset: 600 });
      expect(duration).toBeGreaterThanOrEqual(SHEET_DISMISS_MIN_MS);
      expect(duration).toBeLessThanOrEqual(SHEET_DISMISS_MAX_MS);
    }
  });
});

describe('sheetScrimFade', () => {
  it('is fully opaque at rest and at its floor once the sheet has travelled its height', () => {
    expect(sheetScrimFade(500)).toEqual({
      inputRange: [0, 500],
      outputRange: [1, SHEET_SCRIM_MIN_OPACITY],
    });
  });

  // The screen behind the sheet must never be handed back to the farmer during
  // a drag he is about to abandon.
  it('never fades the scrim away completely', () => {
    expect(SHEET_SCRIM_MIN_OPACITY).toBeGreaterThan(0);
    expect(sheetScrimFade(500).outputRange).toEqual([1, SHEET_SCRIM_MIN_OPACITY]);
  });

  // An inputRange of [0, 0] divides by zero inside Animated, and 0 is what the
  // sheet height is until the first layout pass. [0, 1] is monotonically
  // increasing, which is the only shape Animated accepts, and a flat output
  // means nothing fades until a real height arrives.
  it('returns a usable flat range before the sheet has been measured', () => {
    expect(sheetScrimFade(0)).toEqual({ inputRange: [0, 1], outputRange: [1, 1] });
  });
});
