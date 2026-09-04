import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Wallet from 'lucide-react-native/icons/wallet';
import ListChecks from 'lucide-react-native/icons/list-checks';
import NotebookPen from 'lucide-react-native/icons/notebook-pen';
import Mic from 'lucide-react-native/icons/mic';
import CameraIcon from 'lucide-react-native/icons/camera';
import type { SupabaseClient } from '@supabase/supabase-js';
import { t, type CaptureKind, type VoiceKind } from '@yevul/shared';
import { colors, fonts, fontSize, radius, spacing, touchTarget } from '../theme/tokens';
import { BottomSheet } from '../components/BottomSheet';
import { VoiceCapturePanel } from '../components/VoiceCapturePanel';
import { ReceiptCapturePanel } from '../components/ReceiptCapturePanel';
import { useAuth } from '../auth/AuthProvider';
import { workerUrl } from '../lib/aiTransport';

// גיליון הרישום, design.md, Capture Tab & Sheet. שלוש שורות, כל אחת
// אייקון, כותרת ושורת משנה, ומתחתן שורת caption שמתעדת את קיצור
// הלחיצה הארוכה. הטפסים עצמם נבנים בשלב 3 והמיקרופון בשלב 5, כאן
// רק נקודת הכניסה.
//
// המחרוזות נקראות בתוך הרכיב ולא ברמת המודול, כדי שהחלפת שפה בשלב 8
// תשפיע מיד ולא תיתקע על ערכים שנקראו פעם אחת בזמן ה-import.
//
// onJournalPress ו-onExpensePress הם השניים המחוברים בפועל, שלב 3:
// יומן והוצאות קיבלו מסכי יצירה עד כה. משימה נשארת סוגרת בלבד עד
// שהמסך שלה נבנה.
//
// ---- Stage 5, step 8: the voice entry point. ----
//
// **A microphone on each row, and not one microphone under all three.**
// POST /ai/voice takes a `kind` and has no "work it out" mode: the model is
// given one schema, not asked to pick between three. design.md's long press on
// the capture button, which skips this sheet and lets the LLM decide the form
// from what was said, therefore cannot be built against this endpoint, and the
// caption promising it has been replaced with one describing what is actually
// here. Picking the row first is not a worse interaction either — the farmer
// already knows whether he is recording money or a job, and the row he picks is
// the same row he would have tapped anyway.
//
// **Choosing a row's microphone replaces the sheet's contents rather than
// opening a second sheet.** One layer, one back link, and the recording panel
// unmounts the moment he leaves it, which is what tears the recorder down.
//
// ---- Stage 5, step 11: the receipt entry point. ----
//
// **A camera on the expense row, beside its microphone, and on that row only.**
// This sheet is where the farmer answers "how am I recording this", and prd.md
// line 15 says there are exactly three answers: "הרישום נעשה בשלוש דרכים,
// הקלדה, דיבור, או צילום קבלה" — typing, speaking, or photographing a receipt.
// Tapping the row is the first, the microphone is the second, and this is the
// third. It belongs to the expense row and to nothing else because a receipt is
// an invoice for money spent; there is no such thing as photographing a task.
//
// **Money's own screen was the other candidate, and it lost on what the action
// is.** Receipts belong to כסף (prd.md section 9), and the Money tab is where
// they are read, filed and exported. But this is not reading a receipt, it is
// recording one, and the capture sheet is one tap from anywhere in the app
// while the Money tab is a destination the farmer visits in the evening — the
// opposite of standing at a counter holding the paper.
//
// **It is not ExpenseSheet's camera button and must never be mistaken for it.**
// That button says "צרף קבלה" and lives at the foot of a form he has already
// filled in: it attaches a document to numbers he typed, and it works on the
// free tier. This one says "צילום קבלה", is reached before anything exists, and
// the photograph is what produces the numbers. Different screen, different verb,
// opposite direction of travel.
export function CaptureSheet({
  supabase,
  farmId,
  visible,
  kinds,
  onClose,
  onJournalPress,
  onExpensePress,
  onTaskPress,
}: {
  // Only the voice path needs these, and only from its confirmation step: a
  // recording that is never confirmed writes nothing. They are threaded through
  // rather than read from a module here because every other sheet in this app
  // is handed the same two by the same parent.
  supabase: SupabaseClient;
  farmId: string | null;
  visible: boolean;
  // Which rows to offer. Worker Mode, design.md: a worker gets only משימה and
  // יומן, the הוצאה row is omitted entirely rather than shown disabled. The
  // decision itself lives in @yevul/shared (workerModeShell); this component
  // only renders the rows it is handed.
  kinds: CaptureKind[];
  onClose: () => void;
  onJournalPress: () => void;
  onExpensePress: () => void;
  onTaskPress: () => void;
}) {
  const { session } = useAuth();
  const [voiceKind, setVoiceKind] = useState<VoiceKind | null>(null);
  const [scanningReceipt, setScanningReceipt] = useState(false);

  // Closing the sheet always comes back to the three rows. Without this a
  // farmer who closed the sheet mid-recording would reopen it into a panel he
  // did not ask for, holding a recorder that had already been torn down. The
  // scan panel is reset for the same reason and one more: it holds the picked
  // photograph, and reopening into it would offer to attach a receipt he
  // abandoned.
  useEffect(() => {
    if (!visible) {
      setVoiceKind(null);
      setScanningReceipt(false);
    }
  }, [visible]);

  // `as const` on each key so the array carries the VoiceKind literals rather
  // than widening to string. The three rows and the endpoint's three kinds are
  // the same three things, and the compiler should be the one saying so.
  //
  // Filtered by `kinds`: a worker never sees the הוצאה row (and with it, its
  // camera and microphone), so the row is not rendered at all rather than shown
  // disabled — the omission is at the render layer over a decision made in
  // @yevul/shared, not a CSS hide.
  const options = [
    {
      key: 'expense' as const,
      Icon: Wallet,
      title: t('capture.expense'),
      hint: t('capture.expenseHint'),
    },
    {
      key: 'task' as const,
      Icon: ListChecks,
      title: t('capture.task'),
      hint: t('capture.taskHint'),
    },
    {
      key: 'journal' as const,
      Icon: NotebookPen,
      title: t('capture.journal'),
      hint: t('capture.journalHint'),
    },
  ].filter((option) => kinds.includes(option.key));

  function onOptionPress(key: VoiceKind) {
    if (key === 'journal') return onJournalPress();
    if (key === 'expense') return onExpensePress();
    if (key === 'task') return onTaskPress();
    return onClose();
  }

  // No EXPO_PUBLIC_WORKER_URL in this build means no endpoint to talk to, so
  // neither the microphones nor the camera are there. Every manual form still
  // works, including attaching a photograph to an expense he types, which never
  // touches the Worker — that is the whole reason aiTransport.ts returns null
  // instead of throwing.
  const aiAvailable = workerUrl !== null;
  const selected = voiceKind === null ? null : options.find((option) => option.key === voiceKind);

  // **The camera is offered whatever the plan, and the panel behind it is what
  // knows about plans.** Hiding it from a free-tier farm would mean he never
  // learns the feature exists, which is the one outcome that helps nobody: the
  // roadmap's own answer to this is an Upgrade Gate, not a missing button.
  function scanPanel() {
    if (workerUrl === null) return null;
    return (
      <ReceiptCapturePanel
        workerUrl={workerUrl}
        accessToken={session?.access_token ?? null}
        supabase={supabase}
        farmId={farmId}
        onBack={() => setScanningReceipt(false)}
      />
    );
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} closeLabel={t('capture.close')}>
      {scanningReceipt && workerUrl !== null ? (
        scanPanel()
      ) : selected && workerUrl !== null ? (
        <VoiceCapturePanel
          kind={selected.key}
          title={selected.title}
          workerUrl={workerUrl}
          accessToken={session?.access_token ?? null}
          supabase={supabase}
          farmId={farmId}
          onBack={() => setVoiceKind(null)}
        />
      ) : (
        <>
          {options.map(({ key, Icon, title, hint }) => (
            <Pressable
              key={key}
              style={styles.row}
              onPress={() => onOptionPress(key)}
              accessibilityRole="button"
              accessibilityLabel={`${title}, ${hint}`}
            >
              <Icon size={24} strokeWidth={2} color={colors.field700} />
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{title}</Text>
                <Text style={styles.rowHint}>{hint}</Text>
              </View>
              {/* The expense row alone carries a second shortcut, and it is
                  Wheat rather than Field so a thumb reaching for the microphone
                  cannot land on the camera by muscle memory. design.md, Tokens
                  Colors: Wheat 500 is the OCR/scan affordance. */}
              {aiAvailable && key === 'expense' && (
                <Pressable
                  style={styles.rowScan}
                  onPress={() => setScanningReceipt(true)}
                  accessibilityRole="button"
                  accessibilityLabel={t('capture.receipt')}
                >
                  <CameraIcon size={22} strokeWidth={2} color={colors.wheat800} />
                </Pressable>
              )}
              {aiAvailable && (
                <Pressable
                  style={styles.rowMic}
                  onPress={() => setVoiceKind(key)}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('capture.voice')}, ${title}`}
                >
                  <Mic size={22} strokeWidth={2} color={colors.field700} />
                </Pressable>
              )}
            </Pressable>
          ))}
          <Text style={styles.micHint}>
            {aiAvailable ? t('capture.voiceScanHint') : t('capture.micHint')}
          </Text>
        </>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: touchTarget.min,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s16,
    paddingVertical: spacing.s12,
  },
  rowText: {
    flex: 1,
    gap: spacing.s4,
  },
  rowTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSize.body,
    color: colors.ink900,
    writingDirection: 'rtl',
  },
  rowHint: {
    fontFamily: fonts.regular,
    fontSize: fontSize.bodySm,
    color: colors.slate600,
    writingDirection: 'rtl',
  },
  // The inline microphone, design.md: an icon button at the touch-target floor
  // rather than the primary green circle, because the row's own title is the
  // primary action here and two loud things in one row is neither. Field-700 on
  // Field-100, never Field-500 on white, which the contrast rules ban.
  rowMic: {
    width: touchTarget.min,
    height: touchTarget.min,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.field100,
  },
  // The same shape as the microphone at the same touch-target floor, in the
  // scan colour rather than the brand one. Wheat-800 on Wheat-100, never
  // Wheat-500 on white, which the contrast rules ban for anything but a fill.
  rowScan: {
    width: touchTarget.min,
    height: touchTarget.min,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.wheat100,
  },
  micHint: {
    fontFamily: fonts.bold,
    fontSize: fontSize.caption,
    color: colors.slate600,
    textAlign: 'center',
    writingDirection: 'rtl',
    paddingTop: spacing.s12,
    paddingBottom: spacing.s16,
  },
});
