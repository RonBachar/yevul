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
  // כפתור dev בלבד, מוצג רק כש-__DEV__/import.meta.env.DEV דלוקים,
  // לא מגיע לבילד release. נכנס כמשתמש הבדיקה מ-backend/supabase/seed.sql.
  'auth.devDemoLogin': 'כניסה כמשתמש בדיקה (dev)',
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
  // Completion Prompts, design.md: "Both toggles live in Settings and
  // can be turned off independently."
  'settings.journalPrompt': 'לשאול לפני שמירה ביומן בסיום משימה',
  'settings.expensePrompt': 'לשאול לפני רישום הוצאה בסיום משימה',
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

  // Live P&L Hero Card, מסך הבית, design.md. המילה "צפי" נושאת משקל
  // כאן בדיוק כמו בכותרת פרטי החלקה: המספר הוא הכנסה משוערת שהחקלאי
  // הקליד בעצמו פחות הוצאות אמיתיות, ואסור שייקרא כרווח שכבר קרה.
  'home.profit.forecast': 'צפי רווח',
  // מוצג כשיש הוצאות שלא שויכו לאף חלקה. בלי המשפט הזה, ההפרש בין
  // המספר הגדול לסכום כרטיסי החלקות שמתחתיו נראה כמו שגיאת חישוב.
  'home.profit.includesGeneral': 'כולל הוצאות כלליות שלא שויכו לחלקה',
  // חלקות שעדיין אין להן יבול ומחיר צפויים. ההוצאות שלהן נספרות, אבל
  // ההכנסה שלהן חסרה מהמספר, וזו הסתייגות שהחקלאי חייב לראות.
  'home.profit.someWithoutForecast': 'יש חלקות בלי צפי יבול, ההכנסה שלהן לא נספרת',

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
  // ייצוא דוחות, שלב 4, prd.md סעיף 10. כותרות העמודות בקבצי ה-CSV
  // עוברות דרך t() כמו כל מחרוזת אחרת, כי הקובץ נפתח אצל רואה חשבון
  // ובשפה שלו.
  'report.column.plot': 'חלקה',
  'report.column.crop': 'גידול',
  'report.column.season': 'עונה',
  'report.column.area': 'שטח',
  'report.column.expectedIncome': 'צפי הכנסה',
  'report.column.expenses': 'הוצאות',
  'report.column.profitForecast': 'צפי רווח',
  'report.column.date': 'תאריך',
  'report.column.expenseName': 'שם ההוצאה',
  'report.column.amount': 'סכום',
  'report.column.receipt': 'קבלה',
  'report.column.note': 'הערה',
  'report.column.type': 'סוג',
  'report.column.pest': 'מזיק',
  'report.column.material': 'חומר',
  'report.column.dose': 'מינון',
  'report.column.phiDays': 'ימי המתנה',
  'report.column.safeHarvest': 'בטוח לקטיף מ',
  'report.column.harvestQty': 'כמות יבול',
  // הוצאה שלא שויכה לאף חלקה. תווית מפורשת ולא תא ריק, כדי שרואה
  // החשבון יראה שזו הוצאה כללית ולא יחשוב שחסר נתון.
  'report.generalExpense': 'כללי, ללא חלקה',
  'report.yes': 'כן',
  'report.no': 'לא',
  // כפתורי הייצוא במסכים
  'report.exportProfitability': 'ייצוא דוח רווחיות',
  'report.exportExpenses': 'ייצוא הוצאות לרואה חשבון',
  'report.exportJournal': 'ייצוא יומן מלא',
  'report.exportSprayLog': 'ייצוא לרגולטור',
  'report.print': 'הדפסה או שמירה כ-PDF',
  'report.sectionTitle': 'דוחות וייצוא',
  'plots.forecast.update': 'עדכון צפי',
  // נודניק ההתיישנות, design.md, "Staleness nudge". שם החודש נכנס בין
  // שני החלקים (אין אינטרפולציה ב-t, ראה ראש הקובץ), אותה תבנית כמו
  // plots.seasonPrefix. שורת טקסט אחת, לא כרטיס ולא מודאל: זו בדיקה
  // עדינה על משהו שהחקלאי כבר הגדיר, לא דחיפה להגדיר משהו חדש.
  'plots.forecast.stalePrefix': 'לא עודכן מאז',
  'plots.forecast.staleSuffix': 'עדיין נכון?',
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
  'tasks.group.later': 'בהמשך',
  // "ללא תאריך" ולא "מתישהו" (כמו בצ'יפ הבחירה בגיליון), הערת מוצר:
  // ככותרת קבוצה על משימות שכבר קיימות "מתישהו" נשמע לא רציני. הצ'יפ
  // בגיליון היצירה/עריכה (tasks.form.dueSomeday) לא השתנה, שם זו בחירה
  // פעילה ולא תיאור של רשימה קיימת.
  'tasks.group.someday': 'ללא תאריך',
  'tasks.due.today': 'היום',
  'tasks.due.tomorrow': 'מחר',
  'tasks.due.overduePrefix': 'באיחור',
  'tasks.due.inDaysPrefix': 'עוד',

  // שורת משימה, פעולות swipe/כפתור
  'tasks.action.complete': 'בוצע',
  'tasks.action.delete': 'מחיקה',
  'tasks.deleteConfirmTitle': 'למחוק את המשימה?',
  'tasks.action.snooze': 'דחה שבוע',
  'tasks.action.undo': 'ביטול',
  'tasks.completedToast': 'סומן כבוצע',
  'tasks.deletedToast': 'המשימה נמחקה',
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

  // יומן, prd.md סעיף 8. עשרת סוגי הפעולה, בסדר LOG_ENTRY_TYPES
  // ב-packages/shared/src/logEntries.ts.
  'log.type.till': 'חריש',
  'log.type.sow': 'זריעה',
  'log.type.fertilize': 'דישון',
  'log.type.spray': 'ריסוס',
  'log.type.irrigate': 'השקיה',
  'log.type.prune': 'גיזום',
  'log.type.thin': 'דילול',
  'log.type.harvest': 'קטיף',
  'log.type.repair': 'תיקון',
  'log.type.other': 'אחר',

  'log.new': 'רישום חדש',
  'log.empty': 'עדיין אין רישומים ביומן',
  'log.loadError': 'לא הצלחנו לטעון את היומן, נסו שוב',
  // שתי התוויות למקור רשומה שאינו ידני, design.md, Log Row. רשומה
  // ידנית (המקור היחיד שהמסך הזה כותב) לא מציגה תווית מקור בכלל.
  'log.row.sourceVoice': 'נרשם בקול',
  'log.row.sourceTask': 'ממשימה שהסתיימה',

  // גיליון יצירה/עריכה, design.md, Log Entry Sheet
  'log.form.titleNew': 'רישום חדש',
  'log.form.titleEdit': 'עריכת רישום',
  'log.form.type': 'סוג',
  'log.form.date': 'תאריך',
  'log.form.dateDay': 'יום',
  'log.form.dateMonth': 'חודש',
  'log.form.note': 'הערה',
  'log.form.notePlaceholder': 'הערה קצרה, לא חובה',
  'log.form.sprayPest': 'מזיק או סיבה',
  'log.form.sprayPestPlaceholder': 'למשל, כנימה',
  'log.form.sprayMaterial': 'חומר',
  'log.form.sprayMaterialPlaceholder': 'למשל, קונפידור',
  'log.form.sprayDose': 'מינון',
  'log.form.sprayPhiDays': 'ימי המתנה עד קטיף',
  'log.form.harvestQty': 'כמות',
  'log.form.harvestUnit': 'יחידה',
  'log.form.harvestUnitPlaceholder': 'למשל, ק"ג',
  // "…" נשאר חלק מהמפתח, design.md כותב "בטוח לקטיף מ-…" בדיוק, התאריך
  // עצמו מתווסף אחרי המקף בקוד.
  'log.form.safeHarvestPrefix': 'בטוח לקטיף מ',
  'log.form.pestRequired': 'יש להזין נגד איזה מזיק ריססתם',
  'log.form.materialRequired': 'יש להזין באיזה חומר ריססתם',
  'log.form.forbidden': 'אין לכם הרשאה ליצור או לערוך רישומים ביומן',
  'log.form.saveError': 'לא הצלחנו לשמור, נסו שוב',
  'log.save': 'שמירה',
  'log.saving': 'שומר',

  // מסך יומן ריסוס, design.md "Spray Log Screen". prd.md סעיף 8: מסך
  // עצמאי, נגיש מהיומן הכללי, מפרטי חלקה, ומעוד/הגדרות. אותה כותרת
  // משמשת גם ככותרת המסך וגם כתווית הקישור אליו משלושת המקומות האלה.
  'sprayLog.title': 'יומן ריסוס',
  'sprayLog.countSuffix': 'ריסוסים',
  'sprayLog.allPlots': 'כל החלקות',
  'sprayLog.empty': 'אין עדיין רישומי ריסוס',
  'sprayLog.loadError': 'לא הצלחנו לטעון את יומן הריסוס, נסו שוב',
  'sprayLog.phiDaysSuffix': 'ימי המתנה',

  // Completion Prompts, design.md. שתי שאלות עצמאיות בסיום משימה.
  'completion.donePrefix': 'בוצע',
  'completion.saveToJournal': 'לשמור ביומן?',
  'completion.journalSaved': 'נשמר ביומן',
  'completion.recordAsExpense': 'לרשום כהוצאה?',
  'completion.yes': 'כן',
  'completion.no': 'לא',
  'completion.expenseAmount': 'סכום',
  'completion.expenseConfirm': 'אישור',
  'completion.expenseSaved': 'נרשם כהוצאה',
  'completion.declined': 'בסדר, לא נשמר',
  'completion.forbidden': 'אין לכם הרשאה לרשום הוצאות',
  'completion.error': 'לא הצלחנו לשמור, נסו שוב',

  // הוצאות, docs/roadmap.md. שלב ראשון בלבד: הקצאה יחידה, בלי פיצול,
  // בלי הוצאה קבועה חוזרת, בלי קבלה מצורפת. הטופס עצמו ארבעה שדות
  // בלבד לפי בקשה מפורשת של היזם: שם, סכום, תאריך, הערה, בלי קטגוריה
  // מתוכננת ובלי בחירת חלקה בטופס (החלקה מגיעה משתיקה מההקשר).
  'expense.new': 'הוצאה חדשה',
  'expense.empty': 'עדיין אין הוצאות',
  'expense.loadError': 'לא הצלחנו לטעון את ההוצאות, נסו שוב',
  'expense.row.unnamed': 'הוצאה',

  'expense.form.titleNew': 'הוצאה חדשה',
  'expense.form.titleEdit': 'עריכת הוצאה',
  'expense.form.amount': 'סכום',
  'expense.form.amountRequired': 'יש להזין סכום גדול מאפס',
  'expense.form.name': 'שם ההוצאה',
  'expense.form.namePlaceholder': 'למשל, דלק, דשן, תיקון משאבה',
  'expense.form.date': 'תאריך',
  'expense.form.dateDay': 'יום',
  'expense.form.dateMonth': 'חודש',
  'expense.form.note': 'הערה',
  'expense.form.notePlaceholder': 'הערה קצרה, לא חובה',
  'expense.form.forbidden': 'אין לכם הרשאה ליצור או לערוך הוצאות',
  'expense.form.saveError': 'לא הצלחנו לשמור, נסו שוב',
  'expense.save': 'שמירה',
  'expense.saving': 'שומר',
  'expense.form.receipt': 'קבלה',
  'expense.form.receiptAdd': 'צרף קבלה',
  'expense.form.receiptAttached': 'קבלה מצורפת',
  'expense.form.receiptReplace': 'החלף קבלה',
  'expense.form.receiptUploading': 'מעלה קבלה',
  'expense.form.receiptError': 'העלאת הקבלה נכשלה',
};

// מחזיר את המחרוזת לפי המפתח, ואם אין, מחזיר את המפתח עצמו כדי
// שחוסר יהיה גלוי בפיתוח ולא ייפול בשקט.
export function t(key: string): string {
  return strings[key] ?? key;
}
