import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  sheetDismissDuration,
  sheetDragOffset,
  sheetExitOffset,
  sheetScrimFade,
  shouldDismissSheet,
} from '@yevul/shared';
import { colors, radius, shadowFloat, spacing, touchTarget } from '../theme/tokens';

// המעטפת המשותפת לגיליונות תחתונים, סקרים, גיליון וגבשושית האחיזה.
// נולדה ב-CaptureSheet ועברה לכאן כש-Forecast Update ועריכת הגידול
// במסך פרטי חלקה נזקקו לאותה מעטפת בדיוק. מומשת עם Modal של React
// Native ולא עם ספריית bottom sheet, כדי לא להוסיף תלות ב-reanimated,
// אותו נימוק בדיוק כמו ב-CaptureSheet.
//
// **טיפול המקלדת חי כאן ולא בגיליונות עצמם, וזו החלטה מבנית.** כל
// גיליון חדש עם שדה טקסט מקבל אותו טיפול בזכות המעטפת, בלי לזכור
// להוסיף אותו. שתי שכבות נדרשות ביחד, אחת לא מספיקה:
//
// 1. KeyboardAvoidingView מקטין את השטח הפנוי כשהמקלדת עולה.
// 2. ScrollView + maxHeight מאפשרים לתוכן להצטמצם בתוך השטח שנשאר.
//
// בלי (2), גיליון גבוה (TaskSheet, ארבעה שדות) פשוט נחתך: השטח קטן,
// התוכן לא, והשדות התחתונים יחד עם כפתור השמירה יוצאים מהמסך. זה בדיוק
// מה שקרה אחרי שהתווסף TaskSheet, ולכן התיקון כאן ולא שם.
//
// ---- Drag down to close. ----
//
// **The gesture was reported as broken, and it did not exist.** From the far
// side of the screen those are the same thing. The grabber has always looked
// like a handle and has never been wired to anything, so pulling it down did
// nothing — except when the finger started high enough to land on the scrim
// instead, which does close on press. One gesture, two outcomes, decided by a
// few points of thumb placement: "sometimes it works and sometimes it does not".
//
// **Animated and PanResponder, not reanimated and not gesture-handler.** The
// same standing decision as the paragraph above and as TaskSheet's missing date
// picker: no new native dependency goes in before it has been proved on a
// device.
//
// **The drag starts on the handle and nowhere else.** The nicer-sounding
// alternative, dragging from anywhere as long as the inner ScrollView sits at
// offset 0, needs capture-phase handlers on the sheet, because React Native
// gives a touch to the deepest view that claims it and a parent can only take
// it back by capturing. Capturing is exactly what would break the horizontal
// chip rows inside TaskSheet, LogEntrySheet, CompletionPromptSheet and
// VoiceConfirmPanel: swiping the plot chips sideways would start dismissing the
// sheet. Trading one unreliable gesture for four is not a fix. The handle is a
// sibling above the ScrollView, so a farmer scrolling a long sheet cannot reach
// this responder by accident and a tap on a field or on Save cannot be
// swallowed by it.
//
// **What runs on the native driver, and what could not.** Both animations do,
// and so does the scrim's opacity, which is interpolated off the same value and
// therefore evaluated on the UI thread with them. The drag itself could not.
// PanResponder's touches arrive on the JavaScript thread, and Animated.event
// rejects useNativeDriver for events that are not natively driven, so every
// move writes the value with setValue. That write still reaches the native node
// directly, so there is no React render per frame, but the touch-to-frame path
// is JavaScript. Making that path native is what gesture-handler exists for,
// and gesture-handler is the dependency we are not adding.
//
// **The Modal keeps ownership of the presentation.** animationType="slide"
// already animates the sheet in and out, so a dismissing drag plays its own
// short exit and only then calls onClose, leaving the Modal to slide out
// something that is already off screen. The transform is deliberately not reset
// on close: the sheet is still mounted while the Modal plays that exit, and
// zeroing it there is precisely what makes a dismissed sheet flash back to its
// open position for a few frames before it disappears. It is reset when
// `visible` turns true instead, at a moment when the Modal's own slide-in still
// holds the whole container below the screen edge.
//
// The distances, the velocity and the fade are in packages/shared/sheetDrag.ts,
// where they can be tested. This file is the wiring.
const scrimColor = `${colors.ink900}6b`;

// הגיליון לא עולה מעל 88% מגובה המסך גם בלי מקלדת, כדי שה-scrim מאחוריו
// יישאר לחיץ לסגירה ושהגיליון ימשיך להיקרא כשכבה מעל המסך ולא כמסך מלא.
const MAX_SHEET_HEIGHT_RATIO = '88%';

