import { describe, expect, it } from 'vitest';
import { pullSpinnerVisible } from './refresh';

// The rule the pull-to-refresh spinner lives by. The mobile app has no test
// runner, so the decision itself is kept here, away from React, and only the
// wiring stays on the device.
describe('pullSpinnerVisible', () => {
  it('shows nothing before the farmer has pulled', () => {
    expect(pullSpinnerVisible(null, [3])).toBe(false);
  });

  it('keeps spinning while the load that was asked for has not come back', () => {
    expect(pullSpinnerVisible([3], [3])).toBe(true);
  });

  it('stops once the load settles', () => {
    expect(pullSpinnerVisible([3], [4])).toBe(false);
  });

  // A failed load counts too. Otherwise a farmer with no signal pulls, nothing
  // changes on screen, and the wheel turns until the app is killed.
  it('stops on a load that settled by failing, which moves the count all the same', () => {
    expect(pullSpinnerVisible([7], [8])).toBe(false);
  });

  // Two loads can land between two renders, and then the count steps by more
  // than one. This is why the comparison is <= and not ===.
  it('stops when more than one load settled between renders', () => {
    expect(pullSpinnerVisible([3], [5])).toBe(false);
  });

  it('waits for every source a screen pulled, not just the first to answer', () => {
    expect(pullSpinnerVisible([3, 9], [4, 9])).toBe(true);
    expect(pullSpinnerVisible([3, 9], [3, 10])).toBe(true);
    expect(pullSpinnerVisible([3, 9], [4, 10])).toBe(false);
  });

  // A second pull while one is still in flight re-records the counts rather
  // than stacking a second wait, so the next load to settle ends the spinner.
  it('treats a second pull as a fresh wait on the counts as they stand now', () => {
    const afterFirstPull = pullSpinnerVisible([3], [3]);
    expect(afterFirstPull).toBe(true);
    // The farmer pulls again before anything came back: same counts recorded.
    expect(pullSpinnerVisible([3], [3])).toBe(true);
    // The superseded load never settles; the one that replaced it does.
    expect(pullSpinnerVisible([3], [4])).toBe(false);
  });
});
