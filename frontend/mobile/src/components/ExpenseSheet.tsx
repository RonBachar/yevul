import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { SupabaseClient } from '@supabase/supabase-js';
import * as ImagePicker from 'expo-image-picker';
import CameraIcon from 'lucide-react-native/icons/camera';
import CircleCheckBig from 'lucide-react-native/icons/circle-check-big';
import Eye from 'lucide-react-native/icons/eye';
import {
  attachReceipt,
  createExpense,
  expenseDraftFromExpense,
  expenseNameOptions,
  expenseWriteInput,
  formatLocalDateOnly,
  newExpenseDraft,
  t,
  updateExpense,
  useExpenseSuggestions,
  type Expense,
  type ExpenseDraft,
} from '@yevul/shared';
import { colors, fonts, fontSize, radius, spacing } from '../theme/tokens';
import { formStyles } from '../theme/formStyles';
import { BottomSheet } from './BottomSheet';
import { DateField } from './DateField';
import { ReceiptViewer } from './ReceiptViewer';
import { TilePicker } from './TilePicker';

// גיליון יצירה/עריכה של הוצאה. ארבעה שדות בלבד, בלי שום בחירה, לפי
// בקשה מפורשת של היזם: "אני לא רוצה שיהיו לי אפשרויות, זה מסבך".
// גרסה קודמת כללה כאן קטגוריה כרשימה סגורה וחלקה כשורת צ'יפים, לפי
// design.md, ונדחתה. plotId עדיין נכתב (טאב הוצאות בפרטי חלקה עדיין
// זקוק לו), אבל תמיד משתיקה מ-defaultPlotId/expense.plotId, בלי שום
// בורר שהמשתמש נוגע בו.
//
// **The third screen on the tile pattern, and the first one that stayed a
// sheet.** SprayEntrySheet and PlotFormScreen both became a walk of one question
// per screen and both were approved on a device; this one was counted rather
// than copied, because an expense is the highest-frequency action in the product
// and "too many clicks" is a standing complaint in docs/open-items.md. The
// counts, the three cases they cover and the field-by-field reasoning are in
// packages/shared/src/expenseForm.ts. The short version:
//
//   - a walk costs 4, 6 and 5 taps on the three cases; this sheet costs 4, 5
//     and 4, and the case a walk loses worst on -- a receipt from last week --
//     is the one the founder himself called the common one here;
//   - so the four fields stay on one sheet, and the **name** becomes a grid of
//     squares fed by the farm's own expense history;
//   - the **amount** stays a decimal keypad, and that is the deliberate refusal:
//     every profit figure in the product is summed from expenses.amount, so a
//     one-tap plausible-but-wrong number is not a shortcut, it is a wrong season;
//   - the **note** stays typed, because a note is the one-off thing about this
//     expense and there is no vocabulary to build a grid out of;
//   - the **date** is the calendar and is untouched.
//
// **Nothing on this sheet autofocuses any more.** The name box used to, which is
// why the sheet carried a latch to stop the keyboard popping back up on the way
// out of the receipt viewer; the grid is what greets him now, and a keyboard
// over it would hide the squares. The one box that does autofocus is the
// add-a-name box, and it is closed on the way back from the viewer for exactly
// the reason that latch existed.

// The device's calendar day, never the UTC one, for a new expense's default.
// toISOString() is right for most of the day and wrong from local midnight
// until 02:00 or 03:00, when Israel is on a date UTC has not reached yet.
function today(): string {
  return formatLocalDateOnly(new Date());
}