export function BottomSheet({
  visible,
  onClose,
  closeLabel,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  closeLabel: string;
  children: ReactNode;
}) {
  const dragY = useRef(new Animated.Value(0)).current;
  const [sheetHeight, setSheetHeight] = useState(0);

  // The gesture handlers below are built once and would otherwise close over
  // the first render's onClose forever — every consumer passes an inline arrow,
  // so its identity changes on every keystroke inside the sheet. They read this
  // instead. An effect rather than an assignment during render: nothing can
  // fire a touch between a render and its commit.
  const latest = useRef({ onClose, sheetHeight });
  useEffect(() => {
    latest.current = { onClose, sheetHeight };
  });

  // Ready for the next presentation. See the header: resetting on close is what
  // makes a dismissed sheet flash back to where it started.
  useEffect(() => {
    if (visible) dragY.setValue(0);
  }, [visible, dragY]);

  // A spring rather than a timing, because a drag that did not earn the
  // dismissal should look like it was let go of, not like it was cancelled.
  // Zero bounciness: overshoot on a sheet edge reads as a glitch, not as life.
  function springBack() {
    Animated.spring(dragY, {
      toValue: 0,
      bounciness: 0,
      speed: 12,
      useNativeDriver: true,
    }).start();
  }

  // Built on the first render and kept, so the handlers cannot be swapped out
  // from under a gesture that is already in progress. Everything they need that
  // changes between renders they read from `latest` above.
  const responder = useRef(
    PanResponder.create({
      // The handle holds nothing tappable, so the drag can begin on touch down
      // with no movement threshold to cross first. That immediacy is most of
      // what "smooth" means here.
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Nothing may take the sheet out of the farmer's hand mid-drag.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        // Grabbing the handle during a spring back snaps the sheet to the top
        // first: a native-driven value cannot be read back from JavaScript
        // without attaching a listener that costs a bridge message per frame.
        // The window is the length of one spring, and the finger has already
        // left the screen by then.
        dragY.stopAnimation();
      },
      onPanResponderMove: (_event, gesture) => {
        dragY.setValue(sheetDragOffset(gesture.dy));
      },
      onPanResponderRelease: (_event, gesture) => {
        const { onClose: close, sheetHeight: height } = latest.current;
        if (!shouldDismissSheet({ dy: gesture.dy, vy: gesture.vy, sheetHeight: height })) {
          springBack();
          return;
        }
        const exitOffset = sheetExitOffset(height, Dimensions.get('window').height);
        Animated.timing(dragY, {
          toValue: exitOffset,
          duration: sheetDismissDuration({ dy: gesture.dy, vy: gesture.vy, exitOffset }),
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }).start(() => close());
      },
      onPanResponderTerminate: () => springBack(),
    }),
  ).current;

  // Re-measured whenever the keyboard resizes the sheet, which is the point:
  // the thresholds and the fade both describe a sheet at its current height.
  function onSheetLayout(event: LayoutChangeEvent) {
    const height = Math.round(event.nativeEvent.layout.height);
    setSheetHeight((current) => (current === height ? current : height));
  }

  const scrimOpacity = useMemo(
    () => dragY.interpolate({ ...sheetScrimFade(sheetHeight), extrapolate: 'clamp' }),
    [dragY, sheetHeight],
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* The scrim fades as the sheet is pulled down, so that letting go now
          reads as "this closes". The Pressable inside it, rather than an
          animated Pressable, keeps the tap-to-close button exactly as it was. */}
      <Animated.View style={[styles.scrim, { opacity: scrimOpacity }]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
        />
      </Animated.View>
      <KeyboardAvoidingView
        style={styles.sheetWrap}
        pointerEvents="box-none"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Animated.View
          style={[styles.sheet, { transform: [{ translateY: dragY }] }]}
          onLayout={onSheetLayout}
        >
          <SafeAreaView edges={['bottom']} style={styles.safeArea}>
            <View style={styles.handle} {...responder.panHandlers}>
              <View style={styles.grabber} />
            </View>
            {/* keyboardShouldPersistTaps: בלי זה הלחיצה הראשונה על "שמירה"
                או על צ'יפ, כשהמקלדת פתוחה, רק סוגרת את המקלדת ונבלעת,
                והמשתמש צריך ללחוץ פעמיים. */}
            <ScrollView
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              {children}
            </ScrollView>
          </SafeAreaView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: scrimColor,
  },
  sheetWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    // maxHeight ולא height: גיליון קצר (CaptureSheet, שלוש שורות) נשאר
    // בגובה התוכן שלו, וגיליון גבוה נעצר ומתחיל לגלול במקום להיחתך.
    maxHeight: MAX_SHEET_HEIGHT_RATIO,
    backgroundColor: colors.paper,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: spacing.s24,
    ...shadowFloat,
  },
  // flexShrink מאפשר ל-SafeAreaView להצטמצם מתחת ל-maxHeight של הגיליון.
  // בלי זה ה-ScrollView שבתוכו לא מקבל גבול גובה ולא גולל בכלל.
  safeArea: {
    flexShrink: 1,
  },
  content: {
    paddingBottom: spacing.s8,
  },
  // The area the drag is picked up from: full width, one touch target tall. The
  // pill it centres is the sign, this is the target, and the two were the same
  // four points high until now.
  handle: {
    height: touchTarget.min,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Wider and thicker than it was, in Border-200 rather than the near-white
  // Mist-200, because it now promises something and has to be seen promising
  // it by a farmer of 65 holding the phone in the sun.
  grabber: {
    width: touchTarget.primary,
    height: spacing.s8,
    borderRadius: radius.pill,
    backgroundColor: colors.border200,
  },
});
