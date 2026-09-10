import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { SupabaseClient } from '@supabase/supabase-js';
import Plus from 'lucide-react-native/icons/plus';
import { deleteLogEntry, t, useLogEntries, type LogEntry } from '@yevul/shared';
import { colors, fonts, fontSize, radius, spacing, touchTarget } from '../theme/tokens';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { ListStateNote } from './ListStateNote';
import { LogRow } from './LogRow';
import { LogEntrySheet } from './LogEntrySheet';

// היומן, design.md "Journal List". רכיב תוכן, לא מסך, אותו עיקרון
// כמו TaskBoard: מרונדר גם ביומן הכללי (כל המשק) וגם בטאב יומן בפרטי
// חלקה (חלקה אחת), plotId מגדיר את ההבדל. רשימה שטוחה מהחדש לישן, בלי
// כותרות קבוצה, design.md: "no section headers beyond the date itself".
//
// **FlatList and not ScrollView.** This is the list that grows without limit
// in a real season: every spray, every irrigation, every note. A ScrollView
// mounted all of them at once.
// onDeleted, added 2026-09-10 alongside the delete button on LogRow: fires
// after a successful delete, in addition to this list's own refresh, so a
// host screen holding separate money state can catch up too. PlotDetailScreen
// is the one caller that needs it -- see the header of the web JournalList,
// which carries the same prop for the same reason.
export function JournalList({
  supabase,
  plotId,
  showPlotName,
  onDeleted,
}: {
  supabase: SupabaseClient;
  plotId?: string;
  showPlotName: boolean;
  onDeleted?: () => void;
}) {
  const entriesState = useLogEntries(supabase, plotId);
  const refreshControl = usePullToRefresh([entriesState]);
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

  async function handleDelete(entryId: string) {
    await deleteLogEntry(supabase, entryId);
    entriesState.refresh();
    onDeleted?.();
  }

  return (
    <View style={styles.wrap}>
      <Pressable style={styles.newButton} onPress={openCreate} accessibilityRole="button">
        <Plus size={20} strokeWidth={2.5} color={colors.paper} />
        <Text style={styles.newButtonText}>{t('log.new')}</Text>
      </Pressable>

      <FlatList<LogEntry>
        // Exactly the condition the rows were rendered under before the
        // conversion. A failed load keeps the rows it had, and showing them
        // under an error message would claim they are current; and
        // useLogEntries returns `loading` to true when the filter itself
        // changes, while `entries` still holds the previous filter's rows.
        data={entriesState.loading || entriesState.failed ? [] : entriesState.entries}
        keyExtractor={(item) => item.id}
        style={styles.scroll}
        contentContainerStyle={styles.rows}
        refreshControl={refreshControl}
        ItemSeparatorComponent={RowGap}
        renderItem={({ item }) => (
          <LogRow
            entry={item}
            plotName={showPlotName ? (entriesState.plotNames.get(item.plotId ?? '') ?? null) : null}
            onPress={() => openEdit(item)}
            onDeleteCommit={() => handleDelete(item.id)}
          />
        )}
        // Wrapped in a View because FlatList clones this element to attach
        // style and onLayout, and both need a host component to land on.
        ListEmptyComponent={
          <View>
            <ListStateNote
              loading={entriesState.loading}
              failed={entriesState.failed}
              errorKey="log.loadError"
              emptyKey="log.empty"
            />
          </View>
        }
      />

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

// A separator and not `gap` on the content container. Virtualization swaps
// off-screen rows for spacer views, and a gap would be added around those too.
function RowGap() {
  return <View style={styles.rowGap} />;
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
  // flexGrow so the empty state fills the space left over. Without it a list
  // with no rows has no height, and on Android there is nothing to pull.
  rows: {
    flexGrow: 1,
    paddingBottom: spacing.s24,
  },
  rowGap: {
    height: spacing.s8,
  },
});
