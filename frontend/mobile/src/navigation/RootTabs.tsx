import { useState } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ellipsis, House, LayoutGrid, Wallet } from 'lucide-react-native';
import { t } from '@yevul/shared';
import { HomeScreen } from '../screens/HomeScreen';
import { PlotsScreen } from '../screens/PlotsScreen';
import { MoneyScreen } from '../screens/MoneyScreen';
import { MoreScreen } from '../screens/MoreScreen';
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

  return (
    <>
      <Tab.Navigator
        screenOptions={{ headerShown: false }}
        tabBar={(props) => <TabBar {...props} onCapturePress={() => setCaptureOpen(true)} />}
      >
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
          component={MoreScreen}
          options={{
            title: t('nav.more'),
            tabBarIcon: ({ color, size }) => <Ellipsis size={size} strokeWidth={2} color={color} />,
          }}
        />
      </Tab.Navigator>
      <CaptureSheet visible={captureOpen} onClose={() => setCaptureOpen(false)} />
    </>
  );
}
