import { useCallback, useState } from 'react';

// What a pull-to-refresh spinner needs, and what this package could not say
// until now: whether the reload the farmer asked for has come back.
//
// Neither of the two obvious answers works. `refresh()` returns void, so the
// caller cannot await it. And `loading` is deliberately a first-load-only flag
// in every list hook here — set true once, at mount, never again — so that a
// refresh does not blank rows that are already on screen. Driving a spinner
// from it would mean the spinner never appears at all.
//
// Guessing from the data is worse, and wrong in exactly the case that matters:
// a reload that fails the same way twice writes no new state, React bails out
// of the re-render, and a spinner waiting on a changed array hangs forever.
//
// So each list hook counts its own completed loads instead. The count moves
// once per load that was allowed to finish — success and failure alike — and
// never for one that a newer load superseded.

// The two things a screen needs from a hook in order to pull it: a way to ask
// for fresh data, and a way to know the answer arrived. Every list state in
// this package satisfies this structurally.
export type RefreshSource = {
  refresh: () => void;
  loadCount: number;
};

export function useLoadCount(): { loadCount: number; settle: () => void } {
  const [loadCount, setLoadCount] = useState(0);
  const settle = useCallback(() => setLoadCount((value) => value + 1), []);
  return { loadCount, settle };
}

// Whether the spinner is still owed a load.
//
// `pulledAt` holds the counts as they stood when the farmer pulled, one per
// source, or null before any pull has happened. The spinner stays up while any
// source is still sitting on the count it had then, so a screen fed by more
// than one query waits for all of them.
//
// `<=` rather than `===` on purpose: two loads can settle between two renders,
// and a rule that only recognised a step of exactly one would leave the wheel
// turning forever the one time it mattered.
export function pullSpinnerVisible(pulledAt: number[] | null, loadCounts: number[]): boolean {
  if (pulledAt === null) return false;
  return loadCounts.some((count, index) => count <= (pulledAt[index] ?? -1));
}
