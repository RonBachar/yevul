import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import type { SupabaseClient } from '@supabase/supabase-js';
import CameraIcon from 'lucide-react-native/icons/camera';
import CameraOff from 'lucide-react-native/icons/camera-off';
import Lock from 'lucide-react-native/icons/lock';
import { attachReceipt, t, useFarmEntitlement, RECEIPT_MESSAGE_KEYS } from '@yevul/shared';
import { colors, fonts, fontSize, shadowFloat, spacing, touchTarget } from '../theme/tokens';
import { formStyles } from '../theme/formStyles';
import { useReceiptScan } from '../hooks/useReceiptScan';
import { VoiceConfirmPanel } from './VoiceConfirmPanel';

// Photographing a receipt, stage 5 step 11. design.md calls the screen it ends
// on the "Voice / OCR Confirmation Sheet", and prd.md line 15 names this as one
// of the three ways a farmer records anything: "הרישום נעשה בשלוש דרכים, הקלדה,
// דיבור, או צילום קבלה".
//
// **VoiceCapturePanel's sibling, and it renders a state machine and nothing
// else.** Which statuses mean what is receiptClient.ts, what a denied camera
// means is voiceRecording.ts, and the picker itself is useReceiptScan. What is
// left here is which sentence and which shape belong to which state.
//
// **A result hands straight over to the existing VoiceConfirmPanel.** Not a
// second confirmation sheet: reusing the expense schema in step 10 was the whole
// argument, and a receipt produces the same record in the same columns. What is
// passed extra is `origin="ocr"` — which makes the expense's source column say
// where it came from — and `onAttach`, which is this route's own step.
//
// **This panel must not be confused with ExpenseSheet's camera button, and they
// are kept apart on purpose.** That one says "צרף קבלה" and sits at the bottom
// of a form the farmer has already filled in: it attaches a photograph to
// numbers he typed. This one is reached from the capture sheet before anything
// exists, says "צילום קבלה", and the photograph is what produces the numbers.
// Different screen, different verb, opposite direction — and prd.md keeps them
// apart too, section 9 for attaching a document to an expense and line 121 for
// photographing an invoice and reading it.

