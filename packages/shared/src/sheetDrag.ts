import { spacing, touchTarget } from './tokens';

// The arithmetic behind dragging a bottom sheet closed.
//
// It lives here, away from React Native, for the same reason voiceRecording.ts
// does: the mobile app has no test runner, so every decision that can be made
// without a device is made in this package and only the wiring stays on the
// phone. What is left on the device is the part no unit test could judge anyway
// — whether the motion feels smooth under a thumb.
//
// **Who this is forgiving for.** The farmers using this app are 55 to 70, often
// with a work glove on, and the sheet they are holding may contain a
// half-entered expense. Losing that to a gesture nobody meant to make is far
// worse than a drag that springs back and has to be repeated, so every
// threshold below is biased towards keeping the sheet open.

// The travel that dismisses on its own, with no help from velocity: two touch
// targets. It is stated in touch targets rather than as a fraction of the sheet
// because it should be the same gesture on every sheet in the app — a farmer
// learns one distance, not a different one for the three-row capture sheet and
// the four-field task sheet. Nobody's finger wanders 96 points down a grabber
// by accident.
export const SHEET_DISMISS_DISTANCE = touchTarget.min * 2;

// A flick dismisses earlier, but never from nothing. Below this the gesture is
// a tap, a tremor or a finger settling, and a flick rule with no distance floor
// is exactly how a sheet starts closing "sometimes".
export const SHEET_FLICK_DISTANCE = spacing.s32;

// Points per millisecond, the unit PanResponder's gestureState.vy reports in. A
// deliberate slow drag runs at roughly 0.1 to 0.3; a thrown flick is 1 and up.
// 0.7 sits above anything a hand produces while merely lowering itself.
export const SHEET_DISMISS_VELOCITY = 0.7;

// How far the scrim is allowed to lighten while the sheet is being dragged. It
// fades so that letting go now reads as "this will close", but it never fades
// out: at zero the sheet would appear to float over the live screen behind it,
// and a drag that springs back would have flashed the whole app in the farmer's
// face for no reason.
export const SHEET_SCRIM_MIN_OPACITY = 0.35;

// Bounds on the exit animation. The floor stops a hard flick from teleporting
// the sheet away with no motion to follow; the ceiling stops a barely-qualifying
// drag from crawling off the screen.
export const SHEET_DISMISS_MIN_MS = 120;
export const SHEET_DISMISS_MAX_MS = 260;

// Where the sheet sits for a given raw gesture dy.
//
// Downward only. Dragging up is ignored rather than resisted or rubber-banded:
// the sheet is already sitting on the bottom edge, so lifting it would open a
// strip of nothing underneath, and this audience is not served by a surface
// that moves in a direction it cannot be released in.
export function sheetDragOffset(dy: number): number {
  if (!(dy > 0)) return 0;
  return dy;
}

// The travel that dismisses this particular sheet.
//
// Normally the flat 96. The exception is a sheet shorter than 192 points, where
// 96 would mean dragging it more than halfway off the screen before it agreed
// to close — so the threshold is capped at half the sheet's own height. No
// sheet in the app is that short today; the cap is here so that one added later
// cannot quietly become undismissable.
export function sheetDismissDistance(sheetHeight: number): number {
  if (!(sheetHeight > 0)) return SHEET_DISMISS_DISTANCE;
  return Math.min(SHEET_DISMISS_DISTANCE, sheetHeight / 2);
}

// Whether letting go here closes the sheet.
//
// Two ways in, and both of them require real downward travel. Distance alone is
// the patient path, for a hand that drags slowly and stops. Velocity is the
// impatient one, and it is deliberately not sufficient on its own — a fast
// gesture that moved almost nowhere is a tap with a slip in it, not a dismissal.
export function shouldDismissSheet({
  dy,
  vy,
  sheetHeight,
}: {
  dy: number;
  vy: number;
  sheetHeight: number;
}): boolean {
  const travel = sheetDragOffset(dy);
  if (travel <= 0) return false;
  if (travel >= sheetDismissDistance(sheetHeight)) return true;
  return vy >= SHEET_DISMISS_VELOCITY && travel >= SHEET_FLICK_DISTANCE;
}

// How far the sheet still has to travel to be gone.
//
// The sheet's bottom edge is the screen's bottom edge, so its own height is
// exactly the distance that clears it. windowHeight is the fallback for the one
// frame before onLayout has measured anything, and is always an overshoot
// rather than an undershoot: a sheet left half on screen at the end of its exit
// is a visible fault, a sheet driven further than needed is not.
export function sheetExitOffset(sheetHeight: number, windowHeight: number): number {
  if (!(sheetHeight > 0)) return Math.max(windowHeight, 0);
  return sheetHeight;
}

// How long the exit should take, so that it continues the gesture instead of
// replacing it. A sheet thrown downward keeps roughly the speed it was thrown
// at; one nudged past the distance threshold with no speed left gets the
// ceiling. Zero and negative velocities fall through to the ceiling too, which
// is what a drag that stopped dead before release produces.
export function sheetDismissDuration({
  dy,
  vy,
  exitOffset,
}: {
  dy: number;
  vy: number;
  exitOffset: number;
}): number {
  const remaining = Math.max(0, exitOffset - sheetDragOffset(dy));
  const fromVelocity = vy > 0 ? remaining / vy : Number.POSITIVE_INFINITY;
  return Math.round(Math.min(SHEET_DISMISS_MAX_MS, Math.max(SHEET_DISMISS_MIN_MS, fromVelocity)));
}

// The scrim's opacity as a function of how far the sheet has been dragged,
// shaped as the two ranges Animated.interpolate takes.
//
// It is returned as ranges rather than computed per frame on purpose: the
// interpolation has to be handed to the native driver once and evaluated on the
// UI thread, so a JavaScript function called on every move would be the exact
// thing this whole change exists to avoid. A two-point clamped range is plain
// linear interpolation, so pinning both ends pins the whole curve.
//
// The degenerate case is real and reaches this function: sheetHeight is 0 until
// the first layout pass, and an inputRange of [0, 0] divides by zero. A flat
// range at full opacity is the honest answer there — nothing has been dragged
// yet.
export function sheetScrimFade(sheetHeight: number): {
  inputRange: number[];
  outputRange: number[];
} {
  if (!(sheetHeight > 0)) return { inputRange: [0, 1], outputRange: [1, 1] };
  return { inputRange: [0, sheetHeight], outputRange: [1, SHEET_SCRIM_MIN_OPACITY] };
}
