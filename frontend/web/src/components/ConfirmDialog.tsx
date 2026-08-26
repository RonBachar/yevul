import { Modal } from './Modal';
import './ConfirmDialog.css';

// דיאלוג אישור ממורכז, לפעולות הרסניות בלבד (כרגע רק מחיקת משימה),
// בונה על אותו Modal ממורכז ש-TaskSheet כבר משתמש בו. בקשת חקלאי
// מפורשת: מחיקה חייבת אישור לפני שהיא קורית, לא toast של ביטול אחרי
// המעשה כמו "בוצע". `destructive` צובע את כפתור האישור ב-Loss-600.
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal open={open} onClose={onCancel}>
      <h2 className="confirm-dialog__title">{title}</h2>
      <p className="confirm-dialog__message">{message}</p>
      <div className="confirm-dialog__actions">
        <button
          type="button"
          className={
            destructive
              ? 'confirm-dialog__confirm confirm-dialog__confirm--destructive'
              : 'confirm-dialog__confirm'
          }
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
        <button type="button" className="confirm-dialog__cancel" onClick={onCancel}>
          {cancelLabel}
        </button>
      </div>
    </Modal>
  );
}
