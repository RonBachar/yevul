import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Trash2 from 'lucide-react-native/icons/trash-2';
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
import { colors, fonts, fontSize, radius, spacing, touchTarget } from '../theme/tokens';
import { formStyles } from '../theme/formStyles';
import { ChipField } from './ChipField';
import { ConfirmDialog } from './ConfirmDialog';

// חברי המשק בנייד, שלב 6, מוצג בתוך מסך ההגדרות. תאום של רכיב הווב
// באותו שם, אותו הוק ואותן פעולות. כל האכיפה במסד: ניהול לבעלים בלבד,
// ו-myRole מהשרת קובע רק אם מציגים את כלי הניהול. הסתרת UI היא נוחות,
// לא הגנה.

type InviteReason = Extract<InviteResult, { ok: false }>['reason'];
type InviteStatus = 'idle' | 'sending' | InviteReason | 'success';

const INVITE_MESSAGE: Partial<Record<InviteStatus, { key: string; good: boolean }>> = {
  success: { key: 'members.invite.success', good: true },
  invalidEmail: { key: 'members.invite.invalidEmail', good: false },
  duplicate: { key: 'members.invite.duplicate', good: false },
  forbidden: { key: 'members.invite.forbidden', good: false },
  error: { key: 'members.invite.error', good: false },
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
  const [pendingRemove, setPendingRemove] = useState<FarmMember | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  if (loading) return null;

  if (failed) {
    return (
      <View style={styles.section}>
        <Text style={styles.title}>{t('members.title')}</Text>
        <Text style={formStyles.bad}>{t('members.loadError')}</Text>
      </View>
    );
  }

  async function onInvite() {
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
    if (member.role === role) return;
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
    <View style={styles.section}>
      <Text style={styles.title}>{t('members.title')}</Text>

      {members.map((member) => {
        const canManage = isOwner && member.role !== 'owner' && !member.isSelf;
        return (
          <View key={member.id} style={styles.member}>
            <View style={styles.memberHead}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials(member.email)}</Text>
              </View>
              <View style={styles.identity}>
                <Text style={styles.email} numberOfLines={1}>
                  {member.email ?? '—'}
                  {member.isSelf ? ` (${t('members.you')})` : ''}
                </Text>
                {member.status === 'invited' && (
                  <Text style={styles.pending}>{t('members.status.invited')}</Text>
                )}
              </View>

              {canManage ? (
                <Pressable
                  style={styles.remove}
                  onPress={() => setPendingRemove(member)}
                  accessibilityRole="button"
                  accessibilityLabel={t('members.remove')}
                >
                  <Trash2 size={20} strokeWidth={2} color={colors.loss600} />
                </Pressable>
              ) : (
                <View style={[styles.badge, badgeStyle(member)]}>
                  <Text style={[styles.badgeText, badgeTextStyle(member)]}>
                    {t(memberRoleLabelKey(member.role))}
                  </Text>
                </View>
              )}
            </View>

            {canManage && (
              <View style={styles.roleChips}>
                {ASSIGNABLE_ROLES.map((role) => {
                  const active = member.role === role;
                  return (
                    <Pressable
                      key={role}
                      style={[formStyles.chip, active && formStyles.chipActive]}
                      onPress={() => onChangeRole(member, role)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                    >
                      <Text style={[formStyles.chipText, active && formStyles.chipTextActive]}>
                        {t(memberRoleLabelKey(role))}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}

      {rowError && <Text style={formStyles.bad}>{rowError}</Text>}

      {isOwner && (
        <View style={styles.invite}>
          <Text style={styles.inviteTitle}>{t('members.invite.title')}</Text>
          <View style={formStyles.field}>
            <TextInput
              style={formStyles.input}
              value={email}
              onChangeText={(value) => {
                setEmail(value);
                setInviteStatus('idle');
              }}
              editable={inviteStatus !== 'sending'}
              placeholder={t('members.invite.emailPlaceholder')}
              placeholderTextColor={colors.slate600}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              textAlign="right"
            />
          </View>

          <ChipField
            label={t('members.invite.role')}
            options={ASSIGNABLE_ROLES}
            selected={inviteRole}
            labelKey={memberRoleLabelKey}
            onSelect={setInviteRole}
            disabled={inviteStatus === 'sending'}
          />

          <Pressable
            style={[formStyles.save, inviteStatus === 'sending' && formStyles.saveDisabled]}
            onPress={onInvite}
            disabled={inviteStatus === 'sending'}
            accessibilityRole="button"
          >
            <Text style={formStyles.saveText}>
              {inviteStatus === 'sending'
                ? t('members.invite.sending')
                : t('members.invite.submit')}
            </Text>
          </Pressable>

          {inviteMessage && (
            <Text style={inviteMessage.good ? formStyles.good : formStyles.bad}>
              {t(inviteMessage.key)}
            </Text>
          )}
        </View>
      )}

      <ConfirmDialog
        visible={pendingRemove !== null}
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
    </View>
  );
}

// תג תפקיד, design.md, Role Badge: בעלים Field-100/Field-700, שותף
// Mist-200/Ink-900, עובד Mist-200/Slate-600.
function badgeStyle(member: FarmMember) {
  if (member.role === 'owner') return { backgroundColor: colors.field100 };
  return { backgroundColor: colors.mist200 };
}

function badgeTextStyle(member: FarmMember) {
  if (member.role === 'owner') return { color: colors.field700 };
  if (member.role === 'manager') return { color: colors.ink900 };
  return { color: colors.slate600 };
}

const styles = StyleSheet.create({
  section: {
    marginTop: spacing.s24,
    paddingTop: spacing.s24,
    borderTopWidth: 1,
    borderTopColor: colors.mist200,
    gap: spacing.s16,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: fontSize.subheading,
    color: colors.ink900,
    writingDirection: 'rtl',
  },
  member: {
    gap: spacing.s8,
  },
  memberHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s12,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.field100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.caption,
    color: colors.field700,
  },
  identity: {
    flex: 1,
    minWidth: 0,
  },
  email: {
    fontFamily: fonts.regular,
    fontSize: fontSize.bodySm,
    color: colors.ink900,
  },
  pending: {
    fontFamily: fonts.regular,
    fontSize: fontSize.caption,
    color: colors.slate600,
    writingDirection: 'rtl',
  },
  badge: {
    paddingVertical: 2,
    paddingHorizontal: spacing.s12,
    borderRadius: radius.pill,
  },
  badgeText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.caption,
    writingDirection: 'rtl',
  },
  remove: {
    width: touchTarget.min,
    height: touchTarget.min,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleChips: {
    flexDirection: 'row',
    gap: spacing.s8,
    paddingStart: 44,
  },
  invite: {
    marginTop: spacing.s8,
    gap: spacing.s16,
  },
  inviteTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSize.body,
    color: colors.ink900,
    writingDirection: 'rtl',
  },
});
