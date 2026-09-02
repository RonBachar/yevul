// Tests for packages/shared/src/entitlement.ts.
//
// **The rule under test is gate.ts's rule, and the point of testing it here is
// that the two must agree.** The server is the enforcement — a scan from an
// unentitled farm is refused with 403 whether this function is right or wrong —
// but if the client says "paid" where the server says "free", the farmer is
// walked through photographing an invoice only to be refused at the end, which
// is precisely the experience step 11 exists to remove.
//
// The case that matters most is the expired subscription. `entitlement_active`
// stays true until a webhook flips it, so a term that ran out yesterday still
// reads as active if only the flag is consulted — and that is unlimited free
// access for the length of the gap.

import { describe, expect, it } from 'vitest';
import { farmEntitled, type SubscriptionRow } from './entitlement';

const NOW = new Date('2026-09-02T09:00:00Z');

function at(offsetMillis: number): string {
  return new Date(NOW.getTime() + offsetMillis).toISOString();
}

describe('farmEntitled', () => {
  // The signup trigger inserts a row with entitlement_active false, so this is
  // the ordinary state of a brand new farm rather than an edge case.
  it('is false for a farm on the free tier', () => {
    expect(farmEntitled({ entitlement_active: false, expires_at: null }, NOW)).toBe(false);
  });

  // A farm provisioned before the trigger existed, or a select that came back
  // empty because RLS filtered it. Absence is the free tier, not an error.
  it('is false when there is no subscription row at all', () => {
    expect(farmEntitled(null, NOW)).toBe(false);
    expect(farmEntitled(undefined, NOW)).toBe(false);
  });

  // The paying farm. A null expiry is an open-ended entitlement, which is what
  // an active store subscription looks like between renewals.
  it('is true for an active entitlement with no expiry', () => {
    expect(farmEntitled({ entitlement_active: true, expires_at: null }, NOW)).toBe(true);
  });

  it('is true for an active entitlement whose term has not run out', () => {
    expect(farmEntitled({ entitlement_active: true, expires_at: at(60_000) }, NOW)).toBe(true);
  });

  // **The one that would be wrong if only the flag were read.** gate.ts checks
  // both for exactly this reason.
  it('is false for an active entitlement whose term has run out', () => {
    expect(farmEntitled({ entitlement_active: true, expires_at: at(-60_000) }, NOW)).toBe(false);
  });

  // Strictly greater than now, matching the Worker. The instant it expires it
  // has expired.
  it('is false at the exact moment of expiry', () => {
    expect(farmEntitled({ entitlement_active: true, expires_at: at(0) }, NOW)).toBe(false);
  });

  // A future expiry cannot rescue a flag that is off: cancelled today, paid up
  // until the end of the month, and the store has already told us.
  it('is false when the flag is off even with a future expiry', () => {
    expect(farmEntitled({ entitlement_active: false, expires_at: at(60_000) }, NOW)).toBe(false);
  });

  // An unparseable date yields NaN, and NaN is never greater than anything, so
  // corrupt data reads as expired rather than as unlimited access.
  it('is false for an expiry that is not a date', () => {
    const corrupt = { entitlement_active: true, expires_at: 'לנצח' } as SubscriptionRow;
    expect(farmEntitled(corrupt, NOW)).toBe(false);
  });

  // The column is boolean in Postgres, but this row arrives as JSON over
  // PostgREST, and a truthy-but-not-true value must not open a paid feature.
  it('requires the flag to be exactly true', () => {
    const truthy = { entitlement_active: 'true', expires_at: null } as unknown as SubscriptionRow;
    expect(farmEntitled(truthy, NOW)).toBe(false);
  });
});