export function ReceiptCapturePanel({
  workerUrl,
  accessToken,
  supabase,
  farmId,
  onBack,
}: {
  workerUrl: string;
  accessToken: string | null;
  // Needed twice on this route, unlike the voice one: the confirmation panel
  // writes the expense, and this panel attaches the document to it afterwards.
  supabase: SupabaseClient;
  farmId: string | null;
  onBack: () => void;
}) {
  const { state, takePhoto, pickFromGallery, reset } = useReceiptScan({ workerUrl, accessToken });
  const entitlement = useFarmEntitlement(supabase, farmId);

  const busy = state.status === 'choosing' || state.status === 'uploading';

  // **Attaches the document to the expense the confirmation panel just wrote.**
  // prd.md section 9: "רואה החשבון צריך את המסמך עצמו, לא רק את המספר" — the
  // accountant needs the document itself and not only the number. Returning
  // false rather than throwing is what lets the panel say "saved, but the photo
  // is not attached" instead of pretending either that everything worked or that
  // nothing did.
  //
  // 'ocr' as the receipt row's own source, which is not the expense's: this
  // document arrived by being scanned, and the same file attached to a typed
  // expense would be 'manual'.
  //
  // **The file here is already compressed and nothing re-compresses it.**
  // useReceiptScan resized it once, at the picker, before it was ever uploaded —
  // so what the accountant is filed is byte for byte what the model was shown,
  // and the resize is paid for once rather than once per upload. See
  // frontend/mobile/src/lib/receiptImage.ts. The mimeType carried on the state is
  // the compressed one for the same reason.
  async function attach(expenseId: string): Promise<boolean> {
    if (state.status !== 'done' || farmId === null) return false;
    const { uri, mimeType } = state.image;
    try {
      // **arrayBuffer() and not blob().** React Native's Blob is a handle to
      // bytes held on the native side, and supabase-js cannot read it: the
      // upload sends nothing, returns no error, and the bucket stays empty.
      // See the comment on attachReceipt.
      const bytes = await fetch(uri).then((response) => response.arrayBuffer());
      const result = await attachReceipt(supabase, farmId, expenseId, bytes, mimeType, 'ocr');
      return result.ok;
    } catch {
      // The file went away, or storage refused it. Either way the expense is
      // already written and the caller has a screen for exactly this.
      return false;
    }
  }

  // **The courtesy check, and it is only a courtesy.** gate() refuses an
  // unentitled scan with 403 whatever this says, and the 403 lands on the same
  // sentence — so a farm this read gets wrong is told the same thing, only later
  // and after the trouble of framing an invoice. `null` is "we do not know", and
  // unknown lets him through: a subscriptions query that failed must not take a
  // paid feature away from someone who paid for it.
  //
  // The offer carries no upgrade button, deliberately. The plans screen is stage
  // 7 (docs/roadmap.md, Upgrade Gate Sheet), and a button that leads nowhere is
  // worse than a sentence that is true.
  if (entitlement.entitled === false && state.status !== 'done') {
    return (
      <View style={styles.root}>
        <View style={styles.paidIcon}>
          <Lock size={32} strokeWidth={2} color={colors.wheat800} />
        </View>
        <Text style={styles.blockedText}>{t(RECEIPT_MESSAGE_KEYS.upgradePlan)}</Text>
        <BackLink onPress={onBack} />
      </View>
    );
  }

  // A camera the phone will not prompt for again is not a failure, so it does
  // not get the failure treatment. It gets the two things that can actually
  // help: the settings, and the gallery, which needs no permission at all.
  if (state.status === 'camera-blocked') {
    return (
      <View style={styles.root}>
        <View style={styles.blockedIcon}>
          <CameraOff size={32} strokeWidth={2} color={colors.loss600} />
        </View>
        <Text style={styles.blockedText}>{t('receipt.cameraBlocked')}</Text>
        <Pressable
          style={[formStyles.save, styles.action]}
          onPress={() => void Linking.openSettings()}
          accessibilityRole="button"
        >
          <Text style={formStyles.saveText}>{t('voice.openSettings')}</Text>
        </Pressable>
        <Pressable style={styles.link} onPress={pickFromGallery} accessibilityRole="button">
          <Text style={styles.linkText}>{t('receipt.fromGallery')}</Text>
        </Pressable>
        <BackLink onPress={onBack} />
      </View>
    );
  }

  if (state.status === 'done') {
    return (
      <View style={styles.root}>
        <VoiceConfirmPanel
          supabase={supabase}
          farmId={farmId}
          parsed={state.success.parsed}
          // No transcript on this route, and not because one was dropped: the
          // farmer is looking at the photograph he just took.
          transcript={null}
          origin="ocr"
          onAttach={attach}
          // Straight back to the camera. reset() drops the picked file with it,
          // so the next scan cannot attach the previous receipt.
          onRecordAgain={reset}
          onBack={onBack}
        />
      </View>
    );
  }

  if (state.status === 'error') {
    // Three failures where offering the camera again would be a lie: the farm is
    // not on a paid plan, the month's allowance is gone, or the session is. None
    // of the three is fixed by a better photograph.
    const { nextStep } = state.failure;
    const canScanAgain =
      nextStep !== 'upgradePlan' && nextStep !== 'outOfScans' && nextStep !== 'signIn';
    return (
      <View style={styles.root}>
        <Text style={[formStyles.bad, styles.centered]}>{t(state.failure.messageKey)}</Text>
        {canScanAgain && (
          <Pressable
            style={[formStyles.save, styles.action]}
            onPress={reset}
            accessibilityRole="button"
          >
            <Text style={formStyles.saveText}>{t('receipt.again')}</Text>
          </Pressable>
        )}
        <BackLink onPress={onBack} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Text style={styles.title}>{t('capture.receipt')}</Text>

      {/* The scan affordance is Wheat-500, design.md's Tokens Colors: "Secondary
          accent, OCR/scan affordances". It is the one place in the product the
          colour is a shape and not a chip, and it is what keeps this button from
          reading as another green primary action like the microphone. */}
      <Pressable
        style={[styles.camera, busy && styles.cameraDisabled]}
        onPress={takePhoto}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={t('receipt.takePhoto')}
        accessibilityState={{ disabled: busy, busy }}
      >
        <CameraIcon size={32} strokeWidth={2.5} color={colors.paper} />
      </Pressable>

      {/* **No spinner-only state anywhere here**, per design.md's Loading State
          spec: a spinner tells this audience the phone is thinking, and what he
          needs to know is what it is doing with his receipt. */}
      <Text style={styles.status}>
        {state.status === 'uploading' ? t('receipt.reading') : t('receipt.hint')}
      </Text>

      <Pressable
        style={[formStyles.save, styles.action, busy && formStyles.saveDisabled]}
        onPress={takePhoto}
        disabled={busy}
        accessibilityRole="button"
      >
        <Text style={formStyles.saveText}>{t('receipt.takePhoto')}</Text>
      </Pressable>

      {/* A text link and not a second filled button, design.md: never two filled
          buttons competing for the same thumb. The gallery is the secondary
          route — a receipt he photographed earlier, or one somebody sent him. */}
      <Pressable
        style={styles.link}
        onPress={pickFromGallery}
        disabled={busy}
        accessibilityRole="button"
      >
        <Text style={styles.linkText}>{t('receipt.fromGallery')}</Text>
      </Pressable>

      <BackLink onPress={onBack} />
    </View>
  );
}

function BackLink({ onPress }: { onPress: () => void }) {
  return (
    <Pressable style={styles.link} onPress={onPress} accessibilityRole="button">
      <Text style={styles.linkText}>{t('voice.back')}</Text>
    </Pressable>
  );
}

// Sized from the tokens for the reason VoiceCapturePanel documents at length:
// this app holds no size values of its own, and the founder's 2026-08-31
// decision replaced design.md's 88/56 with 64/48.
const CAMERA_SIZE = touchTarget.primary;

const styles = StyleSheet.create({
  root: {
    alignSelf: 'stretch',
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
  camera: {
    width: CAMERA_SIZE,
    height: CAMERA_SIZE,
    borderRadius: CAMERA_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.wheat500,
    ...shadowFloat,
  },
  cameraDisabled: {
    opacity: 0.6,
  },
  status: {
    fontFamily: fonts.regular,
    fontSize: fontSize.bodySm,
    color: colors.slate600,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  // design.md, Error State: the one icon treatment that gets a background tint,
  // because it has to be found in under a second.
  blockedIcon: {
    width: touchTarget.min,
    height: touchTarget.min,
    borderRadius: touchTarget.min / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.loss100,
  },
  // Wheat and not Loss: a paid feature is not a fault, and colouring it like one
  // would tell the farmer something broke when nothing did.
  paidIcon: {
    width: touchTarget.min,
    height: touchTarget.min,
    borderRadius: touchTarget.min / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.wheat100,
  },
  blockedText: {
    fontFamily: fonts.regular,
    fontSize: fontSize.bodySm,
    color: colors.ink900,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  centered: {
    textAlign: 'center',
  },
  action: {
    alignSelf: 'stretch',
    paddingHorizontal: spacing.s24,
  },
  link: {
    minHeight: touchTarget.min,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.s24,
  },
  linkText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.bodySm,
    color: colors.field700,
    writingDirection: 'rtl',
  },
});
