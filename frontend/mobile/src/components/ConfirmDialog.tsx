import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, fontSize, radius, shadowFloat, spacing } from '../theme/tokens';

// דיאלוג אישור ממורכז, לפעולות הרסניות בלבד (כרגע רק מחיקת משימה).
// לא BottomSheet: זה לא טופס, שני משפטים ושני כפתורים, ולא צריך גלילה
// או טיפול מקלדת. בקשת חקלאי מפורשת: מחיקה חייבת אישור לפני שהיא
// קורית, לא toast של ביטול אחרי המעשה כמו "בוצע". `destructive` צובע
// את כפתור האישור ב-Loss-600, כדי שהאדום עצמו יגיד "זה בלתי הפיך".
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable
        style={styles.scrim}
        onPress={onCancel}
        accessibilityRole="button"
        accessibilityLabel={cancelLabel}
      />
      <View style={styles.wrap} pointerEvents="box-none">
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.actions}>
            <Pressable
              style={[styles.button, styles.confirmButton, destructive && styles.destructiveButton]}
              onPress={onConfirm}
              accessibilityRole="button"
            >
              <Text style={styles.confirmText}>{confirmLabel}</Text>
            </Pressable>
            <Pressable
              style={[styles.button, styles.cancelButton]}
              onPress={onCancel}
              accessibilityRole="button"
            >
              <Text style={styles.cancelText}>{cancelLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const scrimColor = `${colors.ink900}6b`;

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: scrimColor,
  },
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.s24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.paper,
    borderRadius: radius.card,
    padding: spacing.s24,
    gap: spacing.s16,
    ...shadowFloat,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: fontSize.bodyLg,
    color: colors.ink900,
    writingDirection: 'rtl',
    textAlign: 'center',
  },
  message: {
    fontFamily: fonts.regular,
    fontSize: fontSize.bodySm,
    color: colors.slate600,
    writingDirection: 'rtl',
    textAlign: 'center',
  },
  actions: {
    gap: spacing.s8,
  },
  button: {
    minHeight: 48,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButton: {
    backgroundColor: colors.field700,
  },
  destructiveButton: {
    backgroundColor: colors.loss600,
  },
  confirmText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.bodySm,
    color: colors.paper,
  },
  cancelButton: {
    backgroundColor: colors.mist200,
  },
  cancelText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.bodySm,
    color: colors.ink900,
  },
});
