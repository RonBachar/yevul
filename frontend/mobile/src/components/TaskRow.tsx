import { useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import Check from 'lucide-react-native/icons/check';
import ClockArrowUp from 'lucide-react-native/icons/clock-arrow-up';
import { formatAmount, t, taskDueDisplay, type Currency, type Task } from '@yevul/shared';
import { colors, fonts, fontSize, radius, spacing } from '../theme/tokens';

const SWIPE_THRESHOLD_RATIO = 0.4;
const UNDO_MS = 5000;
const ROW_HEIGHT = 72;

// אטום התכונה, design.md "Task Row" ו-"Task Row, Swipe Actions". שלוש
// אזורי מגע: התיבה המובילה משלימה ישירות בלי צורך בהחלקה (התיבה
// עצמה נגישה ל-28px, אבל אזור המגע שלה נמתח לגובה השורה המלאה, לפי
// המפרט), גוף השורה פותח את גיליון העריכה, וההחלקה על השורה כולה
// משלימה (ימינה) או דוחה שבוע (שמאלה).
//
// "בוצע" ו"דחה שבוע" קוראים ל-commit רק אחרי חלון ה-undo, לא לפניו.
// completed_at הוא אירוע חד-כיווני במסד (אין UPDATE שהופך אותו בחזרה
// ל-null), ולכן ה-undo של חמש השניות חייב לדחות את הכתיבה עצמה, לא
// לבטל אותה אחרי שכבר נשלחה.
export function TaskRow({
  task,
  plotName,
  currency,
  onPress,
  onCompleteCommit,
  onSnoozeCommit,
}: {
  task: Task;
  plotName: string | null;
  currency: Currency;
  onPress: () => void;
  onCompleteCommit: () => void;
  onSnoozeCommit: () => void;
}) {
  const [width, setWidth] = useState(0);
  const [pending, setPending] = useState<'complete' | 'snooze' | null>(null);
  const translateX = useRef(new Animated.Value(0)).current;
  const collapse = useRef(new Animated.Value(1)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onLayout(event: LayoutChangeEvent) {
    setWidth(event.nativeEvent.layout.width);
  }

  function resetSwipe() {
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true, friction: 8 }).start();
  }

  function fire(kind: 'complete' | 'snooze', commit: () => void) {
    setPending(kind);
    Animated.timing(collapse, { toValue: 0, duration: 200, useNativeDriver: false }).start();
    timerRef.current = setTimeout(commit, UNDO_MS);
  }

  function undo() {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    translateX.setValue(0);
    Animated.timing(collapse, { toValue: 1, duration: 150, useNativeDriver: false }).start(() =>
      setPending(null),
    );
  }

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
      onPanResponderMove: (_, gesture) => translateX.setValue(gesture.dx),
      onPanResponderRelease: (_, gesture) => {
        const threshold = width * SWIPE_THRESHOLD_RATIO;
        if (width > 0 && gesture.dx > threshold) {
          fire('complete', onCompleteCommit);
        } else if (width > 0 && gesture.dx < -threshold) {
          fire('snooze', onSnoozeCommit);
        } else {
          resetSwipe();
        }
      },
    }),
  ).current;

  if (pending) {
    return (
      <Animated.View
        style={{
          maxHeight: collapse.interpolate({ inputRange: [0, 1], outputRange: [0, ROW_HEIGHT] }),
          opacity: collapse,
          overflow: 'hidden',
        }}
      >
        <View style={styles.undoRow}>
          <Text style={styles.undoText}>
            {pending === 'complete' ? t('tasks.completedToast') : t('tasks.snoozedToast')}
          </Text>
          <Pressable onPress={undo} accessibilityRole="button" hitSlop={12}>
            <Text style={styles.undoAction}>{t('tasks.action.undo')}</Text>
          </Pressable>
        </View>
      </Animated.View>
    );
  }

  const due = task.dueDate ? taskDueDisplay(task.dueDate) : null;
  const overdue = due?.tone === 'overdue';
  const metaParts = [
    plotName,
    due?.text,
    task.estimatedCost != null ? formatAmount(task.estimatedCost, currency) : null,
  ].filter((part): part is string => Boolean(part));

  return (
    <View style={styles.wrap} onLayout={onLayout}>
      {/* המסך שנחשף מאחורי השורה כשהיא נגררת. גרירה ימינה (dx חיובי)
          חושפת רצועה בצד שמאל של ה-wrap, כי תוכן החזית זז ימינה
          ומתגלה משמאלו, לכן "בוצע" (Field-500) יושב ב-left ולא ב-right,
          וההפך ל"דחה שבוע". שיוך לכיוון הגרירה, לא למיקום החזותי. */}
      <View style={[styles.action, styles.actionComplete]}>
        <Check size={22} color={colors.paper} strokeWidth={2.5} />
      </View>
      <View style={[styles.action, styles.actionSnooze]}>
        <ClockArrowUp size={22} color={colors.paper} strokeWidth={2.5} />
      </View>
      <Animated.View
        style={[styles.row, overdue && styles.rowOverdue, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        <Pressable
          style={styles.checkboxZone}
          onPress={() => fire('complete', onCompleteCommit)}
          accessibilityRole="button"
          accessibilityLabel={t('tasks.action.complete')}
        >
          <View style={styles.checkbox} />
        </Pressable>
        <Pressable style={styles.body} onPress={onPress} accessibilityRole="button">
          <Text style={styles.title} numberOfLines={1}>
            {task.title}
          </Text>
          {metaParts.length > 0 && (
            <Text style={[styles.meta, overdue && styles.metaOverdue]} numberOfLines={1}>
              {metaParts.join(' · ')}
            </Text>
          )}
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    minHeight: ROW_HEIGHT,
    borderRadius: radius.card,
    overflow: 'hidden',
  },
  action: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionComplete: {
    left: 0,
    backgroundColor: colors.field500,
  },
  actionSnooze: {
    right: 0,
    backgroundColor: colors.wheat500,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: ROW_HEIGHT,
    backgroundColor: colors.mist100,
    borderRadius: radius.card,
  },
  rowOverdue: {
    backgroundColor: colors.wheat100,
    borderRightWidth: 4,
    borderRightColor: colors.wheat500,
  },
  checkboxZone: {
    width: 56,
    minHeight: ROW_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.slate600,
  },
  body: {
    flex: 1,
    paddingVertical: spacing.s16,
    paddingHorizontal: spacing.s16,
    gap: spacing.s4,
  },
  title: {
    fontFamily: fonts.medium,
    fontSize: fontSize.bodyLg,
    color: colors.ink900,
    writingDirection: 'rtl',
  },
  meta: {
    fontFamily: fonts.regular,
    fontSize: fontSize.bodySm,
    color: colors.slate600,
    writingDirection: 'rtl',
  },
  metaOverdue: {
    fontFamily: fonts.medium,
    color: colors.wheat800,
  },
  undoRow: {
    minHeight: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s20,
    borderRadius: radius.card,
    backgroundColor: colors.mist200,
  },
  undoText: {
    fontFamily: fonts.regular,
    fontSize: fontSize.bodySm,
    color: colors.slate600,
    writingDirection: 'rtl',
  },
  undoAction: {
    fontFamily: fonts.bold,
    fontSize: fontSize.bodySm,
    color: colors.field700,
  },
});
