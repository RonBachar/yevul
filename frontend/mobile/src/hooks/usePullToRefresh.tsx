import { useState } from 'react';
import { RefreshControl } from 'react-native';
import { pullSpinnerVisible, type RefreshSource } from '@yevul/shared';
import { colors } from '../theme/tokens';

// Pull down to reload. The gesture every Android user tries first, and until
// now nothing in the app answered it.
//
// Hand it every hook whose data the screen is showing, and it returns the
// RefreshControl to hang on that screen's list or scroll view:
//
//   const refreshControl = usePullToRefresh([tasksState]);
//
// **The spinner is not driven by `loading`.** Every list hook in
// packages/shared sets that flag true once, at mount, and never again, on
// purpose: a refresh must not blank rows that are already on screen. It is
// driven instead by each hook's loadCount, which moves once per completed
// load, success or failure alike — see packages/shared/src/refresh.ts for why
// a failure has to count too, and why watching the rows instead would strand
// the wheel on a farmer with no signal.
//
// A second pull while one is in flight re-records the counts rather than
// stacking a second wait: the superseded load never settles, the one that
// replaced it does, and that is what ends the spinner.
export function usePullToRefresh(sources: RefreshSource[]) {
  // The counts as they stood when the farmer last pulled, or null before any
  // pull. Never cleared: once every source has moved past it the comparison is
  // false on its own, and the next pull overwrites it.
  const [pulledAt, setPulledAt] = useState<number[] | null>(null);
  const loadCounts = sources.map((source) => source.loadCount);

  function onRefresh() {
    setPulledAt(loadCounts);
    for (const source of sources) source.refresh();
  }

  return (
    <RefreshControl
      refreshing={pullSpinnerVisible(pulledAt, loadCounts)}
      onRefresh={onRefresh}
      // Android draws the arrow in `colors` on a `progressBackgroundColor`
      // disc; iOS draws it in `tintColor`. Field-700 on Paper, the same pair
      // the rest of the app uses for a control sitting on the page.
      colors={[colors.field700]}
      progressBackgroundColor={colors.paper}
      tintColor={colors.field700}
    />
  );
}
