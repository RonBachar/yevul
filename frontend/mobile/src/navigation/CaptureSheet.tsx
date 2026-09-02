import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Wallet from 'lucide-react-native/icons/wallet';
import ListChecks from 'lucide-react-native/icons/list-checks';
import NotebookPen from 'lucide-react-native/icons/notebook-pen';
import Mic from 'lucide-react-native/icons/mic';
import type { SupabaseClient } from '@supabase/supabase-js';
import { t, type VoiceKind } from '@yevul/shared';
import { colors, fonts, fontSize, radius, spacing, touchTarget } from '../theme/tokens';
import { BottomSheet } from '../components/BottomSheet';
import { VoiceCapturePanel } from '../components/VoiceCapturePanel';
import { useAuth } from '../auth/AuthProvider';
import { workerUrl } from '../lib/voiceTransport';

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
export function CaptureSheet({
  supabase,
  farmId,
  visible,
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
  onClose: () => void;
  onJournalPress: () => void;
  onExpensePress: () => void;
  onTaskPress: () => void;
}) {
  const { session } = useAuth();
  const [voiceKind, setVoiceKind] = useState<VoiceKind | null>(null);

  // Closing the sheet always comes back to the three rows. Without this a
  // farmer who closed the sheet mid-recording would reopen it into a panel he
  // did not ask for, holding a recorder that had already been torn down.
  useEffect(() => {
    if (!visible) setVoiceKind(null);
  }, [visible]);

  // `as const` on each key so the array carries the VoiceKind literals rather
  // than widening to string. The three rows and the endpoint's three kinds are
  // the same three things, and the compiler should be the one saying so.
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
  ];

  function onOptionPress(key: VoiceKind) {
    if (key === 'journal') return onJournalPress();
    if (key === 'expense') return onExpensePress();
    if (key === 'task') return onTaskPress();
    return onClose();
  }

  // No EXPO_PUBLIC_WORKER_URL in this build means no endpoint to talk to, so
  // the microphones are simply not there. Every manual form still works, which
  // is the whole reason voiceTransport.ts returns null instead of throwing.
  const voiceAvailable = workerUrl !== null;
  const selected = voiceKind === null ? null : options.find((option) => option.key === voiceKind);

  return (
    <BottomSheet visible={visible} onClose={onClose} closeLabel={t('capture.close')}>
      {selected && workerUrl !== null ? (
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
              {voiceAvailable && (
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
            {voiceAvailable ? t('capture.voiceHint') : t('capture.micHint')}
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