export function ExpenseSheet({
  supabase,
  visible,
  onClose,
  expense,
  defaultPlotId,
  farmId,
  onSaved,
}: {
  supabase: SupabaseClient;
  visible: boolean;
  onClose: () => void;
  expense: Expense | null;
  defaultPlotId: string | null;
  farmId: string | null;
  onSaved: () => void;
}) {
  // The whole form as one value: name, the amount box's text, the inferred
  // plot, the date and the note. See ExpenseDraft.
  const [draft, setDraft] = useState<ExpenseDraft>(() => newExpenseDraft(new Date(), null));
  // Whether the "new name" square has opened its box. The box writes straight
  // into draft.name, so there is no second state to keep in step and no confirm
  // tap between typing a name and saving the expense.
  const [adding, setAdding] = useState(false);
  const [pickedUri, setPickedUri] = useState<string | null>(null);
  const [pickedMime, setPickedMime] = useState<string>('image/jpeg');
  // The viewer takes over the sheet rather than opening a second one. The form
  // state above stays exactly as he left it, because this component never
  // unmounts while he is looking at the document.
  const [viewing, setViewing] = useState(false);
  const [status, setStatus] = useState<
    'idle' | 'saving' | 'amountRequired' | 'forbidden' | 'error'
  >('idle');
  const busy = status === 'saving';

  // The name grid, out of this farm's own expenses. Re-read every time the sheet
  // opens rather than once on mount, because this component lives for the life
  // of the tab bar and a grid missing the name he entered an hour ago is a grid
  // that sends him back to the keyboard. See useExpenseSuggestions.
  const suggestions = useExpenseSuggestions(supabase, farmId, visible);
  // **The held value is dropped out of the grid while the box is open.** With it
  // in, every keystroke in the box would push a tile in or out of the grid
  // above and move the box itself under a thumb that is typing into it.
  const nameOptions = expenseNameOptions(suggestions.names, adding ? null : draft.name);
  const selectedName = adding || draft.name.trim() === '' ? null : draft.name.trim();

  useEffect(() => {
    if (!visible) return;
    // **The date is passed through as the string it already is.** expenses.date
    // is a Postgres date column and arrives as YYYY-MM-DD; an earlier version
    // put it through `new Date()` and read getDate() off it, which is UTC
    // midnight read on a local calendar -- the day-early round trip written out
    // at the bottom of safeHarvestDate.ts, latent here because Israel is ahead
    // of UTC and live for anyone behind it. See expenseDraftFromExpense.
    setDraft(
      expense ? expenseDraftFromExpense(expense) : newExpenseDraft(new Date(), defaultPlotId),
    );
    setAdding(false);
    setPickedUri(null);
    setViewing(false);
    setStatus('idle');
  }, [visible, expense, defaultPlotId]);

  async function onPickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsEditing: false,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    setPickedUri(asset.uri);
    setPickedMime(asset.mimeType ?? 'image/jpeg');
  }

  async function onSave() {
    if (!farmId || !draft.date) return;
    // The one thing that can stop the save, and it is returned by the builder
    // rather than checked beside it, so the write cannot be assembled without
    // an amount. See expenseWriteInput.
    const input = expenseWriteInput(draft);
    if (!input) {
      setStatus('amountRequired');
      return;
    }

    setStatus('saving');
    const result = expense
      ? await updateExpense(supabase, farmId, expense.id, input)
      : await createExpense(supabase, farmId, input);
    if (!result.ok) {
      setStatus(result.reason);
      return;
    }

    if (pickedUri) {
      // **arrayBuffer() and not blob().** React Native's Blob is a handle to
      // bytes held natively, which supabase-js cannot read, so uploading one
      // sends nothing at all and fails silently. See attachReceipt.
      const bytes = await fetch(pickedUri).then((r) => r.arrayBuffer());
      await attachReceipt(supabase, farmId, result.id, bytes, pickedMime);
    }

    onSaved();
  }

  // **The viewer takes the sheet over instead of opening a second one.** Both
  // branches return the same BottomSheet element in the same position, so React
  // swaps its children in place rather than tearing down and re-presenting a
  // native Modal, and the half-filled form above survives the trip because none
  // of its state lives in the inputs.
  if (viewing && expense) {
    return (
      <BottomSheet visible={visible} onClose={onClose} closeLabel={t('capture.close')}>
        <ReceiptViewer
          supabase={supabase}
          expenseId={expense.id}
          onBack={() => {
            setViewing(false);
            // The add box is the only autofocusing field left on this sheet, and
            // coming back from the viewer remounts the form. Closing it here is
            // what stops the reward for looking at your own receipt from being a
            // keyboard over half the sheet.
            setAdding(false);
          }}
        />
      </BottomSheet>
    );
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} closeLabel={t('capture.close')}>
      {/* The one field on this sheet with a vocabulary that repeats: a farm buys
          diesel, fertiliser and pesticide over and over. The grid fills up from
          the farm's own history, which is the case useSpraySuggestions
          established and useCropSuggestions repeated. */}
      <TilePicker
        title={t('expense.form.step.name')}
        options={nameOptions.map((value) => ({ value, label: value }))}
        selectedValue={selectedName}
        onSelect={(value) => {
          setDraft((current) => ({ ...current, name: value }));
          setAdding(false);
        }}
        actions={[{ key: 'add', label: t('expense.form.addName'), onPress: () => setAdding(true) }]}
        // The first expense on a new account lands here with an empty grid. The
        // sentence plus the dashed square is what keeps that from reading as a
        // broken screen.
        emptyHint={t('expense.form.emptyNames')}
        disabled={busy}
        footer={
          adding ? (
            <View style={styles.answer}>
              {/* Bound straight to the draft, with no confirm button under it:
                  there is no next step to advance to on a sheet, so a button
                  whose only job was to close the box would be a tap charged for
                  nothing. */}
              <TextInput
                style={formStyles.input}
                value={draft.name}
                onChangeText={(name) => setDraft((current) => ({ ...current, name }))}
                editable={!busy}
                placeholder={t('expense.form.namePlaceholder')}
                placeholderTextColor={colors.slate600}
                textAlign="right"
                autoFocus
              />
            </View>
          ) : null
        }
      />

      <View style={[formStyles.field, sheetGap]}>
        <Text style={formStyles.label}>{t('expense.form.amount')}</Text>
        {/* **Typed and never a square, deliberately.** Every profit figure the
            product shows is summed from expenses.amount, and amounts do not
            repeat the way names do -- a diesel fill is 380 one week and 412 the
            next. Same refusal the plot form made for a plot's area, and for the
            same reason. */}
        <TextInput
          style={formStyles.input}
          value={draft.amountText}
          onChangeText={(amountText) => setDraft((current) => ({ ...current, amountText }))}
          editable={!busy}
          keyboardType="decimal-pad"
          textAlign="right"
          placeholder={t('common.numberPlaceholder')}
          placeholderTextColor={colors.slate600}
        />
      </View>

      {/* An expense records money already spent, so the calendar stops at
          today. */}
      <View style={sheetGap}>
        <DateField
          label={t('expense.form.date')}
          value={draft.date}
          onChange={(next) => setDraft((current) => ({ ...current, date: next ?? today() }))}
          direction="past"
          // **No today/yesterday shortcuts here, by the founder's decision
          // 2026-09-03.** They are right on a spray, which is logged the same
          // evening or the next morning, and wrong on an expense, which is
          // usually a receipt found later. His words: "they just complicate it,
          // options that dull the experience -- I only want to pick a date from
          // a calendar." When a receipt is photographed the model reads the
          // date off it and he is not asked at all, which is the real shortcut.
          shortcuts={false}
          disabled={busy}
        />
      </View>

      <View style={[formStyles.field, sheetGap]}>
        <Text style={formStyles.label}>
          {t('expense.form.note')} · {t('common.optional')}
        </Text>
        {/* Free text and optional. A note is by definition the one-off thing
            worth saying about this expense, so there is no history to make a
            grid out of -- the same argument that kept a plot's name typed. */}
        <TextInput
          style={formStyles.input}
          value={draft.note}
          onChangeText={(note) => setDraft((current) => ({ ...current, note }))}
          editable={!busy}
          placeholder={t('expense.form.notePlaceholder')}
          placeholderTextColor={colors.slate600}
          textAlign="right"
        />
      </View>

      <Pressable
        style={[receiptButton, sheetGap]}
        onPress={onPickImage}
        disabled={busy}
        accessibilityRole="button"
      >
        {pickedUri || expense?.receiptPath ? (
          <CircleCheckBig size={18} strokeWidth={2} color={colors.field700} />
        ) : (
          <CameraIcon size={18} strokeWidth={2} color={colors.slate600} />
        )}
        <Text
          style={[receiptButtonText, (pickedUri || expense?.receiptPath) && receiptButtonTextDone]}
        >
          {pickedUri
            ? t('expense.form.receiptAttached')
            : expense?.receiptPath
              ? t('expense.form.receiptReplace')
              : t('expense.form.receiptAdd')}
        </Text>
      </Pressable>

      {/* **Driven by expense.receiptPath, which the list query already
          selected**, so the button appears without a single extra request and
          the sheet never has to ask storage anything just to decide whether to
          offer the document. Shown even when a replacement has been picked: what
          it opens is what is actually filed, and the replacement is not filed
          until he saves. */}
      {expense?.receiptPath && (
        <Pressable
          style={[viewReceiptButton, sheetGap]}
          onPress={() => setViewing(true)}
          disabled={busy}
          accessibilityRole="button"
        >
          <Eye size={18} strokeWidth={2} color={colors.field700} />
          <Text style={viewReceiptButtonText}>{t('expense.form.receiptView')}</Text>
        </Pressable>
      )}

      <Pressable
        style={[formStyles.save, sheetGap, busy && formStyles.saveDisabled]}
        onPress={onSave}
        disabled={busy}
        accessibilityRole="button"
      >
        <Text style={formStyles.saveText}>{busy ? t('expense.saving') : t('expense.save')}</Text>
      </Pressable>
      {status === 'amountRequired' && (
        <Text style={[formStyles.bad, sheetGap]}>{t('expense.form.amountRequired')}</Text>
      )}
      {status === 'forbidden' && (
        <Text style={[formStyles.bad, sheetGap]}>{t('expense.form.forbidden')}</Text>
      )}
      {status === 'error' && (
        <Text style={[formStyles.bad, sheetGap]}>{t('expense.form.saveError')}</Text>
      )}
    </BottomSheet>
  );
}

