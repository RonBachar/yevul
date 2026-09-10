import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Trash2 from 'lucide-react-native/icons/trash-2';
import { logEntryTypeLabelKey, safeHarvestDate, t, type LogEntry } from '@yevul/shared';
import { colors, fonts, fontSize, radius, spacing } from '../theme/tokens';
import { ConfirmDialog } from './ConfirmDialog';

const ACTION_SIZE = 48;

// אטום היומן, design.md "Log Row". לחיצה על השורה פותחת את אותו Log
// Entry Sheet לעריכה.
//
// sprayDetailed מיועד אך ורק למסך יומן הריסוס (design.md, Spray Log
// Screen: "each showing pest, material and PHI days on its detail
// line, and, where applicable, the derived 'בטוח לקטיף' line"). ביומן
// הכללי ובטאב יומן בפרטי חלקה השורה נשארת קומפקטית בלי שני הפרטים
// האלה, אותו רכיב בדיוק עם הרחבה מותנית ולא עותק שני.
//
// **The delete button, added 2026-09-10, sits exactly where ExpenseRow's and
// TaskRow's do**: same Trash2, same Loss-600 pill, same 48, confirmed through
// the same ConfirmDialog before the write. `deleteLogEntry` (packages/shared/
// src/logEntries.ts) already existed and had no caller in either client --
// this is that wiring, not a new deletion rule. Deleting the entry also
// soft-deletes the expense it created (founder's rule, see the header of
// deleteLogEntry), so the confirmation names that consequence -- but only
// when `entry.cost` is not null, since an entry with no cost never wrote an
// expense.
export function LogRow({
  entry,
  plotName,
  onPress,
  onDeleteCommit,
  sprayDetailed = false,
}: {
  entry: LogEntry;
  plotName: string | null;
  onPress: () => void;
  onDeleteCommit: () => void;
  sprayDetailed?: boolean;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const tag =
    entry.type === 'spray'
      ? { key: 'spray' as const, label: t(logEntryTypeLabelKey('spray')) }
      : entry.type === 'harvest'
        ? { key: 'harvest' as const, label: t(logEntryTypeLabelKey('harvest')) }
        : null;

  const detail =
    entry.type === 'spray'
      ? [
          entry.sprayPest,
          entry.sprayMaterial,
          sprayDetailed && entry.sprayPhiDays != null
            ? `${entry.sprayPhiDays} ${t('sprayLog.phiDaysSuffix')}`
            : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : entry.type === 'harvest'
        ? [entry.harvestQty, entry.harvestUnit].filter(Boolean).join(' ')
        : entry.source === 'voice'
          ? t('log.row.sourceVoice')
          : entry.source === 'task'
            ? t('log.row.sourceTask')
            : (entry.note ?? '');

  const metaParts = [plotName, detail].filter((part): part is string => Boolean(part));

  const safeHarvest =
    sprayDetailed && entry.type === 'spray' && entry.sprayPhiDays != null
      ? safeHarvestDate(entry.date, entry.sprayPhiDays)
      : null;

  // Only on the spray log's detailed row, and only when a cost was recorded.
  // One line, one number: `cost` is the entry's whole cost -- material and
  // labour together, off the single expense the entry created -- not a
  // material-only figure any more. See the money header in logEntries.ts. The
  // raw number with no currency symbol: LogRow is not threaded a currency, and
  // an unadorned amount is the acceptable minimum here rather than plumbing one
  // through every caller.
  const cost =
    sprayDetailed && entry.type === 'spray' && entry.cost !== null ? entry.cost : null;

  const dateLabel = new Date(entry.date).toLocaleDateString('he-IL', {
    day: '2-digit',
    month: '2-digit',
  });
  const entryTitle = t(logEntryTypeLabelKey(entry.type));
  // The consequence named, and named conditionally: an entry with no cost
  // never wrote an expense, and claiming it did would be a lie in the
  // confirmation the farmer is trusting before he presses the destructive
  // button. See deleteLogEntry's header (packages/shared/src/logEntries.ts)
  // for the deletion rule itself.
  const confirmMessage =
    entry.cost != null
      ? `${entryTitle} · ${dateLabel} · ${t('log.deleteConfirmExpenseNote')}`
      : `${entryTitle} · ${dateLabel}`;

  function confirmDelete() {
    setConfirmingDelete(false);
    onDeleteCommit();
  }

  return (
    <View style={styles.row}>
      <Pressable style={styles.body} onPress={onPress} accessibilityRole="button">
        <Text style={styles.date}>{dateLabel}</Text>
        <View style={styles.content}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>
              {entryTitle}
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
          {/* שורה אחת ביומן, כמה שצריך ביומן הריסוס. התנאי הוא sprayDetailed
              ולא המסך, כי הוא זה שמוסיף לשורה את ימי ההמתנה כמה שורות מעל,
              ולכן הוא גם התנאי המדויק שבו השורה מתארכת ואסור לה להיחתך.
              בווב נמדד בפועל שהזנב שנחתך הוא בדיוק "7 ימי המתנה", ובנייד
              אותו טקסט נבנה מאותו קוד. נתון בטיחות שנעלם בלי שום רמז, במסך
              שכל קיומו הוא להיות מוצג למפקח, גרוע משורה שנשברת לשתיים. */}
          {metaParts.length > 0 && (
            <Text style={styles.meta} numberOfLines={sprayDetailed ? undefined : 1}>
              {metaParts.join(' · ')}
            </Text>
          )}
          {cost !== null && (
            <Text style={styles.meta} numberOfLines={1}>
              {t('log.form.cost')}: {cost}
            </Text>
          )}
          {safeHarvest && (
            <Text style={styles.safeHarvest} numberOfLines={1}>
              {t('log.form.safeHarvestPrefix')}{' '}
              {new Date(safeHarvest).toLocaleDateString('he-IL', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
              })}
            </Text>
          )}
        </View>
      </Pressable>
      <Pressable
        style={styles.deleteButton}
        onPress={() => setConfirmingDelete(true)}
        accessibilityRole="button"
        accessibilityLabel={t('expense.action.delete')}
      >
        <Trash2 size={20} color={colors.paper} strokeWidth={2.5} />
      </Pressable>
      <ConfirmDialog
        visible={confirmingDelete}
        title={t('log.deleteConfirmTitle')}
        message={confirmMessage}
        confirmLabel={t('expense.action.delete')}
        cancelLabel={t('expense.action.cancel')}
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
    </View>
  );
}

const DATE_WIDTH = 40;

const styles = StyleSheet.create({
  // Container, not the tap target, since 2026-09-10: the delete button sits
  // beside the body Pressable rather than inside it, the same split
  // ExpenseRow uses.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 64,
    gap: spacing.s8,
    paddingVertical: spacing.s12,
    paddingHorizontal: spacing.s16,
    borderRadius: radius.card,
    backgroundColor: colors.mist100,
  },
  // The tap area that opens the edit sheet.
  body: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.s12,
  },
  date: {
    width: DATE_WIDTH,
    paddingTop: 2,
    fontFamily: fonts.bold,
    fontSize: fontSize.caption,
    color: colors.slate600,
    textAlign: 'center',
  },
  content: {
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
    fontFamily: fonts.bold,
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
    fontFamily: fonts.bold,
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
  // Field-700, לא Profit-600, אותה הבחנה כמו ב-LogEntrySheet: תזכורת
  // רגועה לתכנון, לא הכרזת רווח.
  safeHarvest: {
    fontFamily: fonts.bold,
    fontSize: fontSize.caption,
    color: colors.field700,
    writingDirection: 'rtl',
  },
  // 48, identical to ExpenseRow's own deleteButton: same reasoning, a button
  // inside a row that is already mostly a tap area for a different action.
  deleteButton: {
    width: ACTION_SIZE,
    height: ACTION_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.loss600,
  },
});
