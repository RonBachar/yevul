import { Pressable, StyleSheet, Text, View } from 'react-native';
import { logEntryTypeLabelKey, t, type LogEntry } from '@yevul/shared';
import { colors, fonts, fontSize, radius, spacing } from '../theme/tokens';

// אטום היומן, design.md "Log Row". בניגוד ל-Task Row, בלי שום פעולת
// swipe: רשומת יומן היא תיעוד של משהו שכבר קרה, אין מה להשלים או
// לדחות. לחיצה על השורה פותחת את אותו Log Entry Sheet לעריכה.
export function LogRow({
  entry,
  plotName,
  onPress,
}: {
  entry: LogEntry;
  plotName: string | null;
  onPress: () => void;
}) {
  const tag =
    entry.type === 'spray'
      ? { key: 'spray' as const, label: t(logEntryTypeLabelKey('spray')) }
      : entry.type === 'harvest'
        ? { key: 'harvest' as const, label: t(logEntryTypeLabelKey('harvest')) }
        : null;

  const detail =
    entry.type === 'spray'
      ? [entry.sprayPest, entry.sprayMaterial].filter(Boolean).join(' · ')
      : entry.type === 'harvest'
        ? [entry.harvestQty, entry.harvestUnit].filter(Boolean).join(' ')
        : entry.source === 'voice'
          ? t('log.row.sourceVoice')
          : entry.source === 'task'
            ? t('log.row.sourceTask')
            : (entry.note ?? '');

  const metaParts = [plotName, detail].filter((part): part is string => Boolean(part));

  return (
    <Pressable style={styles.row} onPress={onPress} accessibilityRole="button">
      <Text style={styles.date}>
        {new Date(entry.date).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })}
      </Text>
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>
            {t(logEntryTypeLabelKey(entry.type))}
          </Text>
          {tag && (
            <View style={[styles.tag, tag.key === 'spray' ? styles.tagSpray : styles.tagHarvest]}>
              <Text
                style={[
                  styles.tagText,
                  tag.key === 'spray' ? styles.tagTextSpray : styles.tagTextHarvest,
                ]}
              >
                {tag.label}
              </Text>
            </View>
          )}
        </View>
        {metaParts.length > 0 && (
          <Text style={styles.meta} numberOfLines={1}>
            {metaParts.join(' · ')}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const DATE_WIDTH = 40;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    minHeight: 64,
    gap: spacing.s12,
    paddingVertical: spacing.s12,
    paddingHorizontal: spacing.s16,
    borderRadius: radius.card,
    backgroundColor: colors.mist100,
  },
  date: {
    width: DATE_WIDTH,
    paddingTop: 2,
    fontFamily: fonts.bold,
    fontSize: fontSize.caption,
    color: colors.slate600,
    textAlign: 'center',
  },
  body: {
    flex: 1,
    gap: spacing.s4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s8,
  },
  title: {
    flexShrink: 1,
    fontFamily: fonts.medium,
    fontSize: fontSize.bodyLg,
    color: colors.ink900,
    writingDirection: 'rtl',
  },
  tag: {
    paddingHorizontal: spacing.s8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  tagSpray: {
    backgroundColor: colors.wheat100,
  },
  tagHarvest: {
    backgroundColor: colors.field100,
  },
  tagText: {
    fontFamily: fonts.medium,
    fontSize: fontSize.caption,
  },
  tagTextSpray: {
    color: colors.wheat800,
  },
  tagTextHarvest: {
    color: colors.field700,
  },
  meta: {
    fontFamily: fonts.regular,
    fontSize: fontSize.bodySm,
    color: colors.slate600,
    writingDirection: 'rtl',
  },
});
