import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Trash2 from 'lucide-react-native/icons/trash-2';
import {
  ASSIGNABLE_ROLES,
  avatarUrl,
  canManageMembers,
  inviteMember,
  memberInitials,
  memberRoleLabelKey,
  removeMember,
  updateMemberRole,
  uploadAvatar,
  useMembers,
  t,
  RECEIPT_JPEG_QUALITY,
  type AssignableRole,
  type FarmMember,
  type InviteResult,
} from '@yevul/shared';
import { supabase } from '../lib/supabase';
import { compressPickedReceipt } from '../lib/receiptImage';
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

// מצב העלאת תמונת הפרופיל של המשתמש עצמו.
type AvatarStatus = 'idle' | 'uploading' | 'error';

export function MembersSection() {
  const { loading, failed, farmId, members, myRole, currentUserId, refresh } = useMembers(supabase);
  const isOwner = canManageMembers(myRole);

  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<AssignableRole>('worker');
  const [inviteStatus, setInviteStatus] = useState<InviteStatus>('idle');
  const [pendingRemove, setPendingRemove] = useState<FarmMember | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [avatarStatus, setAvatarStatus] = useState<AvatarStatus>('idle');
  // תצוגה מקומית מיד אחרי העלאה מוצלחת. הנתיב בבאקט קבוע (avatar.jpg),
  // כך שה-URL הציבורי זהה ועלול להיות ממוטמן, ולכן מציגים את הקובץ שהרגע
  // נבחר עד לרענון.
  const [selfPreview, setSelfPreview] = useState<string | null>(null);

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

  // בחירת תמונה מהגלריה, דחיסה (אותו נתיב כמו קבלה), וקריאה כ-ArrayBuffer
  // לפני ההעלאה. **arrayBuffer() ולא blob()**: ה-Blob של RN הוא ידית
  // נייטיב ש-supabase-js לא קורא, ראה uploadAvatar. אין בקשת הרשאה
  // לגלריה, כמו בכפתור הצירוף של ExpenseSheet, כי הבורר רץ מחוץ לתהליך.
  async function onPickAvatar() {
    if (!currentUserId) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: RECEIPT_JPEG_QUALITY,
      allowsEditing: false,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;

    setAvatarStatus('uploading');
    // דחיסה לא זורקת ומחזירה את המקור אם היא נכשלת, ראה compressPickedReceipt.
    const compressed = await compressPickedReceipt(asset);
    const bytes = await fetch(compressed.uri).then((response) => response.arrayBuffer());
    const upload = await uploadAvatar(supabase, currentUserId, bytes, compressed.mimeType);
    if (upload.ok) {
      setSelfPreview(compressed.uri);
      setAvatarStatus('idle');
      refresh();
    } else {
      setAvatarStatus('error');
    }
  }

  const inviteMessage = INVITE_MESSAGE[inviteStatus];
  const removingInvite = pendingRemove?.status === 'invited';

  return (
    <View style={styles.section}>
      <Text style={styles.title}>{t('members.title')}</Text>

      {members.map((member) => {
        const canManage = isOwner && member.role !== 'owner' && !member.isSelf;
        // התצוגה המקומית מיד אחרי העלאה גוברת על ה-URL הציבורי, כמשוב
        // מיידי עד שהרוסטר נטען מחדש. הנתיב עצמו ייחודי לכל העלאה
        // (uploadAvatar), ולכן אין כאן בעיית מטמון, רק מהירות תגובה.
        const photo =
          member.isSelf && selfPreview ? selfPreview : avatarUrl(supabase, member.avatarPath);
        return (
          <View key={member.id} style={styles.member}>
            <View style={styles.memberHead}>
              <View style={styles.avatar}>
                {photo ? (
                  <Image source={{ uri: photo }} style={styles.avatarImage} />
                ) : (
                  <Text style={styles.avatarText}>{memberInitials(member.email) || '?'}</Text>
                )}
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

            {member.isSelf && (
              <View style={styles.avatarActions}>
                <Pressable
                  style={[formStyles.chip, avatarStatus === 'uploading' && formStyles.saveDisabled]}
                  onPress={onPickAvatar}
                  disabled={avatarStatus === 'uploading'}
                  accessibilityRole="button"
                >
                  <Text style={formStyles.chipText}>
                    {avatarStatus === 'uploading'
                      ? t('members.avatar.uploading')
                      : t('members.avatar.change')}
                  </Text>
                </Pressable>
                {avatarStatus === 'error' && (
                  <Text style={formStyles.bad}>{t('members.avatar.error')}</Text>
                )}
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
  avatarImage: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
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
  avatarActions: {
    flexDirection: 'row',
    alignItems: 'center',
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
