import type { Plot } from './plots';
import type { Task } from './tasks';

// מתג "החלקות שלי", שלב 6, שיתוף המשק. design.md, "My Plots" Toggle,
// ו-prd.md סעיף 11: "במסך הבית יש מתג של החלקות שלי. זו תצוגה ולא
// חסימה". בקרה מגזרית בראש מסך הבית, הכל / שלי, שמסננת יחד את כרטיסי
// החלקות ואת לוח המשימות לחלקות שהמשתמש המחובר אחראי עליהן.
//
// כאן יושבות רק ההחלטות הטהורות (מתי המתג נראה, מהן החלקות "שלי",
// ואיך מצטמצם לוח המשימות), כי לשני הלקוחות אין מריץ טסטים. הרכיבים
// מחזיקים רק את הצביעה של הבקרה ואת מצבה בזיכרון.
//
// **זהו מסנן תצוגה ולא הרשאה, ולעולם לא נשמר.** design.md מפורש: אין
// לעצב אותו כמנעול, ובכל פתיחה קרה הוא חוזר ל"הכל". לכן אין כאן קריאה
// או כתיבה לאחסון, והמצב חי כ-state של רכיב בלבד.

// המתג מוצג רק כשיש במשק יותר מחבר אחד **וגם** לפחות לחלקה אחת מוגדר
// אחראי. משק של אדם אחד לא מציג שום אמצעי צוות, ומשק רב-חברים שעדיין
// לא שייך אף חלקה אין לפי מה לסנן בו. design.md: "visible only when
// the farm has more than one member and at least one plot has a
// responsible member set".
export function myPlotsToggleVisible(
  memberCount: number,
  plots: Pick<Plot, 'responsibleUserId'>[],
): boolean {
  return memberCount > 1 && plots.some((plot) => plot.responsibleUserId != null);
}

// מזהי החלקות שהמשתמש המחובר אחראי עליהן. currentUserId ריק (התפקיד
// או הרוסטר עדיין נטענים, או שאין משתמש) מחזיר קבוצה ריקה, שהרכיבים
// קוראים כ"עדיין אין חלקות שלי" ולא כ"כל החלקות".
export function myPlotIds(
  plots: Pick<Plot, 'id' | 'responsibleUserId'>[],
  currentUserId: string | null,
): string[] {
  if (!currentUserId) return [];
  return plots.filter((plot) => plot.responsibleUserId === currentUserId).map((plot) => plot.id);
}

// צמצום לוח המשימות של הבית לקבוצת חלקות, הצד ה"שלי" של המתג.
// plotIds ריק (undefined) הוא "בלי סינון", וכך נשארים גם תצוגת "הכל"
// וגם מסלול החלקה היחידה (plotId) של TaskBoard בלי שינוי. מערך ריק
// הוא סינון לכלום, כי "החלקות שלי" באמת ריקות. משימה בלי חלקה (plot_id
// הוא null) היא כלל-משקית ואינה שייכת לאף חלקה "שלי", ולכן נושרת
// מהתצוגה המסוננת.
export function tasksOnPlots(tasks: Task[], plotIds: string[] | undefined): Task[] {
  if (!plotIds) return tasks;
  const set = new Set(plotIds);
  return tasks.filter((task) => task.plotId != null && set.has(task.plotId));
}
