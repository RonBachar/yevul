// Whether a farm is on a paid plan, stage 5 step 11.
//
// **This is courtesy and never enforcement, and the distinction is the whole
// reason the file needs a header.** prd.md section 12 is explicit that plan
// limits are enforced in the server and not in the client — "אכיפת מסלול בשרת
// ולא בקליינט... זה נכון גם כי קליינט ניתן לעקיפה וגם כי המכסה היא כסף אמיתי" —
// and gate.ts does exactly that: a receipt from a farm with no entitlement is
// refused with 403 `paid plan required` before the quota is touched, whatever
// this module happens to believe.
//
// What this module buys is one thing: **not walking a free-tier farmer through
// taking a photograph before telling him no.** He can be shown the offer at the
// moment he asks for the feature instead of after he has framed an invoice on a
// car bonnet. Delete this file and the product is still correct, only ruder.
//
// **It is therefore allowed to be wrong, and the direction it fails in is
// chosen.** `entitled` is `boolean | null`, and null means "we do not know" —
// the read has not finished, there is no farm yet, or the query failed. A
// caller must treat unknown as *allow*: hiding a paid feature because a select
// timed out would take the feature away from someone who paid for it, while
// letting an unentitled farmer through costs him one photograph and lands him on
// the same upgrade sentence from the server. One of those errors is recoverable
// and the other is a support ticket.
//
// The rule below is gate.ts's rule, deliberately reimplemented rather than
// approximated: the flag alone is not enough, because a subscription whose term
// has run out stays flagged active until the next webhook lands.

import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

// The two columns the RLS policy lets a member read. `subscriptions_select` in
// the core schema grants select to every active member of the farm; there is no
// insert or update policy at all, because entitlement only ever moves through
// the Worker with a service role.
export type SubscriptionRow = {
  entitlement_active: boolean;
  expires_at: string | null;
};

// **The same two conditions gate.ts applies, in the same order.** A missing row
// is not an error, it is the free tier — the signup trigger inserts one with
// entitlement_active false, and a farm provisioned some other way may have none
// at all. `now` is a parameter so this stays pure and testable; an unparseable
// expires_at yields NaN, and NaN > n is false, so a corrupt date reads as
// expired rather than as unlimited access.
export function farmEntitled(row: SubscriptionRow | null | undefined, now: Date): boolean {
  if (!row || row.entitlement_active !== true) return false;
  if (row.expires_at === null) return true;
  return new Date(row.expires_at).getTime() > now.getTime();
}

export type FarmEntitlementState = {
  loading: boolean;
  // null is "unknown", not "no". See the header for why a caller must let an
  // unknown through rather than refuse it.
  entitled: boolean | null;
};

export function useFarmEntitlement(
  supabase: SupabaseClient,
  farmId: string | null,
): FarmEntitlementState {
  const [state, setState] = useState<FarmEntitlementState>({ loading: true, entitled: null });

  useEffect(() => {
    // No farm yet means the caller is still loading one. Staying unknown rather
    // than answering false is what stops the entry point flickering through an
    // upgrade offer on every cold start.
    if (farmId === null) {
      setState({ loading: true, entitled: null });
      return;
    }

    let active = true;
    void supabase
      .from('subscriptions')
      .select('entitlement_active, expires_at')
      .eq('farm_id', farmId)
      .limit(1)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setState({ loading: false, entitled: null });
          return;
        }
        const row = (data as SubscriptionRow[] | null)?.[0];
        setState({ loading: false, entitled: farmEntitled(row, new Date()) });
      });

    return () => {
      active = false;
    };
  }, [supabase, farmId]);

  return state;
}
