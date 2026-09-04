import { useState, type FormEvent } from 'react';
import { Trash2 } from 'lucide-react';
import {
  ASSIGNABLE_ROLES,
  inviteMember,
  memberRoleLabelKey,
  removeMember,
  updateMemberRole,
  useMembers,
  t,
  type AssignableRole,
  type FarmMember,
  type InviteResult,
} from '@yevul/shared';
import { supabase } from '../lib/supabase';
import { ConfirmDialog } from './ConfirmDialog';
import './MembersSection.css';

// חברי המשק, שלב 6, במסך ההגדרות. הרוסטר, הזמנה לפי אימייל, שינוי
// תפקיד והסרה. כל האכיפה במסד: ניהול פתוח לבעלים בלבד, ו-myRole מהשרת
// קובע אם מציגים את כלי הניהול. גם אם המסך היה מציג אותם לכולם, כל
// כתיבה שאינה של בעלים נדחית ב-RLS.
//
// design.md, בלוק Sharing: כלי צוות "בלתי נראים במשק של אדם אחד". זה
// חל על אווטרים בשורות משימה ועל מתג "החלקות שלי", לא על מדור ההזמנה
// כאן, שהוא בדיוק המקום שאליו הבעלים נכנס כדי לצרף את האדם הראשון.

type InviteReason = Extract<InviteResult, { ok: false }>['reason'];
type InviteStatus = 'idle' | 'sending' | InviteReason | 'success';

const INVITE_MESSAGE: Partial<Record<InviteStatus, { key: string; tone: 'good' | 'bad' }>> = {
  success: { key: 'members.invite.success', tone: 'good' },
  invalidEmail: { key: 'members.invite.invalidEmail', tone: 'bad' },
  duplicate: { key: 'members.invite.duplicate', tone: 'bad' },
  forbidden: { key: 'members.invite.forbidden', tone: 'bad' },
  error: { key: 'members.invite.error', tone: 'bad' },
};

function initials(email: string | null): string {
  if (!email) return '?';
  const local = email.split('@')[0] ?? '';
  return (local.slice(0, 2) || '?').toUpperCase();
}

