import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { SupabaseClient } from '@supabase/supabase-js';
import Plus from 'lucide-react-native/icons/plus';
import {
  completeTask,
  completionPromptVisibility,
  deleteTask,
  groupTasksByUrgency,
  t,
  useFarmSettings,
  useTasks,
  type Task,
} from '@yevul/shared';
import { colors, fonts, fontSize, radius, spacing, touchTarget } from '../theme/tokens';
import { formStyles } from '../theme/formStyles';
import { CompletionPromptSheet } from './CompletionPromptSheet';
import { TaskRow } from './TaskRow';
import { TaskSheet } from './TaskSheet';

// לוח המשימות, design.md "Task Board". רכיב תוכן, לא מסך, כי הוא
// מרונדר גם בבית (כל המשק) וגם בטאב משימות בפרטי חלקה (חלקה אחת),
// אותה שורה ואותה החלקה, שאילתה צרה יותר בלבד. plotId מגדיר את
// ההבדל, ו-showPlotName קובע אם שם החלקה חוזר על עצמו בכל שורה, מיותר
// כשכבר נמצאים בתוך מסך אותה חלקה.
//
// useFarmSettings נקרא כאן ולא מקבל currency כפרופ מההורה יותר: ברגע
// שהלוח זקוק גם למתגי Completion Prompts, אין טעם שההורה ימשיך למשוך
// הגדרות רק כדי להעביר שדה אחד ממנו הלאה. HomeScreen לא צריך יותר
// useFarmSettings משלו בכלל, ו-PlotDetailScreen ממשיך לקרוא לו בעצמו
// כי הוא זקוק לו גם לסיכום הרווח.
export function TaskBoard({
  supabase,
  plotId,
  showPlotName,
}: {
  supabase: SupabaseClient;
  plotId?: string;
  showPlotName: boolean;
}) {
  const settings = useFarmSettings(supabase);
  const currency = settings.form?.currency ?? 'ILS';
  const tasksState = useTasks(supabase, plotId);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [completingTask, setCompletingTask] = useState<Task | null>(null);

  function openCreate() {
    setEditingTask(null);
    setSheetOpen(true);
  }

  function openEdit(task: Task) {
    setEditingTask(task);
    setSheetOpen(true);
  }

  const promptVisibility = completionPromptVisibility(
    settings.form?.journalPromptEnabled ?? false,
    settings.form?.expensePromptEnabled ?? false,
  );

  async function handleComplete(taskId: string) {
    const task = tasksState.tasks.find((candidate) => candidate.id === taskId) ?? null;
    await completeTask(supabase, taskId);
    tasksState.refresh();
    // Completion Prompts מוצג רק אחרי שהכתיבה בפועל הצליחה, במקום
    // ה-undo toast של חמש שניות שכבר חלף עד שהגענו לכאן (TaskRow דוחה
    // את הקריאה הזו בעצמו), design.md: "renders... in place of the
    // usual 5-second undo toast".
    if (task && promptVisibility.showPrompt) setCompletingTask(task);
  }

  async function handleDelete(taskId: string) {
    await deleteTask(supabase, taskId);
    tasksState.refresh();
  }

  const groups = groupTasksByUrgency(tasksState.tasks);

  return (
    <View style={styles.wrap}>
      <Pressable style={styles.newButton} onPress={openCreate} accessibilityRole="button">
        <Plus size={20} strokeWidth={2.5} color={colors.paper} />
        <Text style={styles.newButtonText}>{t('tasks.new')}</Text>
      </Pressable>

      {tasksState.loading && <Text style={styles.note}>{t('common.loading')}</Text>}
      {!tasksState.loading && tasksState.failed && (
        <Text style={formStyles.bad}>{t('tasks.loadError')}</Text>
      )}
      {!tasksState.loading && !tasksState.failed && groups.length === 0 && (
        <Text style={styles.note}>{t('tasks.empty')}</Text>
      )}

      {!tasksState.loading && !tasksState.failed && groups.length > 0 && (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.groups}>
          {groups.map((group) => (
            <View key={group.key} style={styles.group}>
              <Text style={styles.sectionHeader}>{t(group.labelKey)}</Text>
              <View style={styles.rows}>
                {group.tasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    plotName={
                      showPlotName ? (tasksState.plotNames.get(task.plotId ?? '') ?? null) : null
                    }
                    currency={currency}
                    onPress={() => openEdit(task)}
                    onCompleteCommit={() => handleComplete(task.id)}
                    onDeleteCommit={() => handleDelete(task.id)}
                  />
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      <TaskSheet
        supabase={supabase}
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        task={editingTask}
        defaultPlotId={plotId ?? null}
        farmId={tasksState.farmId}
        onSaved={() => {
          setSheetOpen(false);
          tasksState.refresh();
        }}
      />

      <CompletionPromptSheet
        supabase={supabase}
        visible={completingTask != null}
        task={completingTask}
        farmId={tasksState.farmId}
        currency={currency}
        journalEnabled={promptVisibility.showJournal}
        expenseEnabled={promptVisibility.showExpense}
        onClose={() => setCompletingTask(null)}
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
  // flex על ה-ScrollView עצמו, ולא רק contentContainerStyle. בלעדיו
  // הגלילה מקבלת את גובה התוכן שלה במקום את השטח שנשאר, וברגע שנוצרות
  // מספיק משימות הרשימה דוחפת את הפריסה מעבר לגובה המסך במקום לגלול
  // בתוכו. זה היה הבאג של "המסך נהיה גבוה מדי" אחרי יצירת משימה.
  scroll: {
    flex: 1,
  },
  groups: {
    gap: spacing.s24,
    paddingBottom: spacing.s24,
  },
  group: {
    gap: spacing.s8,
  },
  sectionHeader: {
    fontFamily: fonts.bold,
    fontSize: fontSize.caption,
    color: colors.slate600,
    writingDirection: 'rtl',
  },
  rows: {
    gap: spacing.s8,
  },
  note: {
    fontFamily: fonts.regular,
    fontSize: fontSize.bodySm,
    color: colors.slate600,
    writingDirection: 'rtl',
  },
});
