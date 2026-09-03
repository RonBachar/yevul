import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute } from '@react-navigation/native';
import { useState } from 'react';
// Imported by sub-path and not through the barrel, like everywhere else in the
// app: Metro does no tree shaking. See RootTabs.tsx.
import Plus from 'lucide-react-native/icons/plus';
import { t, useLogEntries, usePlots, type LogEntry } from '@yevul/shared';
import { supabase } from '../lib/supabase';
import { colors, fonts, fontSize, radius, spacing, touchTarget } from '../theme/tokens';
import { formStyles } from '../theme/formStyles';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { ListStateNote } from '../components/ListStateNote';
import { LogRow } from '../components/LogRow';
import { SprayEntrySheet } from '../components/SprayEntrySheet';

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
  // המשיכה מרעננת גם את בורר החלקות, ולא רק את הרשומות: שתי השאילתות
  // מזינות את אותו מסך, וחלקה חדשה שלא הופיעה בצ'יפים היא בדיוק אחת
  // הסיבות למשוך.
  const refreshControl = usePullToRefresh([entriesState, plotsState]);

  // **Clearing editingEntryId is what makes this a create.** The id outlives
  // the sheet being closed, so without it a farmer who edited a row and then
  // pressed the button would get that row back for editing, with no sign that
  // he was not writing a new record. Same shape as JournalList's openCreate.
  function openCreate() {
    setEditingEntryId(null);
    setSheetOpen(true);
  }

  function openEdit(entryId: string) {
    setEditingEntryId(entryId);
    setSheetOpen(true);
  }

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

      {/* The one thing this screen was missing: a way to write a spray. A
          farmer testing the app reported he could not enter spray records at
          all, and he was right -- the screen only ever opened the sheet from a
          row, so a plot with no sprays yet offered nothing to press.

          Same button as the Journal's own, and **outside the FlatList, not in
          its ListHeaderComponent**. A header scrolls away with the rows, and
          this is the primary action of the screen; keeping it out also leaves
          ListEmptyComponent and the flexGrow that lets an empty list be pulled
          exactly as they were. Between the plot filter and the list, because
          it opens the sheet carrying whichever plot the filter is on. */}
      <Pressable style={styles.newButton} onPress={openCreate} accessibilityRole="button">
        <Plus size={20} strokeWidth={2.5} color={colors.paper} />
        <Text style={styles.newButtonText}>{t('sprayLog.new')}</Text>
      </Pressable>

      {/* הרשימה מרונדרת תמיד, גם בלי שורות, כדי שגם מצב ריק וגם כשל
          טעינה יישארו נגישים למשיכה. */}
      <FlatList<LogEntry>
        // **loading נשאר בתנאי, וזה לא קישוט.** useLogEntries מחזיר
        // אותו ל-true כשהסינון עצמו משתנה, ובאותו רגע entries עדיין
        // מחזיק את השורות של החלקה הקודמת. בלי התנאי הזה לחיצה על חלקה
        // אחרת בבורר הייתה מציגה לרגע את הריסוסים של החלקה הקודמת תחת
        // השם החדש. failed מסתיר משום שהצגת שורות מתחת להודעת שגיאה
        // מצהירה שהן עדכניות.
        data={entriesState.loading || entriesState.failed ? [] : entriesState.entries}
        keyExtractor={(item) => item.id}
        style={styles.scroll}
        contentContainerStyle={styles.rows}
        refreshControl={refreshControl}
        ItemSeparatorComponent={RowGap}
        renderItem={({ item }) => (
          <LogRow
            entry={item}
            plotName={
              selectedPlotId === null
                ? (entriesState.plotNames.get(item.plotId ?? '') ?? null)
                : null
            }
            sprayDetailed
            onPress={() => openEdit(item.id)}
          />
        )}
        // Wrapped in a View because FlatList clones this element to attach
        // style and onLayout, and both need a host component to land on.
        ListEmptyComponent={
          <View>
            <ListStateNote
              loading={entriesState.loading}
              failed={entriesState.failed}
              errorKey="sprayLog.loadError"
              emptyKey="sprayLog.empty"
              align="center"
            />
          </View>
        }
      />

      {/* The tile flow, not LogEntrySheet. This screen writes one type and one
          type only, so it can ask the six spray questions as six grids of
          squares instead of a form with a ten-option type strip at the top of
          it. LogEntrySheet is untouched and still owns the Journal tab and the
          other nine entry types -- see the header of SprayEntrySheet.

          defaultPlotId is doing more than it did: when the filter above is on a
          plot, the plot step is already answered and the walk skips it. */}
      <SprayEntrySheet
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

// A separator and not `gap` on the content container. Virtualization swaps
// off-screen rows for spacer views, and a gap would be added around those too.
function RowGap() {
  return <View style={styles.rowGap} />;
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
  // The same pill JournalList already renders, token for token, so the two
  // create buttons read as one control. The margins are the difference, and
  // only because the parents differ: JournalList sits inside a padded screen,
  // this screen pads each block itself (header, filters and rows all carry
  // 24). alignSelf resolves to the right edge under RTL, as it does there.
  newButton: {
    alignSelf: 'flex-start',
    minHeight: touchTarget.min,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s8,
    paddingHorizontal: spacing.s20,
    marginHorizontal: spacing.s24,
    marginBottom: spacing.s16,
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
  // הריפוד האופקי עבר לכאן מ-scroll, כדי שגם השורות וגם משפט המצב
  // הריק יקבלו אותו 24 בדיוק. flexGrow כדי שרשימה בלי שורות עדיין
  // תמלא את השטח, אחרת אין באנדרואיד מה למשוך.
  rows: {
    flexGrow: 1,
    paddingHorizontal: spacing.s24,
    paddingBottom: spacing.s24,
  },
  rowGap: {
    height: spacing.s8,
  },
});