const sheetGap = { marginTop: 16 };
const styles = StyleSheet.create({
  // The box a grid cannot answer, under the grid. Same gap the tiles use, so a
  // typed answer and a picked one sit the same distance apart -- the shape
  // TilePicker's own adoption guide shows for a footer.
  answer: {
    gap: spacing.s12,
    marginTop: spacing.s4,
  },
});
const receiptButton = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  gap: 8,
  paddingVertical: 12,
  paddingHorizontal: 16,
  borderRadius: 10,
  borderWidth: 1,
  borderColor: colors.mist200,
  borderStyle: 'dashed' as const,
  backgroundColor: colors.mist100,
};
const receiptButtonText = {
  // דרך הטוקנים ולא מחרוזת קשיחה. הגרסה הקודמת כתבה כאן את שם
  // המשפחה ישירות, ולכן שרדה את החלפת הפונט כולה בלי להישבר
  // בטייפצ'ק, והכפתור היה נשאר עם פונט שאינו נטען יותר.
  fontFamily: fonts.regular,
  fontSize: fontSize.bodySm,
  color: colors.slate600,
};
const receiptButtonTextDone = { color: colors.field700 };
// Solid border where the attach button's is dashed: attaching is an empty slot
// asking to be filled, viewing is a document that is already there.
const viewReceiptButton = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  gap: 8,
  paddingVertical: 12,
  paddingHorizontal: 16,
  borderRadius: radius.pill,
  borderWidth: 1,
  borderColor: colors.border200,
  backgroundColor: colors.paper,
};
const viewReceiptButtonText = {
  fontFamily: fonts.bold,
  fontSize: fontSize.bodySm,
  color: colors.field700,
};
