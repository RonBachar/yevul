import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { SupabaseClient } from '@supabase/supabase-js';
import Plus from 'lucide-react-native/icons/plus';
import { t, useLogEntries, type LogEntry } from '@yevul/shared';
import { colors, fonts, fontSize, radius, spacing, touchTarget } from '../theme/tokens';
import { formStyles } from '../theme/formStyles';
import { LogRow } from './LogRow';
import { LogEntrySheet } from './LogEntrySheet';

// היומן, design.md "Journal List". רכיב תוכן, לא מסך, אותו עיקרון
// כמו TaskBoard: מרונדר גם ביומן הכללי (כל המשק) וגם בטאב יומן בפרטי
// חלקה (חלקה אחת), plotId מגדיר את ההבדל. רשימה שטוחה מהחדש לישן, בלי
// כותרות קבוצה, design.md: "no section headers beyond the date itself".
export function JournalList({
  supabase,
  plotId,
  showPlotName,
}: {
  supabase: SupabaseClient;
  plotId?: string;
  showPlotName: boolean;
}) {
  const entriesState = useLogEntries(supabase, plotId);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<LogEntry | null>(null);

  function openCreate() {
    setEditingEntry(null);
    setSheetOpen(true);
  }

  function openEdit(entry: LogEntry) {
    setEditingEntry(entry);
    setSheetOpen(true);
  }

  return (
    <View style={styles.wrap}>
      <Pressable style={styles.newButton} onPress={openCreate} accessibilityRole="button">
        <Plus size={20} strokeWidth={2.5} color={colors.paper} />
        <Text style={styles.newButtonText}>{t('log.new')}</Text>
      </Pressable>

      {entriesState.loading && <Text style={styles.note}>{t('common.loading')}</Text>}
      {!entriesState.loading && entriesState.failed && (
        <Text style={formStyles.bad}>{t('log.loadError')}</Text>
      )}
      {!entriesState.loading && !entriesState.failed && entriesState.entries.length === 0 && (
        <Text style={styles.note}>{t('log.empty')}</Text>
      )}

      {!entriesState.loading && !entriesState.failed && entriesState.entries.length > 0 && (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.rows}>
          {entriesState.entries.map((entry) => (
            <LogRow
              key={entry.id}
              entry={entry}
              plotName={
                showPlotName ? (entriesState.plotNames.get(entry.plotId ?? '') ?? null) : null
              }
              onPress={() => openEdit(entry)}
            />
          ))}
        </ScrollView>
      )}

      <LogEntrySheet
        supabase={supabase}
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        entry={editingEntry}
        defaultPlotId={plotId ?? null}
        farmId={entriesState.farmId}
        onSaved={() => {
          setSheetOpen(false);
          entriesState.refresh();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    gap: spacing.s16,
  },
  newButton: {
    alignSelf: 'flex-start',
    minHeight: touchTarget.min,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s8,
    paddingHorizontal: spacing.s20,
    borderRadius: radius.pill,
    backgroundColor: colors.field700,
  },
  newButtonText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.bodySm,
    color: colors.paper,
  },
  scroll: {
    flex: 1,
  },
  rows: {
    gap: spacing.s8,
    paddingBottom: spacing.s24,
  },
  note: {
    fontFamily: fonts.regular,
    fontSize: fontSize.bodySm,
    color: colors.slate600,
    writingDirection: 'rtl',
  },
});
