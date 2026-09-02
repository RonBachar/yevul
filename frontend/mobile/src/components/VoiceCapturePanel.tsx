import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import type { SupabaseClient } from '@supabase/supabase-js';
import Mic from 'lucide-react-native/icons/mic';
import MicOff from 'lucide-react-native/icons/mic-off';
import { formatRecordingElapsed, t, voicePromptKey, type VoiceKind } from '@yevul/shared';
import { colors, fonts, fontSize, shadowFloat, spacing, touchTarget } from '../theme/tokens';
import { formStyles } from '../theme/formStyles';
import { useVoiceRecording } from '../hooks/useVoiceRecording';
import { VoiceConfirmPanel } from './VoiceConfirmPanel';

// The listening screen, design.md, Mic Capture Button.
//
// **It renders a state machine and nothing else.** Every decision it looks like
// it is making — when to stop, what a denied microphone means, whether a tap
// was too short — was made in useVoiceRecording and packages/shared before this
// file saw it. What is left here is which sentence and which shape belong to
// which state, which is the only part that genuinely has to be a component.
//
// **A result now hands straight over to VoiceConfirmPanel.** Step 8 ended here,
// with the transcript on screen and nothing written; step 9 is the checkpoint
// that turns it into a record. The handover is deliberately a component swap
// and not a second sheet: the farmer stays in the same layer he pressed the
// microphone in, and this file keeps knowing only about recording.
//
// **No spinner-only state anywhere in here**, per design.md's Loading State
// spec and for a plain reason: a spinner tells this audience that the phone is
// thinking, and what they need to know is whether the microphone is open. So
// recording carries a climbing m:ss counter, and processing carries the
// "מעבד..." label the spec names, both attached to the same button in the same
// place so nothing moves under the finger.

// **Sized from the tokens, not from design.md's numbers, and that is a
// deliberate departure.** design.md's Touch Targets section says 88px for the
// primary mic and 56px minimum, but those figures come from the pre-v2 token
// block in the same document (the one that still names OedooPro and an 84px
// display size), and packages/shared/src/tokens.ts records the founder's
// 2026-08-31 decision that replaced them with 64 and 48: "56 ו-88 נגזרו מאותה
// הנחת יסוד שבוטלה". The capture FAB in TabBar.tsx is already built on
// touchTarget.primary. Hard-coding 88 here would put this button out of step
// with the button it opens from, and would break the rule that this app holds
// no size values of its own.
const MIC_SIZE = touchTarget.primary;
const MIC_RING_SIZE = MIC_SIZE + spacing.s16;

