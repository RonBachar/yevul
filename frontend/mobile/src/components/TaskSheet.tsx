import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  assignableMembers,
  createTask,
  formatLocalDateOnly,
  t,
  updateTask,
  useMembers,
  usePlots,
  type Task,
} from '@yevul/shared';
import { colors } from '../theme/tokens';
import { formStyles } from '../theme/formStyles';
import { BottomSheet } from './BottomSheet';
import { DateField } from './DateField';

type DueMode = 'someday' | 'week' | 'date';

const DUE_MODES: readonly DueMode[] = ['someday', 'week', 'date'];
const DUE_MODE_LABEL_KEY: Record<DueMode, string> = {
  someday: 'tasks.form.dueSomeday',
  week: 'tasks.form.dueWeek',
  date: 'tasks.form.dueDate',
};

// **The three modes stay and the calendar sits behind the third.** They are
// this sheet's own shortcuts and they already point the right way: "someday"
// and "this week" are how a farmer talks about a job ahead of him, and the
// today / yesterday / the-day-before squares the expense and journal sheets got
// would all be pointing backwards on a field that means a target. Only "by a
// date" changed, from two number boxes to a month of days.
//
// "This week" is still a week on the user's own calendar. toISOString would
// make it six days whenever the button is pressed between local midnight and
// 02:00 or 03:00.
function computeDueDate(mode: DueMode, customDate: string | null, now: Date): string | null {
  if (mode === 'someday') return null;
  if (mode === 'week') {
    return formatLocalDateOnly(new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000));
  }
  return customDate;
}