export function MembersSection() {
  const { loading, failed, farmId, members, myRole, refresh } = useMembers(supabase);
  const isOwner = myRole === 'owner';

  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<AssignableRole>('worker');
  const [inviteStatus, setInviteStatus] = useState<InviteStatus>('idle');
  // הסרה מאושרת דרך דיאלוג לפני הכתיבה, אותה תבנית כמו מחיקת משימה/הוצאה.
  const [pendingRemove, setPendingRemove] = useState<FarmMember | null>(null);
  // הודעת שגיאה לפעולות על שורה (שינוי תפקיד/הסרה), נפרדת מהודעת ההזמנה.
  const [rowError, setRowError] = useState<string | null>(null);

  // בזמן טעינה לא מרנדרים כלום, כדי לא להבהב מדור ריק מתחת לטופס
  // ההגדרות שכבר מוצג.
  if (loading) return null;

  if (failed) {
    return (
      <section className="members">
        <h2 className="members__title">{t('members.title')}</h2>
        <p className="form__message form__message--bad">{t('members.loadError')}</p>
      </section>
    );
  }

  async function onInvite(event: FormEvent) {
    event.preventDefault();
    if (!farmId) return;
    setInviteStatus('sending');
    const result = await inviteMember(supabase, farmId, email, inviteRole);
    if (result.ok) {
      setEmail('');
      setInviteStatus('success');
      refresh();
    } else {
      setInviteStatus(result.reason);
    }
  }

  async function onChangeRole(member: FarmMember, role: AssignableRole) {
    const result = await updateMemberRole(supabase, member.id, role);
    if (result.ok) {
      setRowError(null);
      refresh();
    } else {
      setRowError(t(result.reason === 'forbidden' ? 'members.roleForbidden' : 'members.roleError'));
    }
  }

  async function confirmRemove() {
    const member = pendingRemove;
    setPendingRemove(null);
    if (!member) return;
    const result = await removeMember(supabase, member.id);
    if (result.ok) {
      setRowError(null);
      refresh();
    } else {
      setRowError(
        t(result.reason === 'forbidden' ? 'members.removeForbidden' : 'members.removeError'),
      );
    }
  }

  const inviteMessage = INVITE_MESSAGE[inviteStatus];
  const removingInvite = pendingRemove?.status === 'invited';

  return (
    <section className="members">
      <h2 className="members__title">{t('members.title')}</h2>

      <ul className="members__list">
        {members.map((member) => {
          // כלי הניהול מוצגים לבעלים בלבד, ולעולם לא על שורת הבעלים
          // עצמה (אין העברת בעלות) ולא על השורה של המשתמש עצמו.
          const canManage = isOwner && member.role !== 'owner' && !member.isSelf;
          return (
            <li key={member.id} className="members__row">
              <span className="members__avatar" aria-hidden="true">
                {initials(member.email)}
              </span>
              <div className="members__identity">
                <span className="members__email">
                  {member.email ?? '—'}
                  {member.isSelf ? ` (${t('members.you')})` : ''}
                </span>
                {member.status === 'invited' && (
                  <span className="members__pending">{t('members.status.invited')}</span>
                )}
              </div>

              {canManage ? (
                <select
                  className="members__role-select"
                  value={member.role === 'owner' ? 'manager' : member.role}
                  onChange={(e) => onChangeRole(member, e.target.value as AssignableRole)}
                  aria-label={t('members.invite.role')}
                >
                  {ASSIGNABLE_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {t(memberRoleLabelKey(role))}
                    </option>
                  ))}
                </select>
              ) : (
                <span className={`members__badge members__badge--${member.role}`}>
                  {t(memberRoleLabelKey(member.role))}
                </span>
              )}

              {canManage && (
                <button
                  type="button"
                  className="members__remove"
                  onClick={() => setPendingRemove(member)}
                  aria-label={t('members.remove')}
                >
                  <Trash2 size={18} strokeWidth={2} aria-hidden="true" />
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {rowError && (
        <p className="form__message form__message--bad" role="alert">
          {rowError}
        </p>
      )}

      {isOwner && (
        <form className="members__invite" onSubmit={onInvite} noValidate>
          <h3 className="members__invite-title">{t('members.invite.title')}</h3>
          <input
            className="form__input"
            type="email"
            value={email}
            placeholder={t('members.invite.emailPlaceholder')}
            onChange={(e) => {
              setEmail(e.target.value);
              setInviteStatus('idle');
            }}
            disabled={inviteStatus === 'sending'}
          />

          <div className="members__invite-roles">
            {ASSIGNABLE_ROLES.map((role) => (
              <label key={role} className="members__invite-role">
                <input
                  type="radio"
                  name="invite-role"
                  value={role}
                  checked={inviteRole === role}
                  onChange={() => setInviteRole(role)}
                  disabled={inviteStatus === 'sending'}
                />
                <span className="members__invite-role-label">{t(memberRoleLabelKey(role))}</span>
                <span className="members__invite-role-hint">
                  {t(role === 'manager' ? 'members.role.managerHint' : 'members.role.workerHint')}
                </span>
              </label>
            ))}
          </div>

          <div className="form__actions">
            <button type="submit" className="form__submit" disabled={inviteStatus === 'sending'}>
              {inviteStatus === 'sending'
                ? t('members.invite.sending')
                : t('members.invite.submit')}
            </button>
            {inviteMessage && (
              <p
                className={`form__message form__message--${inviteMessage.tone}`}
                role={inviteMessage.tone === 'good' ? 'status' : 'alert'}
              >
                {t(inviteMessage.key)}
              </p>
            )}
          </div>
        </form>
      )}

      <ConfirmDialog
        open={pendingRemove !== null}
        title={t(
          removingInvite ? 'members.removeInviteConfirmTitle' : 'members.removeConfirmTitle',
        )}
        message={pendingRemove?.email ?? ''}
        confirmLabel={t('members.removeConfirm')}
        cancelLabel={t('members.cancel')}
        destructive
        onConfirm={confirmRemove}
        onCancel={() => setPendingRemove(null)}
      />
    </section>
  );
}