export function VoiceCapturePanel({
  kind,
  title,
  workerUrl,
  accessToken,
  supabase,
  farmId,
  onBack,
}: {
  kind: VoiceKind;
  // The row's own title, so the farmer can see which of the three he is
  // speaking into without a second vocabulary of screen names.
  title: string;
  workerUrl: string;
  accessToken: string | null;
  // Passed through untouched to the confirmation panel. Recording itself needs
  // neither, and this file goes on knowing nothing about the database.
  supabase: SupabaseClient;
  farmId: string | null;
  onBack: () => void;
}) {
  const { state, pressIn, pressOut, reset } = useVoiceRecording({ kind, workerUrl, accessToken });

  const recording = state.status === 'recording';
  const listening = recording || state.status === 'requesting-permission';
  // The button is dead in every state where pressing it would either do nothing
  // or throw away work already in flight.
  const micDisabled = state.status === 'uploading';

  // The coaching line, design.md: three fields, said before the sentence rather
  // than corrected after it. The spec fades it in when recording starts; it is
  // shown at rest too, because with a press-and-hold button the farmer is
  // already speaking by the time recording has begun, and a prompt he reads
  // after he started talking has missed its job.
  const promptLine = state.status === 'idle' || recording ? t(voicePromptKey(kind)) : null;

  function statusLine(): string {
    if (state.status === 'requesting-permission') return t('voice.permissionAsking');
    if (state.status === 'recording') return t('voice.recording');
    if (state.status === 'uploading') return t('voice.processing');
    return t('voice.hold');
  }

  // A microphone the phone will not prompt for again is not a failure, so it
  // does not get the failure treatment. It gets the one thing that can actually
  // fix it.
  if (state.status === 'permission-blocked') {
    return (
      <View style={styles.root}>
        <View style={styles.blockedIcon}>
          <MicOff size={32} strokeWidth={2} color={colors.loss600} />
        </View>
        <Text style={styles.blockedText}>{t('voice.permissionBlocked')}</Text>
        <Pressable
          style={[formStyles.save, styles.action]}
          onPress={() => void Linking.openSettings()}
          accessibilityRole="button"
        >
          <Text style={formStyles.saveText}>{t('voice.openSettings')}</Text>
        </Pressable>
        <BackLink onPress={onBack} />
      </View>
    );
  }

  if (state.status === 'done') {
    return (
      <View style={styles.root}>
        {/* Kept above the confirmation, not folded into it: it explains why the
            recording ended without him letting go of the button, which is a
            fact about the recording rather than about the record. */}
        {state.stoppedAtLimit && <Text style={styles.note}>{t('voice.stoppedAtLimit')}</Text>}
        <VoiceConfirmPanel
          supabase={supabase}
          farmId={farmId}
          parsed={state.success.parsed}
          transcript={state.success.transcript}
          // Straight back to the microphone with the same kind still selected,
          // which is also the one-at-a-time affordance for "there are more
          // expenses". reset() tears the recorder down first.
          onRecordAgain={reset}
          onBack={onBack}
        />
      </View>
    );
  }

  if (state.status === 'error') {
    // outOfRecordings and signIn are the two failures where offering the
    // microphone again would be a lie: the month's allowance is spent, or the
    // session is gone, and neither is fixed by speaking louder.
    const { nextStep } = state.failure;
    const canRecordAgain = nextStep !== 'outOfRecordings' && nextStep !== 'signIn';
    return (
      <View style={styles.root}>
        <Text style={[formStyles.bad, styles.centered]}>{t(state.failure.messageKey)}</Text>
        {canRecordAgain && (
          <Pressable
            style={[formStyles.save, styles.action]}
            onPress={reset}
            accessibilityRole="button"
          >
            <Text style={formStyles.saveText}>{t('voice.again')}</Text>
          </Pressable>
        )}
        <BackLink onPress={onBack} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Text style={styles.title}>{title}</Text>

      <View style={styles.micWrap}>
        {/* The ring design.md asks for while listening. Static, not the pulsing
            animation the spec describes: the elapsed counter beside it is
            already doing the "this is live" job, and an animation nobody here
            can run on a device is not worth the risk of shipping unseen. */}
        {listening && <View style={styles.ring} />}
        <Pressable
          style={[styles.mic, micDisabled && styles.micDisabled]}
          onPressIn={pressIn}
          onPressOut={pressOut}
          disabled={micDisabled}
          accessibilityRole="button"
          accessibilityLabel={`${t('capture.voice')}, ${title}`}
          accessibilityState={{ disabled: micDisabled, busy: listening }}
        >
          <Mic size={32} strokeWidth={2.5} color={colors.paper} />
        </Pressable>
      </View>

      <Text style={styles.status}>{statusLine()}</Text>
      {state.status === 'recording' && (
        <Text style={styles.elapsed} accessibilityLabel={t('voice.recording')}>
          {formatRecordingElapsed(state.elapsedMillis)}
        </Text>
      )}
      {state.status === 'uploading' && state.stoppedAtLimit && (
        <Text style={styles.note}>{t('voice.stoppedAtLimit')}</Text>
      )}
      {promptLine !== null && <Text style={styles.prompt}>{promptLine}</Text>}

      <BackLink onPress={onBack} />
    </View>
  );
}

// A text link and not a second filled button, per design.md's rule for the
// confirmation sheet: one filled action, one text link, never two filled
// buttons competing for the same glance.
function BackLink({ onPress }: { onPress: () => void }) {
  return (
    <Pressable style={styles.back} onPress={onPress} accessibilityRole="button">
      <Text style={styles.backText}>{t('voice.back')}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    gap: spacing.s16,
    paddingTop: spacing.s8,
    paddingBottom: spacing.s16,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: fontSize.subheading,
    color: colors.ink900,
    writingDirection: 'rtl',
  },
  micWrap: {
    width: MIC_RING_SIZE,
    height: MIC_RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: MIC_RING_SIZE / 2,
    backgroundColor: colors.field300,
    opacity: 0.5,
  },
  mic: {
    width: MIC_SIZE,
    height: MIC_SIZE,
    borderRadius: MIC_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.field500,
    ...shadowFloat,
  },
  micDisabled: {
    opacity: 0.6,
  },
  status: {
    fontFamily: fonts.bold,
    fontSize: fontSize.bodySm,
    color: colors.slate600,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  // Bigger than the label above it on purpose: while he is holding the button
  // this number is the only thing on the screen that is changing, and it is the
  // proof the microphone is open.
  elapsed: {
    fontFamily: fonts.bold,
    fontSize: fontSize.headingSm,
    color: colors.ink900,
  },
  prompt: {
    fontFamily: fonts.regular,
    fontSize: fontSize.caption,
    color: colors.slate600,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  note: {
    fontFamily: fonts.regular,
    fontSize: fontSize.caption,
    color: colors.slate600,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  centered: {
    textAlign: 'center',
  },
  // design.md, Error State, Voice Recognition Failed: the one icon in the
  // system that gets a background tint, because a denied microphone has to be
  // found in under a second.
  blockedIcon: {
    width: touchTarget.min,
    height: touchTarget.min,
    borderRadius: touchTarget.min / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.loss100,
  },
  blockedText: {
    fontFamily: fonts.regular,
    fontSize: fontSize.bodySm,
    color: colors.ink900,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  action: {
    alignSelf: 'stretch',
    paddingHorizontal: spacing.s24,
  },
  back: {
    minHeight: touchTarget.min,
    justifyContent: 'center',
    paddingHorizontal: spacing.s24,
  },
  backText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.bodySm,
    color: colors.field700,
    writingDirection: 'rtl',
  },
});