// גיליון יצירה/עריכה של משימה, design.md "Task Sheet". כותרת, חלקה,
// תאריך, בלי עלות: עלות שאלה על "בוצע", לא על יצירה, ראה
// Completion Prompts (טרם נבנה). בלי כפתורי מצלמה ומיקרופון, אלה
// תלויים בתשתית הקול שנבנית בשלב 5.
//
// **Still no native date picker, and now not two number boxes either.** The
// line that used to be here said the day/month pair was the price of avoiding a
// new native dependency, the same trade BottomSheet makes over reanimated. The
// dependency is still refused for the same reason (docs/open-items.md: it needs
// verifying in Expo Go, and it could not be shared with the web client anyway)
// -- what changed is that the price is no longer paid by the farmer. The
// calendar under "by a date" is written here, out of the tile pattern he
// already approved. See Calendar.tsx and packages/shared/src/calendar.ts.
export function TaskSheet({
  supabase,
  visible,
  onClose,
  task,
  defaultPlotId,
  farmId,
  onSaved,
}: {
  supabase: SupabaseClient;
  visible: boolean;
  onClose: () => void;
  task: Task | null;
  defaultPlotId: string | null;
  farmId: string | null;
  onSaved: () => void;
}) {
  const plotsState = usePlots(supabase);
  // הרוסטר לבורר האחראי, שלב 6. הבורר מופיע רק כשיש חברים שאפשר
  // להציב, ולכן נעלם לגמרי במשק של אדם אחד (design.md, Sharing).
  const membersState = useMembers(supabase);
  const assignable = assignableMembers(membersState.members);

  const [title, setTitle] = useState('');
  const [plotId, setPlotId] = useState<string | null>(null);
  const [assignedTo, setAssignedTo] = useState<string | null>(null);
  const [dueMode, setDueMode] = useState<DueMode>('someday');
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'titleRequired' | 'forbidden' | 'error'>(
    'idle',
  );
  const busy = status === 'saving';

  // בלי זה השדות היו נשארים מהפתיחה הקודמת, כי הגיליון נשאר mounted
  // מתחת ל-Modal הסגור. אתחול מחדש בכל פתיחה, לפי task אם זו עריכה.
  useEffect(() => {
    if (!visible) return;
    if (task) {
      setTitle(task.title);
      setPlotId(task.plotId);
      setAssignedTo(task.assignedTo);
      if (task.dueDate) {
        setDueMode('date');
        // **Passed through as the string it already is.** tasks.due_date is a
        // Postgres date column and arrives as YYYY-MM-DD; the previous version
        // parsed it into a Date and read getDate() off it, which is UTC
        // midnight read on a local calendar. See safeHarvestDate.ts.
        setDueDate(task.dueDate);
      } else {
        setDueMode('someday');
        setDueDate(null);
      }
    } else {
      setTitle('');
      setPlotId(defaultPlotId);
      setAssignedTo(null);
      setDueMode('someday');
      setDueDate(null);
    }
    setStatus('idle');
  }, [visible, task, defaultPlotId]);

  async function onSave() {
    if (!farmId) return;
    setStatus('saving');
    const input = {
      title,
      plotId,
      dueDate: computeDueDate(dueMode, dueDate, new Date()),
      // עלות משוערת ירדה מהגיליון: היא שאלה ששייכת ל"בוצע", לא ליצירה.
      // ראה ההערה למעלה ליד TaskSheet.
      estimatedCost: null,
      // אם אין חברים שאפשר להציב, הבורר לא מוצג וזה נשאר null.
      assignedTo: assignable.length > 0 ? assignedTo : null,
    };
    const result = task
      ? await updateTask(supabase, task.id, farmId, input)
      : await createTask(supabase, farmId, input);
    if (result.ok) {
      onSaved();
      return;
    }
    setStatus(result.reason === 'titleRequired' ? 'titleRequired' : result.reason);
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} closeLabel={t('capture.close')}>
      <View style={formStyles.field}>
        <TextInput
          style={formStyles.input}
          value={title}
          onChangeText={setTitle}
          editable={!busy}
          placeholder={t('tasks.form.titlePlaceholder')}
          placeholderTextColor={colors.slate600}
          textAlign="right"
          autoFocus
        />
      </View>

      <View style={[formStyles.field, sheetGap]}>
        <Text style={formStyles.label}>{t('plots.form.name')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={formStyles.chips}>
            {!plotsState.loading &&
              plotsState.plots.map((plot) => {
                const active = plotId === plot.id;
                return (
                  <Pressable
                    key={plot.id}
                    style={[formStyles.chip, active && formStyles.chipActive]}
                    onPress={() => setPlotId(plot.id)}
                    disabled={busy}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[formStyles.chipText, active && formStyles.chipTextActive]}>
                      {plot.name}
                    </Text>
                  </Pressable>
                );
              })}
            <Pressable
              style={[formStyles.chip, plotId === null && formStyles.chipActive]}
              onPress={() => setPlotId(null)}
              disabled={busy}
              accessibilityRole="radio"
              accessibilityState={{ selected: plotId === null }}
            >
              <Text style={[formStyles.chipText, plotId === null && formStyles.chipTextActive]}>
                {t('tasks.plotGeneral')}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>

      {/* בורר האחראי, שלב 6. מופיע רק כשיש במשק חברים שאפשר להציב,
          ולכן נעלם לגמרי במשק של אדם אחד, design.md, Sharing. */}
      {assignable.length > 0 && (
        <View style={[formStyles.field, sheetGap]}>
          <Text style={formStyles.label}>{t('tasks.form.assignee')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={formStyles.chips}>
              <Pressable
                style={[formStyles.chip, assignedTo === null && formStyles.chipActive]}
                onPress={() => setAssignedTo(null)}
                disabled={busy}
                accessibilityRole="radio"
                accessibilityState={{ selected: assignedTo === null }}
              >
                <Text
                  style={[formStyles.chipText, assignedTo === null && formStyles.chipTextActive]}
                >
                  {t('tasks.form.assigneeNone')}
                </Text>
              </Pressable>
              {assignable.map((member) => {
                const active = assignedTo === member.userId;
                return (
                  <Pressable
                    key={member.id}
                    style={[formStyles.chip, active && formStyles.chipActive]}
                    onPress={() => setAssignedTo(member.userId)}
                    disabled={busy}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[formStyles.chipText, active && formStyles.chipTextActive]}>
                      {member.email ?? member.userId}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </View>
      )}

      <View style={[formStyles.field, sheetGap]}>
        <Text style={formStyles.label}>{t('tasks.form.due')}</Text>
        <View style={formStyles.chips}>
          {DUE_MODES.map((mode) => {
            const active = dueMode === mode;
            return (
              <Pressable
                key={mode}
                style={[formStyles.chip, active && formStyles.chipActive]}
                onPress={() => setDueMode(mode)}
                disabled={busy}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
              >
                <Text style={[formStyles.chipText, active && formStyles.chipTextActive]}>
                  {t(DUE_MODE_LABEL_KEY[mode])}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {/* **The one place in the app where the calendar looks forwards.** A
            due date is a target, so `direction="future"` blocks the days behind
            today -- except the one an overdue task is already carrying, which
            calendarBounds keeps selectable so editing such a task cannot
            silently argue with its own record. No shortcut chips: the three
            mode chips above are this field's shortcuts, and the calendar is
            always open here because there is nothing to fold it behind. */}
        {dueMode === 'date' && (
          <View style={dueCalendar}>
            <DateField
              label={t('tasks.form.dueDate')}
              value={dueDate}
              onChange={setDueDate}
              direction="future"
              shortcuts={false}
              disabled={busy}
            />
          </View>
        )}
      </View>

      <Pressable
        style={[formStyles.save, sheetGap, busy && formStyles.saveDisabled]}
        onPress={onSave}
        disabled={busy}
        accessibilityRole="button"
      >
        <Text style={formStyles.saveText}>{busy ? t('tasks.saving') : t('tasks.save')}</Text>
      </Pressable>
      {status === 'titleRequired' && (
        <Text style={[formStyles.bad, sheetGap]}>{t('tasks.form.titleRequired')}</Text>
      )}
      {status === 'forbidden' && (
        <Text style={[formStyles.bad, sheetGap]}>{t('tasks.form.forbidden')}</Text>
      )}
      {status === 'error' && (
        <Text style={[formStyles.bad, sheetGap]}>{t('tasks.form.saveError')}</Text>
      )}
    </BottomSheet>
  );
}

const sheetGap = { marginTop: 16 };
const dueCalendar = { marginTop: 8 };
