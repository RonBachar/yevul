import { useCallback, useMemo, useState } from 'react';
import { createBottomTabNavigator, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
// ייבוא לפי נתיב משנה ולא דרך ה-barrel. Metro לא עושה tree shaking,
// ולכן ייבוא מ-'lucide-react-native' גורר את קובץ הייצוא הראשי שמפנה
// לכל אלפי האייקונים בחבילה.
import House from 'lucide-react-native/icons/house';
import LayoutGrid from 'lucide-react-native/icons/layout-grid';
import Wallet from 'lucide-react-native/icons/wallet';
import Ellipsis from 'lucide-react-native/icons/ellipsis';
import { t } from '@yevul/shared';
import { HomeScreen } from '../screens/HomeScreen';
import { PlotsScreen } from '../screens/PlotsScreen';
import { MoneyScreen } from '../screens/MoneyScreen';
import { MoreStack } from './MoreStack';
import { CaptureSheet } from './CaptureSheet';
import { TabBar } from './TabBar';

// הניווט הראשי של הלקוח המאומת. ארבעה יעדים בלבד, וכפתור הרישום
// שביניהם הוא פעולה ולא יעד, ולכן הוא לא רשום כאן כמסך.
//
// מצב פתיחת הגיליון יושב כאן ולא ב-TabBar, כי הגיליון מוצג מעל כל
// הניווט ולא מתוך השורה.
//
// שמות האייקונים: design.md מפרט home ו-more-horizontal, ששונו מאז
// ב-lucide ל-House ו-Ellipsis. השמות הישנים קיימים כ-alias מיושן,
// ולכן משתמשים בנוכחיים, אותו אייקון בדיוק.
const Tab = createBottomTabNavigator();

export function RootTabs() {
  const [captureOpen, setCaptureOpen] = useState(false);

  // פתיחת הגיליון משנה state שיושב מעל הנאוויגייטור, ולכן בלי הייצוב
  // הזה כל לחיצה על כפתור הרישום הייתה בונה מחדש את פונקציית שורת
  // הטאבים ואת ארבעת אובייקטי ה-options, מה שמכריח את React Navigation
  // לבנות מחדש את התיאורים ולצייר מחדש חמישה עצי SVG. זו אינטראקציה
  // חמה על המכשירים החלשים ביותר שאנחנו מכוונים אליהם.
  const openCapture = useCallback(() => setCaptureOpen(true), []);
  const closeCapture = useCallback(() => setCaptureOpen(false), []);
  const renderTabBar = useCallback(
    (props: BottomTabBarProps) => <TabBar {...props} onCapturePress={openCapture} />,
    [openCapture],
  );
  const screenOptions = useMemo(() => ({ headerShown: false }) as const, []);

  return (
    <>
      <Tab.Navigator screenOptions={screenOptions} tabBar={renderTabBar}>
        <Tab.Screen
          name="Home"
          component={HomeScreen}
          options={{
            title: t('nav.home'),
            tabBarIcon: ({ color, size }) => <House size={size} strokeWidth={2} color={color} />,
          }}
        />
        <Tab.Screen
          name="Plots"
          component={PlotsScreen}
          options={{
            title: t('nav.plots'),
            tabBarIcon: ({ color, size }) => (
              <LayoutGrid size={size} strokeWidth={2} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Money"
          component={MoneyScreen}
          options={{
            title: t('nav.money'),
            tabBarIcon: ({ color, size }) => <Wallet size={size} strokeWidth={2} color={color} />,
          }}
        />
        <Tab.Screen
          name="More"
          component={MoreStack}
          options={{
            title: t('nav.more'),
            tabBarIcon: ({ color, size }) => <Ellipsis size={size} strokeWidth={2} color={color} />,
          }}
        />
      </Tab.Navigator>
      <CaptureSheet visible={captureOpen} onClose={closeCapture} />
    </>
  );
}
