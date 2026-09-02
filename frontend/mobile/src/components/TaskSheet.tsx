import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createTask, formatLocalDateOnly, t, updateTask, usePlots, type Task } from '@yevul/shared';
import { colors } from '../theme/tokens';
import { formStyles } from '../theme/formStyles';
import { BottomSheet } from './BottomSheet';

type DueMode = 'someday' | 'week' | 'date';

const DUE_MODES: readonly DueMode[] = ['someday', 'week', 'date'];
const DUE_MODE_LABEL_KEY: Record<DueMode, string> = {
  someday: 'tasks.form.dueSomeday',
  week: 'tasks.form.dueWeek',
  date: 'tasks.form.dueDate',
};

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// גוזר את due_date מהצ'יפ שנבחר. "עד תאריך" מקבל יום/חודש בלבד, בלי
// שנה, השנה מוסקת: אם היום-חודש כבר עברו השנה, קופצת לשנה הבאה. חוסך
// שדה שנה בטופס ומתאים לאיך שחקלאי חושב על "תוך העונה".
function computeDueDate(mode: DueMode, day: string, month: string, now: Date): string | null {
  if (mode === 'someday') return null;
  if (mode === 'week') {
    return formatLocalDateOnly(new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000));
  }
  const dayNum = Number(day);
  const monthNum = Number(month);
  if (!Number.isFinite(dayNum) || !Number.isFinite(monthNum) || dayNum < 1 || monthNum < 1) {
    return null;
  }
  const today = startOfDay(now);
  let candidate = new Date(now.getFullYear(), monthNum - 1, dayNum);
  if (candidate < today) candidate = new Date(now.getFullYear() + 1, monthNum - 1, dayNum);
  // candidate is local midnight, so it must be read off the local calendar.
  // toISOString() here made every picked due date land a day early, which for
  // a task means it shows up overdue a day before it is.
  return formatLocalDateOnly(candidate);
}

// גיליון יצירה/עריכה של משימה, design.md "Task Sheet". כותרת, חלקה,
// תאריך, בלי עלות: עלות שאלה על "בוצע", לא על יצירה, ראה
// Completion Prompts (טרם נבנה). בלי כפתורי מצלמה ומיקרופון, אלה
// תלויים בתשתית הקול שנבנית בשלב 5.
//
// אין בורר תאריך native כאן בכוונה, שני שדות מספריים (יום/חודש) ובלי
// תלות חדשה, אותה גישה כמו הימנעות מ-reanimated ב-BottomSheet.
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
  const [dueMode, setDueMode] = useState<DueMode>('someday');
  const [dueDay, setDueDay] = useState('');
  const [dueMonth, setDueMonth] = useState('');
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
      if (task.dueDate) {
        const due = new Date(task.dueDate);
        setDueMode('date');
        setDueDay(String(due.getDate()));
        setDueMonth(String(due.getMonth() + 1));
      } else {
        setDueMode('someday');
        setDueDay('');
        setDueMonth('');
      }
    } else {
      setTitle('');
      setPlotId(defaultPlotId);
      setDueMode('someday');
      setDueDay('');
      setDueMonth('');
    }
    setStatus('idle');
  }, [visible, task, defaultPlotId]);

  async function onSave() {
    if (!farmId) return;
    setStatus('saving');
    const input = {
      title,
      plotId,
      dueDate: computeDueDate(dueMode, dueDay, dueMonth, new Date()),
      // עלות משוערת ירדה מהגיליון: היא שאלה ששייכת ל"בוצע", לא ליצירה.
      // ראה ההערה למעלה ליד TaskSheet.
      estimatedCost: null,
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
        {dueMode === 'date' && (
          <View style={dateRow}>
            <TextInput
              style={[formStyles.input, dateInput]}
              value={dueDay}
              onChangeText={setDueDay}
              editable={!busy}
              keyboardType="number-pad"
              placeholder={t('tasks.form.dueDay')}
              placeholderTextColor={colors.slate600}
              textAlign="center"
              maxLength={2}
            />
            <TextInput
              style={[formStyles.input, dateInput]}
              value={dueMonth}
              onChangeText={setDueMonth}
              editable={!busy}
              keyboardType="number-pad"
              placeholder={t('tasks.form.dueMonth')}
              placeholderTextColor={colors.slate600}
              textAlign="center"
              maxLength={2}
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
const dateRow = { flexDirection: 'row' as const, gap: 8, marginTop: 8 };
const dateInput = { flex: 1, textAlign: 'center' as const };
