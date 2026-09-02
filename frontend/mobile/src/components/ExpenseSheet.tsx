import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import type { SupabaseClient } from '@supabase/supabase-js';
import * as ImagePicker from 'expo-image-picker';
import CameraIcon from 'lucide-react-native/icons/camera';
import CircleCheckBig from 'lucide-react-native/icons/circle-check-big';
import Eye from 'lucide-react-native/icons/eye';
import {
  attachReceipt,
  createExpense,
  formatLocalDateOnly,
  t,
  updateExpense,
  type Expense,
} from '@yevul/shared';
import { colors, fonts, fontSize, radius } from '../theme/tokens';
import { formStyles } from '../theme/formStyles';
import { BottomSheet } from './BottomSheet';
import { ReceiptViewer } from './ReceiptViewer';

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// אותה נוסחה בדיוק כמו computeLogDate ב-LogEntrySheet: הוצאה מתעדת
// משהו שכבר קרה, ולכן תאריך עתידי גולש אחורה לשנה שעברה, לא קדימה.
function computeExpenseDate(day: string, month: string, now: Date): string | null {
  const dayNum = Number(day);
  const monthNum = Number(month);
  if (!Number.isFinite(dayNum) || !Number.isFinite(monthNum) || dayNum < 1 || monthNum < 1) {
    return null;
  }
  const today = startOfDay(now);
  let candidate = new Date(now.getFullYear(), monthNum - 1, dayNum);
  if (candidate > today) candidate = new Date(now.getFullYear() - 1, monthNum - 1, dayNum);
  // candidate is local midnight, so it must be read off the local calendar.
  // toISOString() here shifted every date the farmer typed a day earlier.
  return formatLocalDateOnly(candidate);
}

// גיליון יצירה/עריכה של הוצאה. ארבעה שדות בלבד, בלי שום בחירה, לפי
// בקשה מפורשת של היזם: "אני לא רוצה שיהיו לי אפשרויות, זה מסבך".
// גרסה קודמת כללה כאן קטגוריה כרשימה סגורה וחלקה כשורת צ'יפים, לפי
// design.md, ונדחתה. plotId עדיין נכתב (טאב הוצאות בפרטי חלקה עדיין
// זקוק לו), אבל תמיד משתיקה מ-defaultPlotId/expense.plotId, בלי שום
// בורר שהמשתמש נוגע בו.
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
  const [amount, setAmount] = useState('');
  const [name, setName] = useState('');
  const [plotId, setPlotId] = useState<string | null>(null);
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [note, setNote] = useState('');
  const [pickedUri, setPickedUri] = useState<string | null>(null);
  const [pickedMime, setPickedMime] = useState<string>('image/jpeg');
  // The viewer takes over the sheet rather than opening a second one. The form
  // state above stays exactly as he left it, because this component never
  // unmounts while he is looking at the document.
  const [viewing, setViewing] = useState(false);
  // **Only here to stop the keyboard jumping back up.** The name field is
  // autoFocus, and coming back from the viewer remounts the form, so without
  // this the reward for looking at your own receipt is a keyboard over half the
  // sheet. Nobody who never opens the viewer is affected.
  const [viewedReceipt, setViewedReceipt] = useState(false);
  const [status, setStatus] = useState<
    'idle' | 'saving' | 'amountRequired' | 'forbidden' | 'error'
  >('idle');
  const busy = status === 'saving';

  useEffect(() => {
    if (!visible) return;
    const now = new Date();
    if (expense) {
      const date = new Date(expense.date);
      setAmount(String(expense.amount));
      setName(expense.name ?? '');
      setPlotId(expense.plotId);
      setDay(String(date.getDate()));
      setMonth(String(date.getMonth() + 1));
      setNote(expense.note ?? '');
    } else {
      setAmount('');
      setName('');
      setPlotId(defaultPlotId);
      setDay(String(now.getDate()));
      setMonth(String(now.getMonth() + 1));
      setNote('');
    }
    setPickedUri(null);
    setViewing(false);
    setViewedReceipt(false);
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
    if (!farmId) return;
    const date = computeExpenseDate(day, month, new Date());
    if (!date) return;
    const amountNumber = Number(amount.replace(',', '.'));
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      setStatus('amountRequired');
      return;
    }

    setStatus('saving');
    const input = {
      amount: amountNumber,
      name: name.trim() ? name.trim() : null,
      plotId,
      date,
      note: note.trim() ? note.trim() : null,
    };
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
          onBack={() => setViewing(false)}
        />
      </BottomSheet>
    );
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} closeLabel={t('capture.close')}>
      <View style={formStyles.field}>
        <Text style={formStyles.label}>{t('expense.form.name')}</Text>
        <TextInput
          style={formStyles.input}
          value={name}
          onChangeText={setName}
          editable={!busy}
          placeholder={t('expense.form.namePlaceholder')}
          placeholderTextColor={colors.slate600}
          textAlign="right"
          autoFocus={!viewedReceipt}
        />
      </View>

      <View style={[formStyles.field, sheetGap]}>
        <Text style={formStyles.label}>{t('expense.form.amount')}</Text>
        <TextInput
          style={formStyles.input}
          value={amount}
          onChangeText={setAmount}
          editable={!busy}
          keyboardType="decimal-pad"
          textAlign="right"
          placeholder={t('common.numberPlaceholder')}
          placeholderTextColor={colors.slate600}
        />
      </View>

      <View style={[formStyles.field, sheetGap]}>
        <Text style={formStyles.label}>{t('expense.form.date')}</Text>
        <View style={dateRow}>
          <TextInput
            style={[formStyles.input, dateInput]}
            value={day}
            onChangeText={setDay}
            editable={!busy}
            keyboardType="number-pad"
            placeholder={t('expense.form.dateDay')}
            placeholderTextColor={colors.slate600}
            textAlign="center"
            maxLength={2}
          />
          <TextInput
            style={[formStyles.input, dateInput]}
            value={month}
            onChangeText={setMonth}
            editable={!busy}
            keyboardType="number-pad"
            placeholder={t('expense.form.dateMonth')}
            placeholderTextColor={colors.slate600}
            textAlign="center"
            maxLength={2}
          />
        </View>
      </View>

      <View style={[formStyles.field, sheetGap]}>
        <Text style={formStyles.label}>
          {t('expense.form.note')} · {t('common.optional')}
        </Text>
        <TextInput
          style={formStyles.input}
          value={note}
          onChangeText={setNote}
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
          onPress={() => {
            setViewedReceipt(true);
            setViewing(true);
          }}
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
const dateRow = { flexDirection: 'row' as const, gap: 8 };
const dateInput = { flex: 1, textAlign: 'center' as const };
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
