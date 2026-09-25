import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createTask, t, updateTask, usePlots, type Task } from '@yevul/shared';
import { colors } from '../theme/tokens';
import { formStyles } from '../theme/formStyles';
import { BottomSheet } from './BottomSheet';
import { DateField } from './DateField';
import { TilePicker } from './TilePicker';

// TilePicker values are strings, so the "general" (no plot) tile carries an
// empty-string sentinel that maps back to null on select. Plot ids are UUIDs
// and never empty, so nothing clashes.
const NONE = '';

// גיליון יצירה/עריכה של משימה, design.md "Task Sheet". שם, חלקה,
// תאריך, בלי עלות: עלות שאלה על "בוצע", לא על יצירה, ראה
// Completion Prompts. בלי כפתורי מצלמה ומיקרופון, אלה תלויים בתשתית
// הקול שנבנית בשלב 5.
//
// **חלקה אחת למשימה, בבקשת היזם.** הסכימה עדיין מחזיקה `task_plots`
// כטבלת קשר, ולכן `plotIds` נשאר מערך בשכבת הכתיבה, אבל הגיליון כותב
// אליו אפס איברים או אחד בדיוק. משימה ישנה שנושאת כמה חלקות תיפתח על
// הראשונה שלה, ושמירה תצמצם אותה לאותה אחת.
//
// **תאריך היעד הוא שדה אחד ולא שלוש קוביות ואז לוח.** הוא אינו חובה,
// וריק הוא מצב תקין ולא בחירה שצריך ללחוץ עליה, ולכן אין יותר מצב
// "מתישהו" נפרד: הלוח פתוח ו"נקה תאריך" מחזיר לריק.
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

  const [title, setTitle] = useState('');
  const [plotId, setPlotId] = useState<string | null>(null);
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
      setPlotId(task.plotIds[0] ?? null);
      // **Passed through as the string it already is.** tasks.due_date is a
      // Postgres date column and arrives as YYYY-MM-DD; an older version parsed
      // it into a Date and read getDate() off it, which is UTC midnight read on
      // a local calendar. See safeHarvestDate.ts.
      setDueDate(task.dueDate);
    } else {
      setTitle('');
      setPlotId(defaultPlotId);
      setDueDate(null);
    }
    setStatus('idle');
  }, [visible, task, defaultPlotId]);

  async function onSave() {
    if (!farmId) return;
    setStatus('saving');
    // **`assignedTo` is deliberately absent, not null.** The form no longer asks
    // who is responsible, and an update writes only the fields it is handed, so
    // leaving the key out keeps whatever the row already carries instead of
    // clearing it on every edit.
    const input = {
      title,
      plotIds: plotId ? [plotId] : [],
      dueDate,
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

      {/* בורר החלקה כרשת קוביות, בחירה יחידה. בנייד הקוביות נשארות
          במקום תפריט נפתח, כי בשדה ביד אחת בחירה בלחיצה אחת עדיפה,
          אותה הפרדה בין הלקוחות שכבר קיימת כאן. "כללי" הוא ה-null,
          ראה NONE. */}
      <View style={sheetGap}>
        <TilePicker
          title={t('plots.form.name')}
          options={[
            { value: NONE, label: t('tasks.plotGeneral') },
            ...plotsState.plots.map((plot) => ({ value: plot.id, label: plot.name })),
          ]}
          selectedValue={plotId ?? NONE}
          onSelect={(value) => setPlotId(value === NONE ? null : value)}
          disabled={busy}
        />
      </View>

      {/* **The one place in the app where the calendar looks forwards.** A
          due date is a target, so `direction="future"` blocks the days behind
          today -- except the one an overdue task is already carrying, which
          calendarBounds keeps selectable so editing such a task cannot
          silently argue with its own record. */}
      <View style={sheetGap}>
        <DateField
          label={t('tasks.form.dueOptional')}
          value={dueDate}
          onChange={setDueDate}
          direction="future"
          shortcuts={false}
          clearLabel={t('tasks.form.dueClear')}
          disabled={busy}
        />
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
