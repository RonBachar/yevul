import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import Plus from 'lucide-react-native/icons/plus';
import { t } from '@yevul/shared';
import { colors, fonts, fontSize, shadowFloat, spacing, touchTarget } from '../theme/tokens';

// design.md, Bottom Tab Bar (RTL): ארבעה טאבים שטוחים ועוד פעולה
// מרכזית מורמת, בית / חלקות / [רישום] / כסף / עוד. רקע לבן עם קו שיער
// עליון בלבד, בלי צל, כי המערכת היא hairline first.
//
// הסדר לא ממורכז ידנית. הלקוח כופה RTL ב-App.tsx, ולכן flexDirection
// row כבר מסתדר מימין לשמאל, ובית יושב בקצה הימני כמו שהמפרט דורש.
//
// כפתור הרישום איננו מסך ולכן איננו route בנאוויגייטור. design.md מפורש,
// לחיצה עליו פותחת גיליון ולא מנווטת, והוא לעולם לא מציג מצב active.

const BAR_HEIGHT = 76;
// כמה מהעיגול מתנשא מעל קו השורה. שומר על העיגול בתוך גבולות הרכיב,
// כדי שאנדרואיד לא יחתוך אותו כמו שקורה עם overflow visible.
const CAPTURE_LIFT = 26;

export function TabBar({
  state,
  descriptors,
  navigation,
  onCapturePress,
}: BottomTabBarProps & { onCapturePress: () => void }) {
  const insets = useSafeAreaInsets();
  const middle = Math.floor(state.routes.length / 2);

  function renderTab(route: (typeof state.routes)[number], index: number) {
    const focused = state.index === index;
    // האייקון והתווית מוגדרים ליד המסך עצמו ב-RootTabs, דרך options,
    // ולא במפה נפרדת שצריך לזכור לעדכן כששם מסך משתנה.
    const { tabBarIcon, title } = descriptors[route.key].options;
    const label = title ?? route.name;
    const tint = focused ? colors.field700 : colors.slate600;

    function onPress() {
      const event = navigation.emit({
        type: 'tabPress',
        target: route.key,
        canPreventDefault: true,
      });
      if (!focused && !event.defaultPrevented) {
        navigation.navigate(route.name);
      }
    }

    return (
      <Pressable
        key={route.key}
        style={styles.tab}
        onPress={onPress}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={label}
      >
        {tabBarIcon?.({ focused, color: tint, size: 24 })}
        <Text style={[styles.tabLabel, { color: tint }, focused && styles.tabLabelActive]}>
          {label}
        </Text>
      </Pressable>
    );
  }

  return (
    <View style={[styles.root, { height: CAPTURE_LIFT + BAR_HEIGHT + insets.bottom }]}>
      <View style={[styles.bar, { paddingBottom: insets.bottom }]}>
        {state.routes.slice(0, middle).map(renderTab)}
        <View style={styles.captureSlot} />
        {state.routes.slice(middle).map((route, i) => renderTab(route, i + middle))}
      </View>

      <View style={styles.captureLayer} pointerEvents="box-none">
        <Pressable
          style={styles.capture}
          onPress={onCapturePress}
          accessibilityRole="button"
          accessibilityLabel={t('nav.capture')}
        >
          <Plus size={32} strokeWidth={2.5} color={colors.paper} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingTop: CAPTURE_LIFT,
  },
  bar: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.paper,
    borderTopWidth: 1,
    borderTopColor: colors.border200,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s4,
  },
  tabLabel: {
    fontFamily: fonts.bold,
    fontSize: fontSize.caption,
    writingDirection: 'rtl',
  },
  tabLabelActive: {
    fontFamily: fonts.bold,
  },
  // שומר לכפתור המרכזי מקום משלו בשורה, כדי שהתוויות של חלקות וכסף
  // לא יזחלו מתחת לעיגול.
  captureSlot: {
    width: touchTarget.primary,
  },
  captureLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  capture: {
    width: touchTarget.primary,
    height: touchTarget.primary,
    borderRadius: touchTarget.primary / 2,
    backgroundColor: colors.field500,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadowFloat,
  },
});
