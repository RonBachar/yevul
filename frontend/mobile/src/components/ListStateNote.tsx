import { StyleSheet, Text } from 'react-native';
import { t } from '@yevul/shared';
import { colors, fonts, fontSize } from '../theme/tokens';
import { formStyles } from '../theme/formStyles';

// The three things a list says when it has no rows: loading, load failed,
// nothing here yet. Every list in the app said them in its own copy of the
// same three branches; once those branches moved inside FlatList's
// ListEmptyComponent there would have been five copies, so they live here.
//
// **Rendering them inside the list rather than beside it is the point.** A
// note drawn as a sibling of the list leaves an empty or failed screen with
// nothing to pull on, and a failed load is exactly the state a farmer needs to
// retry from.
export function ListStateNote({
  loading,
  failed,
  errorKey,
  emptyKey,
  align = 'start',
}: {
  loading: boolean;
  failed: boolean;
  errorKey: string;
  emptyKey: string;
  // 'center' for a screen whose whole body is the list (Plots, Spray Log);
  // 'start' for a list that sits under a button and reads as its continuation.
  align?: 'start' | 'center';
}) {
  const centered = align === 'center' ? styles.centered : null;
  if (loading) return <Text style={[styles.note, centered]}>{t('common.loading')}</Text>;
  if (failed) return <Text style={[formStyles.bad, centered]}>{t(errorKey)}</Text>;
  return <Text style={[styles.note, centered]}>{t(emptyKey)}</Text>;
}

const styles = StyleSheet.create({
  note: {
    fontFamily: fonts.regular,
    fontSize: fontSize.bodySm,
    color: colors.slate600,
    writingDirection: 'rtl',
  },
  centered: {
    textAlign: 'center',
  },
});
