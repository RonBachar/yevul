import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ExternalLink, ImageOff } from 'lucide-react';
import { loadReceiptDocument, t, type ReceiptDocument } from '@yevul/shared';
import './ReceiptViewer.css';

// The filed receipt, in the browser.
//
// **This is the accountant's screen and not a courtesy copy of the phone's.**
// prd.md puts receipt handling in the browser explicitly, and the desktop can do
// two things the phone cannot: render a PDF invoice inline, and hand the
// document to a printer or a mail client through a normal tab. So the PDF branch
// here draws the file rather than sending it away.
//
// **Modal content and not a modal.** ExpenseSheet renders this in place of its
// own form, so only one dialog is ever mounted: two overlapping Modals would
// both listen for Escape, and one key press would close the viewer and the
// half-filled expense form together.
//
// **The signed URL lives exactly as long as this component.** It is good for
// five minutes (RECEIPT_SIGNED_URL_SECONDS) and is fetched on mount; going back
// unmounts this, and opening the viewer again signs a fresh one. Nothing above
// holds it, so there is no screen old enough for it to have expired under.
export function ReceiptViewer({
  supabase,
  expenseId,
  onBack,
}: {
  supabase: SupabaseClient;
  expenseId: string;
  onBack: () => void;
}) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [doc, setDoc] = useState<ReceiptDocument | null>(null);
  const [imageLoading, setImageLoading] = useState(true);
  const [imageFailed, setImageFailed] = useState(false);
  // "Try again" has to sign a new URL, not re-request a dead one.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setStatus('loading');
    setDoc(null);
    setImageLoading(true);
    setImageFailed(false);

    void loadReceiptDocument(supabase, expenseId).then((result) => {
      if (!active) return;
      if (!result.ok) {
        // "There is no document" and "we could not reach the document" are two
        // different things to tell someone. See receiptView.ts.
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

  const back = (
    <button type="button" className="form__cancel" onClick={onBack}>
      {t('expense.receipt.back')}
    </button>
  );

  if (status === 'loading') {
    return (
      <div className="receipt-viewer">
        <p className="screen__note">{t('expense.receipt.loading')}</p>
        <div className="receipt-viewer__actions">{back}</div>
      </div>
    );
  }

  if (status === 'missing') {
    return (
      <div className="receipt-viewer">
        <p className="screen__note">{t('expense.receipt.missing')}</p>
        <div className="receipt-viewer__actions">{back}</div>
      </div>
    );
  }

  if (status === 'error' || !doc) {
    return (
      <div className="receipt-viewer">
        <p className="form__message form__message--bad" role="alert">
          {t('expense.receipt.loadError')}
        </p>
        <div className="receipt-viewer__actions">
          <button
            type="button"
            className="form__submit"
            onClick={() => setAttempt((value) => value + 1)}
          >
            {t('expense.receipt.retry')}
          </button>
          {back}
        </div>
      </div>
    );
  }

  return (
    <div className="receipt-viewer">
      <h2 className="screen__title">{t('expense.receipt.title')}</h2>

      <div className="receipt-viewer__canvas">
        {doc.kind === 'pdf' ? (
          // Supabase serves a signed object with its stored content type and an
          // inline disposition, so a desktop browser's own PDF reader takes it
          // from here — scrolling, zooming and printing included, none of which
          // this app has to build.
          <iframe
            className="receipt-viewer__pdf"
            src={doc.signedUrl}
            title={t('expense.receipt.title')}
          />
        ) : imageFailed ? (
          // The bytes arrived and this browser would not draw them; a HEIC out
          // of a phone gallery is the realistic case. The file is intact, so the
          // new-tab link below is the honest way out rather than an apology.
          <div className="receipt-viewer__fallback">
            <ImageOff size={40} strokeWidth={1.5} aria-hidden="true" />
            <p className="screen__note">{t('expense.receipt.imageFailed')}</p>
          </div>
        ) : (
          <>
            <img
              className="receipt-viewer__image"
              src={doc.signedUrl}
              alt={t('expense.receipt.title')}
              onLoad={() => setImageLoading(false)}
              onError={() => {
                setImageLoading(false);
                setImageFailed(true);
              }}
            />
            {imageLoading && (
              <p className="screen__note receipt-viewer__overlay">{t('expense.receipt.loading')}</p>
            )}
          </>
        )}
      </div>

      <div className="receipt-viewer__actions">
        {/* The accountant's actual verb. A tab is what gets printed, saved and
            forwarded, and none of those are things this dialog should try to be.
            noreferrer as well as noopener: the signed URL must not travel to
            anyone as a Referer header. */}
        <a
          className="receipt-viewer__open"
          href={doc.signedUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLink size={16} strokeWidth={2} aria-hidden="true" />
          {t('expense.receipt.openTab')}
        </a>
        {back}
      </div>
    </div>
  );
}
