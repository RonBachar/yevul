// שכבת תרגום מחרוזות, זרע מינימלי. אחת משבע ההחלטות שאסור להתפשר
// עליהן: כל מחרוזת בממשק עוברת דרך t(), גם כשההשקה בעברית בלבד, כדי
// שהוספת שפה בעתיד תהיה עבודה של שבועות ולא של חודשים.
//
// בכוונה מינימלי בשלב הזה: מילון שטוח עברי בלבד, בלי אינטרפולציה,
// בלי ריבוי (plural), ובלי מנגנון החלפת שפה, כי אין עדיין קורא שני
// לשפה נוספת. מנגנון ההחלפה נוסף בשלב 8 כשבאמת יש שפה שנייה. קוד טהור
// בלי תלות בסביבה, כדי שיעבוד זהה בנייד, בווב, וב-Worker.

const strings: Record<string, string> = {
  'app.name': 'חקלאי רווחי',
  'auth.tagline': 'ניהול המשק לפי חלקה, לפי רווח והפסד',
  'auth.continueWithGoogle': 'המשיכו עם Google',
  'auth.continueWithApple': 'המשיכו עם Apple',
  'auth.legal': 'בהמשך אתם מאשרים את תנאי השימוש ומדיניות הפרטיות',
  'auth.error': 'ההתחברות נכשלה, נסו שוב',
  'app.fontError': 'טעינת הגופנים נכשלה. סגרו את האפליקציה ופתחו אותה מחדש.',
  'common.loading': 'טוען',
  // placeholder גנרי לשדה מספרי. שדה מספר ריק בלי רמז נראה כמו שדה
  // מושבת, וזו הייתה ההתנהגות בשדות השטח, היבול, המחיר והעלות.
  'common.numberPlaceholder': 'הזן מספר',
  'common.optional': 'לא חובה',
  'common.other': 'אחר',
  'shell.signedInAs': 'מחוברים בתור',
  'shell.signOut': 'התנתקות',
  'shell.signOutError': 'ההתנתקות נכשלה, נסו שוב',

  // ניווט ראשי, ארבעה טאבים וכפתור רישום מרכזי, design.md, Bottom Tab Bar
  'nav.home': 'בית',
  'nav.plots': 'חלקות',
  'nav.money': 'כסף',
  'nav.more': 'עוד',
  'nav.capture': 'רישום',

  // גיליון הרישום, design.md, Capture Tab & Sheet
  'capture.expense': 'הוצאה',
  'capture.expenseHint': 'סכום, קטגוריה, חלקה',
  'capture.task': 'משימה',
  'capture.taskHint': 'מה צריך לעשות',
  'capture.journal': 'יומן',
  'capture.journalHint': 'מה עשיתי, כולל ריסוס',
  'capture.micHint': 'לחיצה ארוכה על הכפתור פותחת ישר את המיקרופון',
  'capture.close': 'סגירה',

  // ניווט הווב. קבוצה נפרדת מ-nav.* בכוונה, כי היעדים לא זהים לנייד.
  // לפי prd.md סעיף 12, קול, סבב וצילום מהיר הם נייד בלבד, ולכן אין
  // בווב כפתור רישום מרכזי.
  'web.nav.home': 'בית',
  'web.nav.plots': 'חלקות',
  'web.nav.money': 'כסף',
  'web.nav.journal': 'יומן',
  'web.nav.settings': 'הגדרות',
  'web.nav.sectionMain': 'ניהול',
  'web.skipToContent': 'דילוג לתוכן',

  'screen.home': 'בית',
  'screen.plots': 'חלקות',
  'screen.money': 'כסף',
  'screen.more': 'עוד',
  'screen.journal': 'יומן',
  'screen.settings': 'הגדרות',
  'screen.comingSoon': 'המסך הזה ייבנה בשלב הבא לפי הרודמאפ.',

  // מסך הגדרות
  'settings.farmName': 'שם המשק',
  'settings.farmNamePlaceholder': 'למשל, המשק של דוד',
  'settings.currency': 'מטבע',
  'settings.areaUnit': 'יחידת שטח',
  'settings.locale': 'שפה',
  'settings.save': 'שמירה',
  'settings.saving': 'שומר',
  'settings.saved': 'ההגדרות נשמרו',
  'settings.loadError': 'לא הצלחנו לטעון את ההגדרות, נסו שוב',
  'settings.saveError': 'לא הצלחנו לשמור, נסו שוב',
  // נדחה על ידי השרת, לא על ידי המסך. RLS מתיר עריכה ל-owner ול-manager
  // בלבד, והלקוח רק מדווח על התוצאה ולא מחליט אותה מראש.
  'settings.forbidden': 'אין לכם הרשאה לשנות את הגדרות המשק',
  'settings.nameRequired': 'שם המשק לא יכול להיות ריק',

  'settings.currency.ILS': 'שקל חדש (₪)',
  'settings.currency.USD': 'דולר אמריקאי ($)',
  'settings.currency.EUR': 'אירו (€)',
  'settings.areaUnit.dunam': 'דונם',
  'settings.areaUnit.hectare': 'הקטאר',
  'settings.areaUnit.acre': 'אקר',
  'settings.locale.he': 'עברית',

  // רשימת חלקות
  'plots.new': 'חלקה חדשה',
  'plots.empty': 'עדיין אין חלקות. מוסיפים את הראשונה?',
  'plots.loadError': 'לא הצלחנו לטעון את החלקות, נסו שוב',
  'plots.noCrop': 'עדיין אין גידול מוגדר',
  'plots.seasonPrefix': 'עונה',

  // מסך פרטי חלקה
  'plots.detail.back': 'חזרה',
  'plots.detail.edit': 'עריכת פרטי החלקה',
  'plots.detail.loadError': 'לא הצלחנו לטעון את החלקה',
  // טאב "רווחיות" המאוחד פוצל להכנסות והוצאות, והסיכום עלה לכותרת
  // קבועה. הערת מוצר של עידו: הוא רוצה לראות את המספר בלי להיכנס לטאב,
  // ולהפריד בין שני צדי הכסף.
  'plots.tab.income': 'צפי הכנסה',
  'plots.tab.expenses': 'הוצאות',
  'plots.tab.tasks': 'משימות',
  'plots.tab.journal': 'יומן',

  // סיכום צפי הרווח בראש מסך החלקה
  'plots.profit.forecast': 'צפי רווח',
  'plots.profit.income': 'צפי הכנסה',
  'plots.profit.expenses': 'הוצאות',
  // Wheat ולא Loss-600. design.md: מצב שבו חסר מידע הוא תיקון, לא
  // הודעה על הפסד.
  'plots.profit.noExpensesYet': 'עדיין לא נרשמו הוצאות, המספר יתעדכן',

  // טאב רווחיות
  'plots.income.expected': 'הכנסה צפויה',
  'plots.crop.edit': 'עריכת גידול',
  'plots.crop.season': 'עונה',
  'plots.crop.seasonPlaceholder': 'למשל, 2026',
  'plots.crop.yieldUnit': 'יחידת יבול',
  // ההצעות הנפוצות ליחידת יבול, שתי משפחות המדידה שעידו תיאר: משקל
  // (ק"ג, טון) וספירה (יחידות, ארגזים). הן עוברות דרך t() ולא יושבות
  // כמחרוזות קשיחות, כי הערך שנבחר הוא גם הערך שנשמר ומוצג.
  'plots.crop.yieldUnitPreset.kg': 'ק"ג',
  'plots.crop.yieldUnitPreset.ton': 'טון',
  'plots.crop.yieldUnitPreset.units': 'יחידות',
  'plots.crop.yieldUnitPreset.crates': 'ארגזים',
  // שתי משפחות המדידה בדוגמה אחת, משקל וספירה, כדי שחקלאי שסופר פירות
  // יראה שגם זה ערך צפוי ולא ינסה להמיר לק"ג. עידו, בדיקת שדה.
  'plots.crop.yieldUnitPlaceholder': 'למשל, ק"ג, טון, יחידות, ארגזים',
  'plots.crop.yieldUnitUnset': 'לא הוגדרה',
  'plots.crop.nameRequired': 'שם הגידול לא יכול להיות ריק',
  'plots.crop.saved': 'פרטי הגידול נשמרו',
  'plots.crop.forbidden': 'אין לכם הרשאה לערוך את הגידול',
  'plots.crop.saveError': 'לא הצלחנו לשמור, נסו שוב',
  'plots.forecast.update': 'עדכון צפי',
  // התוויות בגיליון עצמו קצרות, והיחידה האמיתית ("ק״ג לדונם", "₪ לק״ג")
  // מורכבת מהנתונים ב-format.ts ומוצגת לצידן. התוויות הארוכות הישנות
  // השתמשו במילה "יחידה" בשתי משמעויות שונות באותו מסך.
  'plots.forecast.yield': 'יבול צפוי',
  'plots.forecast.price': 'מחיר משוער',
  'plots.forecast.per': 'ל',
  // "איך" ולא "באיזו יחידה", כי התשובה יכולה להיות משקל ("ק״ג") או
  // ספירה ("יחידות", "ארגזים"), ושתיהן לגיטימיות. עידו: נשירים נמדדים
  // במשקל לדונם, ופירות מסוימים נספרים.
  'plots.forecast.unitQuestion': 'איך מודדים את היבול?',
  'plots.forecast.total': 'סה"כ צפי',
  'plots.forecast.notSet': 'לא הוזן עדיין',
  'plots.forecast.saved': 'הצפי עודכן',
  'plots.forecast.forbidden': 'אין לכם הרשאה לעדכן את הצפי',
  'plots.forecast.saveError': 'לא הצלחנו לשמור, נסו שוב',
  'plots.save': 'שמירה',
  'plots.saving': 'שומר',

  // טופס יצירה ועריכה של חלקה
  'plots.form.titleNew': 'חלקה חדשה',
  'plots.form.titleEdit': 'עריכת חלקה',
  'plots.form.name': 'שם החלקה',
  'plots.form.namePlaceholder': 'למשל, החלקה הדרומית',
  'plots.form.area': 'שטח',
  'plots.form.areaPlaceholder': 'הזן מספר, למשל 40',
  'plots.form.cropName': 'שם הגידול',
  'plots.form.cropNamePlaceholder': 'למשל, זיתים, חיטה, אבטיחים',
  'plots.form.nameRequired': 'שם החלקה לא יכול להיות ריק',
  'plots.form.cropNameRequired': 'שם הגידול לא יכול להיות ריק',
  'plots.form.forbidden': 'אין לכם הרשאה ליצור או לערוך חלקות',
  'plots.form.saveError': 'לא הצלחנו לשמור, נסו שוב',

  // משימות, רשימה ולוח
  'tasks.new': 'משימה חדשה',
  'tasks.empty': 'אין משימות פתוחות',
  'tasks.loadError': 'לא הצלחנו לטעון את המשימות, נסו שוב',
  'tasks.plotGeneral': 'כללי',
  'tasks.group.overdue': 'באיחור',
  'tasks.group.today': 'היום',
  'tasks.group.week': 'השבוע',
  'tasks.group.someday': 'מתישהו',
  'tasks.due.today': 'היום',
  'tasks.due.tomorrow': 'מחר',
  'tasks.due.overduePrefix': 'באיחור',
  'tasks.due.inDaysPrefix': 'עוד',

  // שורת משימה, פעולות swipe/כפתור
  'tasks.action.complete': 'בוצע',
  'tasks.action.snooze': 'דחה שבוע',
  'tasks.action.undo': 'ביטול',
  'tasks.completedToast': 'סומן כבוצע',
  'tasks.snoozedToast': 'נדחה בשבוע',

  // גיליון יצירה/עריכה
  'tasks.form.titleNew': 'משימה חדשה',
  'tasks.form.titleEdit': 'עריכת משימה',
  'tasks.form.titlePlaceholder': 'מה צריך לעשות?',
  'tasks.form.titleRequired': 'כותרת המשימה לא יכולה להיות ריקה',
  'tasks.form.due': 'תאריך יעד',
  'tasks.form.dueSomeday': 'מתישהו',
  'tasks.form.dueWeek': 'השבוע',
  'tasks.form.dueDate': 'עד תאריך',
  'tasks.form.dueDay': 'יום',
  'tasks.form.dueMonth': 'חודש',
  'tasks.form.cost': 'עלות משוערת',
  'tasks.form.forbidden': 'אין לכם הרשאה ליצור או לערוך משימות',
  'tasks.form.saveError': 'לא הצלחנו לשמור, נסו שוב',
  'tasks.save': 'שמירה',
  'tasks.saving': 'שומר',
};

// מחזיר את המחרוזת לפי המפתח, ואם אין, מחזיר את המפתח עצמו כדי
// שחוסר יהיה גלוי בפיתוח ולא ייפול בשקט.
export function t(key: string): string {
  return strings[key] ?? key;
}
