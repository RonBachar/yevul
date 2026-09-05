import { useMemo, useState } from 'react';
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import type { SupabaseClient } from '@supabase/supabase-js';
import Plus from 'lucide-react-native/icons/plus';
import {
  completeTask,
  completionPromptVisibility,
  deleteTask,
  groupTasksByUrgency,
  membersByUserId,
  t,
  taskAssignee,
  tasksOnPlots,
  useFarmSettings,
  useMembers,
  useMyRole,
  useTasks,
  workerModeShell,
  type RefreshSource,
  type Task,
  type UrgencyGroupKey,
} from '@yevul/shared';
import { colors, fonts, fontSize, radius, spacing, touchTarget } from '../theme/tokens';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { CompletionPromptSheet } from './CompletionPromptSheet';
import { ListStateNote } from './ListStateNote';
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
//
// **SectionList and not ScrollView.** The urgency groups are real sections
// with real headers, so this is the list component that already means what the
// board means; flattening the groups into one array to use a FlatList would
// have thrown that away. Headers are explicitly not sticky, because they were
// not sticky before.
type TaskSection = {
  key: UrgencyGroupKey;
  labelKey: string;
  // Only the first section skips the gap that separates one group from the
  // next; SectionList has no notion of "first", so it is carried here.
  first: boolean;
  data: Task[];
};

export function TaskBoard({
  supabase,
  plotId,
  plotIds,
  showPlotName,
  alsoRefresh = [],
}: {
  supabase: SupabaseClient;
  plotId?: string;
  // The "mine" side of the home "My Plots" toggle (design.md, "My Plots"
  // Toggle): when given, the board narrows to tasks on exactly these plots. A
  // separate addition to the single-plot plotId path; left undefined in the
  // "all" view and in plot detail, which means no filter at all.
  plotIds?: string[];
  showPlotName: boolean;
  // Server data the host screen pins above the board and wants the same pull
  // to reload — the profit card on Home is the one case. The spinner waits for
  // these too, so it does not come down while half the screen is still stale.
  alsoRefresh?: RefreshSource[];
}) {
  const settings = useFarmSettings(supabase);
  const currency = settings.form?.currency ?? 'ILS';
  // Worker Mode, design.md: "The expense half of the Completion Prompts never
  // fires; the journal half still can." worker חסום מכתיבת הוצאה במסד, ולכן
  // שאלת ההוצאה בסיום משימה הייתה נגמרת ב"אין הרשאה". ההחלטה עצמה טהורה
  // ב-workerModeShell.
  const role = useMyRole(supabase);
  const shell = workerModeShell(role.role, role.loading);
  const tasksState = useTasks(supabase, plotId);
  // הרוסטר נטען פעם אחת ללוח ומומר למיפוי, כדי ששורת המשימה תפתור את
  // assigned_to לראשי תיבות בלי שאילתה לכל שורה, design.md, Member Avatar.
  const membersState = useMembers(supabase);
  const byUserId = useMemo(() => membersByUserId(membersState.members), [membersState.members]);
  const refreshControl = usePullToRefresh([tasksState, ...alsoRefresh]);
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
    !shell.showExpenseCompletionPrompt,
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

  // Exactly the condition the groups were rendered under before the
  // conversion: a failed load keeps the tasks it had, and showing them under
  // an error message would claim they are current. groupTasksByUrgency drops
  // empty groups, so an empty array here means an empty board — which is what
  // makes ListEmptyComponent the right place for all three notes.
  const sections: TaskSection[] =
    tasksState.loading || tasksState.failed
      ? []
      : groupTasksByUrgency(tasksOnPlots(tasksState.tasks, plotIds)).map((group, index) => ({
          key: group.key,
          labelKey: group.labelKey,
          first: index === 0,
          data: group.tasks,
        }));

  return (
    <View style={styles.wrap}>
      <Pressable style={styles.newButton} onPress={openCreate} accessibilityRole="button">
        <Plus size={20} strokeWidth={2.5} color={colors.paper} />
        <Text style={styles.newButtonText}>{t('tasks.new')}</Text>
      </Pressable>

      <SectionList<Task, TaskSection>
        sections={sections}
        keyExtractor={(item) => item.id}
        style={styles.scroll}
        contentContainerStyle={styles.groups}
        refreshControl={refreshControl}
        stickySectionHeadersEnabled={false}
        ItemSeparatorComponent={RowGap}
        renderSectionHeader={({ section }) => (
          <Text style={[styles.sectionHeader, !section.first && styles.sectionHeaderGap]}>
            {t(section.labelKey)}
          </Text>
        )}
        renderItem={({ item }) => (
          <TaskRow
            task={item}
            plotName={showPlotName ? (tasksState.plotNames.get(item.plotId ?? '') ?? null) : null}
            currency={currency}
            assignee={taskAssignee(item.assignedTo, membersState.currentUserId, byUserId)}
            onPress={() => openEdit(item)}
            onCompleteCommit={() => handleComplete(item.id)}
            onDeleteCommit={() => handleDelete(item.id)}
          />
        )}
        // Wrapped in a View because the list clones this element to attach
        // style and onLayout, and both need a host component to land on.
        ListEmptyComponent={
          <View>
            <ListStateNote
              loading={tasksState.loading}
              failed={tasksState.failed}
              errorKey="tasks.loadError"
              emptyKey="tasks.empty"
            />
          </View>
        }
      />

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
  // flex על הרשימה עצמה, ולא רק contentContainerStyle. בלעדיו
  // הגלילה מקבלת את גובה התוכן שלה במקום את השטח שנשאר, וברגע שנוצרות
  // מספיק משימות הרשימה דוחפת את הפריסה מעבר לגובה המסך במקום לגלול
  // בתוכו. זה היה הבאג של "המסך נהיה גבוה מדי" אחרי יצירת משימה.
  scroll: {
    flex: 1,
  },
  // flexGrow so the empty state fills the space left over. Without it a list
  // with no rows has no height, and on Android there is nothing to pull.
  groups: {
    flexGrow: 1,
    paddingBottom: spacing.s24,
  },
  sectionHeader: {
    fontFamily: fonts.bold,
    fontSize: fontSize.caption,
    color: colors.slate600,
    writingDirection: 'rtl',
    // The 8 that used to sit between a group's header and its first row.
    paddingBottom: spacing.s8,
  },
  // And the 24 that used to sit between one group and the next.
  sectionHeaderGap: {
    marginTop: spacing.s24,
  },
  rowGap: {
    height: spacing.s8,
  },
});
