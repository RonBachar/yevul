import { useEffect, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import type { SupabaseClient } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
import ExternalLink from 'lucide-react-native/icons/external-link';
import FileText from 'lucide-react-native/icons/file-text';
import ImageOff from 'lucide-react-native/icons/image-off';
import { loadReceiptDocument, t, type ReceiptDocument } from '@yevul/shared';
import { colors, fonts, fontSize, radius, spacing } from '../theme/tokens';
import { formStyles } from '../theme/formStyles';

// The filed receipt, on the phone.
//
// **Sheet content and not a sheet.** ExpenseSheet swaps this in for its own form
// inside the one BottomSheet it already owns, rather than opening a second
// Modal over the first. Two reasons, and the second is the important one: React
// Native's Modal nests unevenly across the two platforms, and the farmer's
// half-typed form survives the trip because ExpenseSheet never unmounts — he
// looks at the document and comes back to the amount he was in the middle of.
//
// **The signed URL is fetched here and dies here.** It is good for five minutes
// (RECEIPT_SIGNED_URL_SECONDS), and the only way to be sure a farmer is never
// staring at a URL that quietly went stale is for the URL to have no life longer
// than the viewer: this component fetches on mount, and ExpenseSheet unmounts it
// on the way back, so re-opening always signs afresh. Nothing caches it, and no
// screen above holds one.
export function ReceiptViewer({
  supabase,
  expenseId,
  onBack,
}: {
  supabase: SupabaseClient;
  expenseId: string;
  onBack: () => void;
}) {
  const { height } = useWindowDimensions();
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [doc, setDoc] = useState<ReceiptDocument | null>(null);
  const [imageLoading, setImageLoading] = useState(true);
  const [imageFailed, setImageFailed] = useState(false);
  const [openFailed, setOpenFailed] = useState(false);
  // Bumping this re-runs the effect, which is what "try again" has to do: a
  // failed attempt must sign a new URL rather than retry a dead one.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setStatus('loading');
    setDoc(null);
    setImageLoading(true);
    setImageFailed(false);
    setOpenFailed(false);

    void loadReceiptDocument(supabase, expenseId).then((result) => {
      if (!active) return;
      if (!result.ok) {
        // The two reasons are two screens. See receiptView.ts.
        setStatus(result.reason === 'none' ? 'missing' : 'error');
        return;
      }
      setDoc(result.document);
      setStatus('ready');
    });

    return () => {
      active = false;
    };
  }, [supabase, expenseId, attempt]);

  // The browser is where a PDF gets read and where an image gets zoomed on
  // Android, saved, or forwarded to the accountant. openBrowserAsync is an
  // in-app browser (SFSafariViewController / Custom Tabs), so he comes back with
  // the back button and not by hunting for the app again.
  async function openExternally(url: string) {
    setOpenFailed(false);
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch {
      setOpenFailed(true);
    }
  }

  const backButton = (
    <Pressable style={styles.back} onPress={onBack} accessibilityRole="button">
      <Text style={styles.backText}>{t('expense.receipt.back')}</Text>
    </Pressable>
  );

  if (status === 'loading') {
    return (
      <View style={styles.wrap}>
        <Text style={styles.note}>{t('expense.receipt.loading')}</Text>
        {backButton}
      </View>
    );
  }

  if (status === 'missing') {
    return (
      <View style={styles.wrap}>
        <Text style={styles.note}>{t('expense.receipt.missing')}</Text>
        {backButton}
      </View>
    );
  }

  if (status === 'error' || !doc) {
    return (
      <View style={styles.wrap}>
        <Text style={formStyles.bad}>{t('expense.receipt.loadError')}</Text>
        <Pressable
          style={formStyles.save}
          onPress={() => setAttempt((value) => value + 1)}
          accessibilityRole="button"
        >
          <Text style={formStyles.saveText}>{t('expense.receipt.retry')}</Text>
        </Pressable>
        {backButton}
      </View>
    );
  }

  // A PDF invoice, or an image this device turned out not to be able to draw —
  // a HEIC out of the gallery is the realistic second case. Both end in the same
  // place, because the browser can read both and this view can read neither.
  const undrawable = doc.kind === 'pdf' || imageFailed;

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{t('expense.receipt.title')}</Text>

      {undrawable ? (
        <View style={styles.fallback}>
          {doc.kind === 'pdf' ? (
            <FileText size={40} strokeWidth={1.5} color={colors.slate600} />
          ) : (
            <ImageOff size={40} strokeWidth={1.5} color={colors.slate600} />
          )}
          <Text style={styles.note}>
            {doc.kind === 'pdf' ? t('expense.receipt.pdf') : t('expense.receipt.imageFailed')}
          </Text>
        </View>
      ) : (
        // maximumZoomScale is iOS pinch-zoom and costs nothing: it is a prop on
        // a ScrollView this layout wanted anyway. Android ignores it, which is
        // why the "open the file" button below is on every branch and not only
        // on the PDF one — it is Android's zoom, and everyone's way to save the
        // document or send it on.
        <ScrollView
          style={[styles.canvas, { height: Math.round(height * 0.55) }]}
          contentContainerStyle={styles.canvasContent}
          maximumZoomScale={4}
          minimumZoomScale={1}
          centerContent
          showsVerticalScrollIndicator={false}
        >
          <Image
            source={{ uri: doc.signedUrl }}
            style={styles.image}
            resizeMode="contain"
            onLoadEnd={() => setImageLoading(false)}
            onError={() => {
              setImageLoading(false);
              setImageFailed(true);
            }}
            accessible
            accessibilityLabel={t('expense.receipt.title')}
          />
          {imageLoading && <Text style={styles.overlayNote}>{t('expense.receipt.loading')}</Text>}
        </ScrollView>
      )}

      <Pressable
        style={styles.openButton}
        onPress={() => void openExternally(doc.signedUrl)}
        accessibilityRole="button"
      >
        <ExternalLink size={18} strokeWidth={2} color={colors.field700} />
        <Text style={styles.openButtonText}>{t('expense.receipt.openFile')}</Text>
      </Pressable>
      {openFailed && <Text style={formStyles.bad}>{t('expense.receipt.openFailed')}</Text>}

      {backButton}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.s16,
    paddingBottom: spacing.s8,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: fontSize.bodyLg,
    color: colors.ink900,
    writingDirection: 'rtl',
  },
  note: {
    fontFamily: fonts.regular,
    fontSize: fontSize.body,
    color: colors.slate600,
    writingDirection: 'rtl',
  },
  overlayNote: {
    position: 'absolute',
    alignSelf: 'center',
    top: spacing.s16,
    fontFamily: fonts.regular,
    fontSize: fontSize.bodySm,
    color: colors.slate600,
  },
  // A tinted ground behind the document, so a white receipt on white paper still
  // has an edge and reads as a photograph of a thing rather than as the screen.
  canvas: {
    borderRadius: radius.card,
    backgroundColor: colors.mist100,
  },
  canvasContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  fallback: {
    alignItems: 'center',
    gap: spacing.s12,
    paddingVertical: spacing.s24,
    borderRadius: radius.card,
    backgroundColor: colors.mist100,
  },
  openButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s8,
    paddingVertical: spacing.s12,
    paddingHorizontal: spacing.s16,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border200,
    backgroundColor: colors.paper,
  },
  openButtonText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.bodySm,
    color: colors.field700,
  },
  back: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.s12,
  },
  backText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.bodySm,
    color: colors.slate600,
  },
});
