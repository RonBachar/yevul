import { useEffect, type ReactNode } from 'react';
import './Modal.css';

// מקבילת הווב ל-BottomSheet של הנייד. גיליון תחתון לא מתאים לשולחן
// עבודה, דיאלוג ממורכז עם scrim הוא המקבילה הטבעית, אותו עיקרון בדיוק
// (מוקד על שדה אחד או שניים, בלי ניווט למסך חדש), פריסה אחרת. משמש
// כרגע רק ב-TaskSheet, ולכן חי כרכיב כללי כדי שהמשימות הבאות שיזדקקו
// לדיאלוג מרכזי לא יבנו אותו שוב.
export function Modal({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal__scrim" onClick={onClose}>
      <div
        className="modal__dialog"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
