import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute } from '@react-navigation/native';
import { useState } from 'react';
import { t, useLogEntries, usePlots, type LogEntry } from '@yevul/shared';
import { supabase } from '../lib/supabase';
import { colors, fonts, fontSize, spacing } from '../theme/tokens';
import { formStyles } from '../theme/formStyles';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { ListStateNote } from '../components/ListStateNote';
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
  // המשיכה מרעננת גם את בורר החלקות, ולא רק את הרשומות: שתי השאילתות
  // מזינות את אותו מסך, וחלקה חדשה שלא הופיעה בצ'יפים היא בדיוק אחת
  // הסיבות למשוך.
  const refreshControl = usePullToRefresh([entriesState, plotsState]);

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
            onPress={() => {
              setEditingEntryId(item.id);
              setSheetOpen(true);
            }}
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
