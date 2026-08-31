import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute } from '@react-navigation/native';
import { useState } from 'react';
import { t, useLogEntries, usePlots } from '@yevul/shared';
import { supabase } from '../lib/supabase';
import { colors, fonts, fontSize, spacing } from '../theme/tokens';
import { formStyles } from '../theme/formStyles';
import { LogRow } from '../components/LogRow';
import { LogEntrySheet } from '../components/LogEntrySheet';

// מסך יומן ריסוס נפרד, design.md "Spray Log Screen". מוצג רק ריסוסים,
// מסונן לפי חלקה, prd.md סעיף 8: "מה שהחקלאי חייב להציג לרגולטור...
// הוא הדבר הכי חשוב שיש לו באפליקציה, והוא צריך למצוא אותו בלי לחפש".
// כפתור "ייצוא לרגולטור" לא נבנה כאן במכוון, ראה docs/roadmap.md.
//
// נרשם כמסך תחת שני סטאקים שונים, MoreStack ו-PlotsStack, כדי לתמוך
// בשלוש נקודות הכניסה בלי ניווט חוצה-סטאק: מ"עוד" ומהיומן הכללי
// (שניהם תחת MoreStack), ומטאב הרווחיות בפרטי חלקה (PlotsStack). כל
// כניסה חוזרת בחזרה למקור שלה עם כפתור החזרה, לא למסך קבוע אחד.
export function SprayLogScreen() {
  const route = useRoute();
  const routePlotId = (route.params as { plotId?: string } | undefined)?.plotId ?? null;

  const plotsState = usePlots(supabase);
  const [selectedPlotId, setSelectedPlotId] = useState<string | null>(routePlotId);
  const entriesState = useLogEntries(supabase, selectedPlotId ?? undefined, 'spray');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const editingEntry = entriesState.entries.find((entry) => entry.id === editingEntryId) ?? null;

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('sprayLog.title')}</Text>
        <Text style={styles.count}>
          {entriesState.entries.length} {t('sprayLog.countSuffix')}
        </Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
        <View style={formStyles.chips}>
          <Pressable
            style={[formStyles.chip, selectedPlotId === null && formStyles.chipActive]}
            onPress={() => setSelectedPlotId(null)}
            accessibilityRole="radio"
            accessibilityState={{ selected: selectedPlotId === null }}
          >
            <Text
              style={[formStyles.chipText, selectedPlotId === null && formStyles.chipTextActive]}
            >
              {t('sprayLog.allPlots')}
            </Text>
          </Pressable>
          {!plotsState.loading &&
            plotsState.plots.map((plot) => {
              const active = selectedPlotId === plot.id;
              return (
                <Pressable
                  key={plot.id}
                  style={[formStyles.chip, active && formStyles.chipActive]}
                  onPress={() => setSelectedPlotId(plot.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[formStyles.chipText, active && formStyles.chipTextActive]}>
                    {plot.name}
                  </Text>
                </Pressable>
              );
            })}
        </View>
      </ScrollView>

      {entriesState.loading && <Text style={styles.note}>{t('common.loading')}</Text>}
      {!entriesState.loading && entriesState.failed && (
        <Text style={formStyles.bad}>{t('sprayLog.loadError')}</Text>
      )}
      {!entriesState.loading && !entriesState.failed && entriesState.entries.length === 0 && (
        <Text style={styles.note}>{t('sprayLog.empty')}</Text>
      )}

      {!entriesState.loading && !entriesState.failed && entriesState.entries.length > 0 && (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.rows}>
          {entriesState.entries.map((entry) => (
            <LogRow
              key={entry.id}
              entry={entry}
              plotName={
                selectedPlotId === null
                  ? (entriesState.plotNames.get(entry.plotId ?? '') ?? null)
                  : null
              }
              sprayDetailed
              onPress={() => {
                setEditingEntryId(entry.id);
                setSheetOpen(true);
              }}
            />
          ))}
        </ScrollView>
      )}

      <LogEntrySheet
        supabase={supabase}
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        entry={editingEntry}
        defaultPlotId={selectedPlotId}
        farmId={entriesState.farmId}
        onSaved={() => {
          setSheetOpen(false);
          entriesState.refresh();
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s24,
    paddingBottom: spacing.s16,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: fontSize.heading,
    color: colors.ink900,
    writingDirection: 'rtl',
  },
  count: {
    fontFamily: fonts.regular,
    fontSize: fontSize.bodySm,
    color: colors.slate600,
    writingDirection: 'rtl',
  },
  filterScroll: {
    flexGrow: 0,
    paddingHorizontal: spacing.s24,
    marginBottom: spacing.s16,
  },
  scroll: {
    flex: 1,
    paddingHorizontal: spacing.s24,
  },
  rows: {
    gap: spacing.s8,
    paddingBottom: spacing.s24,
  },
  note: {
    fontFamily: fonts.regular,
    fontSize: fontSize.bodySm,
    color: colors.slate600,
    textAlign: 'center',
    writingDirection: 'rtl',
    paddingHorizontal: spacing.s24,
  },
});
