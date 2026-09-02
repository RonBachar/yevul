import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { SupabaseClient } from '@supabase/supabase-js';
import CheckCircle from 'lucide-react-native/icons/circle-check';
import {
  confirmExpenseFromTask,
  confirmJournalFromTask,
  formatLocalDateOnly,
  t,
  taskCostMemory,
  usePlots,
  type Currency,
  type Task,
} from '@yevul/shared';
import { colors, fonts, fontSize, spacing } from '../theme/tokens';
import { formStyles } from '../theme/formStyles';
import { BottomSheet } from './BottomSheet';

const AUTO_DISMISS_MS = 8000;

// The device's calendar day, never the UTC one. toISOString() here is right
// for most of the day and wrong from local midnight until 02:00 or 03:00,
// when Israel is on a date UTC has not reached yet, and a farmer closing out
// the day's tasks at 00:30 would have them booked to the day before.
function today(): string {
  return formatLocalDateOnly(new Date());
}

// Completion Prompts, design.md. שתי הצעות עצמאיות אחרי סימון משימה
// כבוצעה: לשמור ביומן, ולרשום כהוצאה. "Offering, never doing", ולכן
// שתי השאלות מסתדרות בפני עצמן ובלי לחייב תשובה זו בזו.
//
// אין ניחוש סוג יומן מתוך כותרת המשימה, ראה completionPrompts.ts.
// שאלת ההוצאה תמיד נשאלת (בכפוף למתג בהגדרות) ולא מותנית ב"עלות
// משוערת" של המשימה, כי השדה הזה הוסר מ-TaskSheet, ראה docs/roadmap.md.
// הסכום המוצע מגיע מ-TaskCostMemory לפי הכותרת המנורמלת.
export function CompletionPromptSheet({
  supabase,
  visible,
  task,
  farmId,
  currency,
  journalEnabled,
  expenseEnabled,
  onClose,
}: {
  supabase: SupabaseClient;
  visible: boolean;
  task: Pick<Task, 'id' | 'title' | 'plotId'> | null;
  farmId: string | null;
  currency: Currency;
  journalEnabled: boolean;
  expenseEnabled: boolean;
  onClose: () => void;
}) {
  const plotsState = usePlots(supabase);

  const [journalStatus, setJournalStatus] = useState<
    'idle' | 'saving' | 'saved' | 'declined' | 'error'
  >('idle');
  const [expenseAnswered, setExpenseAnswered] = useState(false);
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expensePlotId, setExpensePlotId] = useState<string | null>(null);
  const [expenseDate, setExpenseDate] = useState(today());
  const [expenseStatus, setExpenseStatus] = useState<
    'idle' | 'saving' | 'saved' | 'declined' | 'forbidden' | 'error'
  >('idle');

  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearDismissTimer() {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    dismissTimer.current = null;
  }

  useEffect(() => {
    if (!visible || !task) return;
    setJournalStatus('idle');
    setExpenseAnswered(false);
    setExpenseAmount('');
    setExpensePlotId(task.plotId);
    setExpenseDate(today());
    setExpenseStatus('idle');

    if (expenseEnabled && farmId) {
      void taskCostMemory(supabase, farmId, task.title).then((amount) => {
        if (amount != null) setExpenseAmount(String(amount));
      });
    }

    dismissTimer.current = setTimeout(onClose, AUTO_DISMISS_MS);
    return clearDismissTimer;
    // תלוי רק ב-visible ובזהות המשימה (מזהה, לא האובייקט), לא בשאר
    // הפרופים. TaskBoard מעביר callback חדש (onClose) וייתכן אובייקט
    // task חדש בכל רינדור מחדש של הרשימה, ותלות בהם הייתה מאפסת את
    // הגיליון באמצע אינטראקציה בכל פעם שהלוח מתעדכן מסיבה לא קשורה.
  }, [visible, task?.id]);

  if (!visible || !task) return null;

  async function onJournalAnswer(yes: boolean) {
    clearDismissTimer();
    if (!yes) {
      setJournalStatus('declined');
      return;
    }
    if (!farmId || !task) return;
    setJournalStatus('saving');
    const result = await confirmJournalFromTask(supabase, farmId, task);
    setJournalStatus(result.ok ? 'saved' : 'error');
  }

  function onExpenseYes() {
    clearDismissTimer();
    setExpenseAnswered(true);
  }

  function onExpenseNo() {
    clearDismissTimer();
    setExpenseStatus('declined');
  }

  async function onExpenseConfirm() {
    if (!farmId || !task) return;
    const amount = Number(expenseAmount.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) return;

    setExpenseStatus('saving');
    const result = await confirmExpenseFromTask(supabase, farmId, task, {
      amount,
      name: task.title,
      plotId: expensePlotId,
      date: expenseDate,
      note: null,
    });
    setExpenseStatus(result.ok ? 'saved' : result.reason);
  }

  const journalDone =
    journalStatus === 'saved' || journalStatus === 'declined' || journalStatus === 'error';
  const expenseDone =
    expenseStatus === 'saved' ||
    expenseStatus === 'declined' ||
    expenseStatus === 'forbidden' ||
    expenseStatus === 'error';

  return (
    <BottomSheet visible={visible} onClose={onClose} closeLabel={t('capture.close')}>
      <View style={styles.header}>
        <CheckCircle size={28} strokeWidth={2} color={colors.field700} />
        <Text style={styles.headerText} numberOfLines={2}>
          {t('completion.donePrefix')}: {task.title}
        </Text>
      </View>

      {journalEnabled && (
        <View style={[styles.question, sheetGap]}>
          <Text style={styles.questionText}>{t('completion.saveToJournal')}</Text>
          {journalStatus === 'idle' ? (
            <View style={styles.answerRow}>
              <Pressable style={formStyles.chip} onPress={() => onJournalAnswer(true)}>
                <Text style={formStyles.chipText}>{t('completion.yes')}</Text>
              </Pressable>
              <Pressable style={formStyles.chip} onPress={() => onJournalAnswer(false)}>
                <Text style={formStyles.chipText}>{t('completion.no')}</Text>
              </Pressable>
            </View>
          ) : journalStatus === 'saving' ? (
            <Text style={styles.note}>{t('log.saving')}</Text>
          ) : journalStatus === 'saved' ? (
            <Text style={formStyles.good}>{t('completion.journalSaved')}</Text>
          ) : journalStatus === 'declined' ? (
            <Text style={styles.note}>{t('completion.declined')}</Text>
          ) : (
            <Text style={formStyles.bad}>{t('completion.error')}</Text>
          )}
        </View>
      )}

      {expenseEnabled && (
        <View style={[styles.question, sheetGap]}>
          <Text style={styles.questionText}>{t('completion.recordAsExpense')}</Text>
          {!expenseAnswered && !expenseDone && (
            <View style={styles.answerRow}>
              <Pressable style={formStyles.chip} onPress={onExpenseYes}>
                <Text style={formStyles.chipText}>{t('completion.yes')}</Text>
              </Pressable>
              <Pressable style={formStyles.chip} onPress={onExpenseNo}>
                <Text style={formStyles.chipText}>{t('completion.no')}</Text>
              </Pressable>
            </View>
          )}

          {expenseAnswered && !expenseDone && (
            <View style={sheetGap}>
              <View style={formStyles.field}>
                <Text style={formStyles.label}>
                  {t('completion.expenseAmount')} ({currency})
                </Text>
                <TextInput
                  style={formStyles.input}
                  value={expenseAmount}
                  onChangeText={setExpenseAmount}
                  editable={expenseStatus !== 'saving'}
                  keyboardType="decimal-pad"
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
                        const active = expensePlotId === plot.id;
                        return (
                          <Pressable
                            key={plot.id}
                            style={[formStyles.chip, active && formStyles.chipActive]}
                            onPress={() => setExpensePlotId(plot.id)}
                            disabled={expenseStatus === 'saving'}
                          >
                            <Text
                              style={[formStyles.chipText, active && formStyles.chipTextActive]}
                            >
                              {plot.name}
                            </Text>
                          </Pressable>
                        );
                      })}
                    <Pressable
                      style={[formStyles.chip, expensePlotId === null && formStyles.chipActive]}
                      onPress={() => setExpensePlotId(null)}
                      disabled={expenseStatus === 'saving'}
                    >
                      <Text
                        style={[
                          formStyles.chipText,
                          expensePlotId === null && formStyles.chipTextActive,
                        ]}
                      >
                        {t('tasks.plotGeneral')}
                      </Text>
                    </Pressable>
                  </View>
                </ScrollView>
              </View>

              <Pressable
                style={[
                  formStyles.save,
                  sheetGap,
                  expenseStatus === 'saving' && formStyles.saveDisabled,
                ]}
                onPress={onExpenseConfirm}
                disabled={expenseStatus === 'saving'}
              >
                <Text style={formStyles.saveText}>
                  {expenseStatus === 'saving' ? t('log.saving') : t('completion.expenseConfirm')}
                </Text>
              </Pressable>
            </View>
          )}

          {expenseStatus === 'saved' && (
            <Text style={formStyles.good}>{t('completion.expenseSaved')}</Text>
          )}
          {expenseStatus === 'declined' && (
            <Text style={styles.note}>{t('completion.declined')}</Text>
          )}
          {expenseStatus === 'forbidden' && (
            <Text style={formStyles.bad}>{t('completion.forbidden')}</Text>
          )}
          {expenseStatus === 'error' && <Text style={formStyles.bad}>{t('completion.error')}</Text>}
        </View>
      )}

      {(!journalEnabled || journalDone) && (!expenseEnabled || expenseDone) && (
        <Pressable style={[formStyles.save, sheetGap]} onPress={onClose} accessibilityRole="button">
          <Text style={formStyles.saveText}>{t('capture.close')}</Text>
        </Pressable>
      )}
    </BottomSheet>
  );
}

const sheetGap = { marginTop: 16 };

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s12,
  },
  headerText: {
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: fontSize.bodyLg,
    color: colors.ink900,
    writingDirection: 'rtl',
  },
  question: {
    gap: spacing.s8,
  },
  questionText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.body,
    color: colors.ink900,
    writingDirection: 'rtl',
  },
  answerRow: {
    flexDirection: 'row',
    gap: spacing.s8,
  },
  note: {
    fontFamily: fonts.regular,
    fontSize: fontSize.bodySm,
    color: colors.slate600,
    writingDirection: 'rtl',
  },
});
