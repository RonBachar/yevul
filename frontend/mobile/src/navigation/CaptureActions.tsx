import { createContext, useContext, type ReactNode } from 'react';

// שלוש פעולות הרישום, זמינות לכל מסך בתוך הניווט.
//
// הגיליונות עצמם (הוצאה, משימה, יומן) יושבים ב-RootTabs, כי הם מוצגים
// מעל כל הניווט ולא מתוך מסך מסוים. מסך הבית צריך לפתוח את אותם
// גיליונות בדיוק דרך קיצורי הדרך שלו, ואין לו דרך לקבל אותם כ-props:
// React Navigation מקבל את המסך כ-`component`, ולעטוף אותו בפונקציה
// היה בונה רכיב חדש בכל רינדור ומאתחל את המסך מחדש.
//
// הקונטקסט הוא הדרך הנכונה כאן, ולא הרמה של ה-state למטה: הוא נותן
// למסכים גישה לפעולות בלי לשנות את מבנה הניווט ובלי לגרום ל-remount.
export type CaptureActions = {
  openExpense: () => void;
  openTask: () => void;
  openJournal: () => void;
};

const CaptureActionsContext = createContext<CaptureActions | null>(null);

export function CaptureActionsProvider({
  value,
  children,
}: {
  value: CaptureActions;
  children: ReactNode;
}) {
  return <CaptureActionsContext.Provider value={value}>{children}</CaptureActionsContext.Provider>;
}

// זורק ולא מחזיר null בשקט. מסך שקורא לזה מחוץ לניווט הוא באג בהרכבה,
// וכפתור שלא עושה כלום קשה בהרבה לאתר מהודעת שגיאה ברורה.
export function useCaptureActions(): CaptureActions {
  const value = useContext(CaptureActionsContext);
  if (!value) throw new Error('useCaptureActions must be used inside CaptureActionsProvider');
  return value;
}
