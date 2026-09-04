import { useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import Check from 'lucide-react-native/icons/check';
import Trash2 from 'lucide-react-native/icons/trash-2';
import {
  formatAmount,
  t,
  taskDueDisplay,
  type Currency,
  type Task,
  type TaskAssignee,
} from '@yevul/shared';
import { colors, fonts, fontSize, radius, spacing } from '../theme/tokens';
import { ConfirmDialog } from './ConfirmDialog';

const UNDO_MS = 5000;
const ROW_HEIGHT = 72;
const ACTION_SIZE = 48;

// אטום התכונה, design.md "Task Row". שתי פעולות: "בוצע" ו"מחיקה" (לא
// snooze יותר, בקשת חקלאי מפורשת: לפעמים משימה כבר לא רלוונטית ואין
// טעם לרשום אותה כבוצעה, רק להסיר). כל אחת נגישה משני מקומות, כפתור
// עגול קטן (48px, מעל רצפת הנגישות של 56 כי זה לא כל אזור המגע, ראה
// למטה) וגם החלקה על השורה כולה, אותה פעולה בשתי הדרכים.
//
// שני מנגנוני בטיחות שונים, במכוון לא אותו אחד: "בוצע" משתמש ב-undo
// toast של חמש שניות (completed_at הוא אירוע חד-כיווני במסד, אין
// UPDATE שהופך אותו בחזרה, אז הכתיבה בפועל נדחית ולא מבוטלת אחרי
// שנשלחה). "מחיקה" מציגה דיאלוג אישור מודעי במקום, בקשת חקלאי מפורשת:
// מחיקה מרגישה סופית יותר מהשלמה, ומגיעה אחרי אישור ולא אחרי חלון
// המתנה שקט.
export function TaskRow({
  task,
  plotName,
  currency,
  assignee = null,
  onPress,
  onCompleteCommit,
  onDeleteCommit,
}: {
  task: Task;
  plotName: string | null;
  currency: Currency;
  // אווטאר החבר, שלב 6, design.md, Member Avatar. מגיע מוכן מ-TaskBoard
  // (הרוסטר נטען פעם אחת ללוח), ו-null כשהמשימה לא משויכת או משויכת
  // למשתמש המחובר, שאז לא מוצג כלום.
  assignee?: TaskAssignee | null;
  onPress: () => void;
  onCompleteCommit: () => void;
  onDeleteCommit: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const translateX = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // ref ולא state: ה-PanResponder נבנה פעם אחת בלבד ב-useRef למטה,
  // ונועל בסגירה (closure) את הערך של כל משתנה חיצוני כפי שהיה ברגע
  // ה-mount. עם state נשאר הרוחב תמיד 0 בתוך onPanResponderRelease.
  const widthRef = useRef(0);

  function onLayout(event: LayoutChangeEvent) {
    widthRef.current = event.nativeEvent.layout.width;
  }

  function resetSwipe() {
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true, friction: 8 }).start();
  }

  function fireComplete() {
    setPending(true);
    timerRef.current = setTimeout(onCompleteCommit, UNDO_MS);
  }

  function undo() {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    translateX.setValue(0);
    setPending(false);
  }

  function askDelete() {
    setConfirmingDelete(true);
  }

  function confirmDelete() {
    setConfirmingDelete(false);
    onDeleteCommit();
  }

  function cancelDelete() {
    setConfirmingDelete(false);
    resetSwipe();
  }

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
      onPanResponderMove: (_, gesture) => translateX.setValue(gesture.dx),
      onPanResponderRelease: (_, gesture) => {
        const width = widthRef.current;
        const threshold = width * 0.4;
        // dx שלילי (גרירה פיזית מימין לשמאל, כיוון הקריאה הטבעי בעברית)
        // הוא "בוצע", לא dx חיובי. נבדק בפועל עם המשתמש, ראה ההערה על
        // actionComplete/actionDelete למטה לגבי היפוך RTL.
        if (width > 0 && gesture.dx < -threshold) {
          fireComplete();
        } else if (width > 0 && gesture.dx > threshold) {
          askDelete();
        } else {
          resetSwipe();
        }
      },
    }),
  ).current;

  // ללא אנימציה: השורה מתחלפת מיד לחיווי ה-undo ונשארת בו לכל אורך
  // חמש השניות, אותו גובה בדיוק כמו השורה הרגילה.
  if (pending) {
    return (
      <View style={styles.undoRow}>
        <Text style={styles.undoText}>{t('tasks.completedToast')}</Text>
        <Pressable onPress={undo} accessibilityRole="button" hitSlop={12}>
          <Text style={styles.undoAction}>{t('tasks.action.undo')}</Text>
        </Pressable>
      </View>
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
      {/* המסך שנחשף מאחורי השורה כשהיא נגררת. translateX הוא ערך גיאומטרי
          גולמי ולא הופך תחת RTL (בניגוד ל-left/right בסטייל, ש-RN הופך
          אוטומטית כש-I18nManager.allowRTL(true) פעיל, App.tsx). גרירה
          שמאלה בפועל (dx שלילי, כיוון "בוצע") מזיזה את השורה שמאלה
          ומגלה את הרצועה הפיזית הימנית — ולכן "בוצע" מקודד left:0, ש-RN
          הופך ל"ימין" הפיזי, וההפך ל"מחיקה". שיוך לצבע שמתגלה בפועל
          בשחרור (ראו onPanResponderRelease), לא לשם הסגנון. */}
      <View style={[styles.action, styles.actionComplete]}>
        <Check size={22} color={colors.paper} strokeWidth={2.5} />
      </View>
      <View style={[styles.action, styles.actionDelete]}>
        <Trash2 size={22} color={colors.paper} strokeWidth={2.5} />
      </View>
      <Animated.View
        style={[styles.row, overdue && styles.rowOverdue, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
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
        {/* אווטאר החבר, design.md, Member Avatar: עיגול 32px, מילוי
            Field-100, ראשי תיבות ב-Field-700, באזור ה-trailing בלבד. */}
        {assignee && (
          <View
            style={styles.avatar}
            accessibilityLabel={`${t('tasks.assignedTo')} ${assignee.label}`}
          >
            <Text style={styles.avatarText}>{assignee.initials}</Text>
          </View>
        )}
        <View style={styles.buttons}>
          <Pressable
            style={[styles.iconButton, styles.completeButton]}
            onPress={fireComplete}
            accessibilityRole="button"
            accessibilityLabel={t('tasks.action.complete')}
          >
            <Check size={20} color={colors.paper} strokeWidth={2.5} />
          </Pressable>
          <Pressable
            style={[styles.iconButton, styles.deleteButton]}
            onPress={askDelete}
            accessibilityRole="button"
            accessibilityLabel={t('tasks.action.delete')}
          >
            <Trash2 size={20} color={colors.paper} strokeWidth={2.5} />
          </Pressable>
        </View>
      </Animated.View>
      <ConfirmDialog
        visible={confirmingDelete}
        title={t('tasks.deleteConfirmTitle')}
        message={task.title}
        confirmLabel={t('tasks.action.delete')}
        cancelLabel={t('tasks.action.undo')}
        destructive
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />
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
  actionDelete: {
    right: 0,
    backgroundColor: colors.loss600,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: ROW_HEIGHT,
    backgroundColor: colors.mist100,
    borderRadius: radius.card,
    gap: spacing.s8,
    paddingLeft: spacing.s8,
  },
  rowOverdue: {
    backgroundColor: colors.wheat100,
    borderRightWidth: 4,
    borderRightColor: colors.wheat500,
  },
  body: {
    flex: 1,
    paddingVertical: spacing.s16,
    paddingHorizontal: spacing.s16,
    gap: spacing.s4,
  },
  title: {
    fontFamily: fonts.bold,
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
    fontFamily: fonts.bold,
    color: colors.wheat800,
  },
  // אווטאר החבר, design.md, Member Avatar: 32px, Field-100, ראשי תיבות
  // ב-Field-700. יושב באזור ה-trailing, לפני כפתורי הפעולה.
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
  buttons: {
    flexDirection: 'row',
    gap: spacing.s8,
  },
  // 48px, לא 56: זה כפתור בתוך שורה שכבר יש לה החלקה מקבילה לאותה
  // פעולה בדיוק, לא נקודת הכניסה היחידה. רצפת הנגישות של 56
  // (design.md, Touch Targets) חלה על אלמנטים שהם הדרך היחידה לפעולה.
  iconButton: {
    width: ACTION_SIZE,
    height: ACTION_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  completeButton: {
    backgroundColor: colors.field500,
  },
  deleteButton: {
    backgroundColor: colors.loss600,
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
