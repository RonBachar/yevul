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
  // The chrome of a stepped walk: the counter over each question, the button
  // that accepts a typed answer, and the button that moves on. **No screen
  // prefix**, for the reason the calendar words below carry none -- they belong
  // to the tile pattern rather than to one flow, and the plot walk is the second
  // flow to need them. The spray walk still reads its own spray.stepOf and
  // spray.confirm; folding those two into these is a one-line change to make
  // the next time that screen is opened.
  'common.stepOf': 'מתוך',
  'common.confirm': 'אישור',
  'common.continue': 'המשך',

  // The calendar, packages/shared/src/calendar.ts. **No screen prefix, on
  // purpose.** These are the words "today", "yesterday" and "the day before"
  // plus the names of the days of the week, and they are the same in the
  // expense sheet, the journal, the spray walk and the voice confirmation. The
  // spray. prefix these three used to carry made them the property of one
  // screen, and the moment the expense sheet wanted them there would have been
  // a second copy.
  'date.today': 'היום',
  'date.yesterday': 'אתמול',
  'date.dayBefore': 'שלשום',
  'date.other': 'תאריך אחר',
  'date.notSet': 'לא נבחר',
  'date.previousMonth': 'חודש קודם',
  'date.nextMonth': 'חודש הבא',
  // Back to the current month from anywhere in the calendar. This is what
  // stops a farmer who has paged backwards from being stranded without knowing
  // where he is.
  'date.backToToday': 'חזרה להיום',
  // One letter per column, as on every printed Hebrew calendar. Not derived
  // from toLocaleDateString: he-IL returns "יום א׳" there, which is not a
  // column heading.
  'date.weekday.sunday': 'א',
  'date.weekday.monday': 'ב',
  'date.weekday.tuesday': 'ג',
  'date.weekday.wednesday': 'ד',
  'date.weekday.thursday': 'ה',
  'date.weekday.friday': 'ו',
  'date.weekday.saturday': 'ש',

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
  // The long press straight to the microphone, design.md, Capture Tab & Sheet.
  // **Still the spec, not yet the app.** POST /ai/voice needs a kind, so the
  // shortcut that skips the sheet and lets the model choose the form cannot be
  // built until the endpoint can. Kept here rather than deleted because the day
  // it can be built, this is the sentence; CaptureSheet shows
  // capture.voiceScanHint instead while the microphone and the camera live on
  // the rows.
  'capture.micHint': 'לחיצה ארוכה על הכפתור פותחת ישר את המיקרופון',
  // The caption under the three rows once the Worker is configured. It names
  // both shortcuts because both are on the rows and neither is discoverable: the
  // microphone on all three, the camera on the expense row only, since a receipt
  // is an expense and nothing else. prd.md line 15 lists the three ways to
  // record — typing, speaking, photographing a receipt — and this line is where
  // the second and third are taught.
  'capture.voiceScanHint': 'אפשר גם לדבר, ובהוצאה גם לצלם קבלה',
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

  // אחראי חלקה, שלב 6, שיתוף המשק. prd.md סעיף 11: "לכל חלקה אפשר
  // להגדיר אחראי". הבורר מופיע רק ל-owner/manager וכשיש חברי משק
  // שאפשר להציב, ולכן נעלם לגמרי במשק של אדם אחד (design.md, Sharing:
  // "invisible at a member count of one").
  'plots.responsible.label': 'אחראי החלקה',
  'plots.responsible.none': 'ללא אחראי',
  'plots.responsible.saveError': 'לא הצלחנו לשמור את האחראי, נסו שוב',

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

  // The plot walk, one question per screen. Questions and not field labels:
  // the squares under them are the answer, so the title has to be the thing
  // being asked. See packages/shared/src/plotForm.ts.
  'plots.form.step.name': 'איך קוראים לחלקה?',
  'plots.form.step.area': 'מה גודל החלקה?',
  'plots.form.step.areaUnit': 'באילו יחידות מודדים?',
  'plots.form.step.crop': 'מה גדל בחלקה?',
  'plots.form.step.review': 'בדקו ושמרו',
  'plots.form.addCrop': 'גידול חדש',
  // The first run on a brand new farm: the crop grid is empty, and this is the
  // sentence that stops "no squares plus one dashed square" from reading as a
  // broken screen.
  'plots.form.emptyCrops': 'עדיין לא רשמתם גידולים. הוסיפו את הראשון והוא יופיע כאן בפעם הבאה.',
  // plots.area is nullable and always was, so walking past the question has to
  // be an option on the screen rather than an empty box the farmer guesses at.
  'plots.form.skipArea': 'בלי שטח',
  'plots.form.notSet': 'לא הוזן',
  'plots.form.areaInvalid': 'השטח חייב להיות מספר, למשל 40',

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
  // המשויך למשימה, שלב 6, שיתוף המשק. prd.md סעיף 11: "לכל משימה למי
  // היא מיועדת". הבורר מופיע רק כשיש במשק חברים שאפשר להציב, ונעלם
  // במשק של אדם אחד. "לא משויך" הוא ברירת המחדל.
  'tasks.form.assignee': 'אחראי',
  'tasks.form.assigneeNone': 'לא משויך',
  // תווית נגישות לאווטאר החבר בשורת המשימה, design.md, Member Avatar.
  'tasks.assignedTo': 'משויך ל',
  'tasks.form.due': 'תאריך יעד',
  'tasks.form.dueSomeday': 'מתישהו',
  'tasks.form.dueWeek': 'השבוע',
  'tasks.form.dueDate': 'עד תאריך',
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
  'log.form.note': 'הערה',
  'log.form.notePlaceholder': 'הערה קצרה, לא חובה',
  'log.form.sprayPest': 'מזיק או סיבה',
  'log.form.sprayPestPlaceholder': 'למשל, כנימה',
  'log.form.sprayMaterial': 'חומר',
  'log.form.sprayMaterialPlaceholder': 'למשל, קונפידור',
  'log.form.sprayDose': 'מינון',
  'log.form.sprayPhiDays': 'ימי המתנה עד קטיף',
  'log.form.sprayCost': 'עלות',
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
  // Its own label rather than a reuse of log.new. That key says "new record",
  // which is true of any of the ten types; this button opens the sheet already
  // set to spray, and a farmer looking at an empty spray log is exactly the
  // person who needs to be told that this is where a spray gets written.
  'sprayLog.new': 'ריסוס חדש',
  'sprayLog.allPlots': 'כל החלקות',
  'sprayLog.empty': 'אין עדיין רישומי ריסוס',
  'sprayLog.loadError': 'לא הצלחנו לטעון את יומן הריסוס, נסו שוב',
  'sprayLog.phiDaysSuffix': 'ימי המתנה',

  // רישום ריסוס במשבצות, שאלה אחת בכל מסך. הכותרות מנוסחות כשאלה ולא
  // כשם שדה: מסך שלם שמציג "מזיק" ותשע משבצות הוא טופס, מסך ששואל "נגד
  // מה ריססתם?" הוא שיחה, וזה מה שהסקיצה של היזם מתארת.
  'spray.step.pest': 'נגד מה ריססתם?',
  'spray.step.material': 'באיזה חומר?',
  'spray.step.cost': 'כמה זה עלה?',
  'spray.step.dose': 'איזה מינון?',
  'spray.step.phiDays': 'כמה ימי המתנה עד קטיף?',
  'spray.step.plot': 'איזו חלקה?',
  'spray.step.date': 'מתי ריססתם?',
  'spray.step.review': 'בדקו ושמרו',
  // "3 מתוך 5". הרכבה ולא אינטרפולציה, כמו "12 ריסוסים" במסך יומן
  // הריסוס, כי במילון הזה אין עדיין מנגנון החלפת ערכים בתוך מחרוזת.
  'spray.stepOf': 'מתוך',
  'spray.back': 'חזרה',
  'spray.addPest': 'מזיק חדש',
  'spray.addMaterial': 'חומר חדש',
  'spray.addDose': 'מינון אחר',
  'spray.addPhiDays': 'מספר אחר',
  'spray.skipDose': 'בלי מינון',
  // "לא ידוע" ולא "בלי המתנה". אלה שני דברים שונים: חומר שמותר לקטוף
  // אחריו מיד הוא 0 ימים, וחקלאי שלא יודע כמה להמתין הוא היעדר נתון.
  // ההבדל הזה הוא בדיוק מה ש-safeHarvestDate מחזיר עליו null.
  'spray.unknownPhiDays': 'לא ידוע',
  'spray.daysSuffix': 'ימים',
  'spray.confirm': 'אישור',
  'spray.notSet': 'לא הוזן',
  'spray.emptyPests': 'עדיין לא רשמתם מזיקים. הוסיפו את הראשון והוא יופיע כאן בפעם הבאה.',
  'spray.emptyMaterials': 'עדיין לא רשמתם חומרים. הוסיפו את הראשון והוא יופיע כאן בפעם הבאה.',
  'spray.emptyDoses': 'עדיין לא רשמתם מינונים. הוסיפו מינון, או המשיכו בלי מינון.',
  'spray.newTitle': 'ריסוס חדש',
  'spray.editTitle': 'עריכת ריסוס',
  'spray.save': 'שמירת הריסוס',

  // The cost step. Quantity is per-spray and typed; the unit and price are
  // remembered per material and pre-filled; the total is computed but always
  // editable, and can be typed on its own with no quantity or price at all,
  // because the farmer is never forced through the formula (founder, 2026-09-04).
  'spray.unit.liter': 'ליטר',
  'spray.unit.kg': 'קילו',
  'spray.quantity': 'כמות',
  'spray.quantityPlaceholder': 'כמה השתמשתם',
  'spray.unitLabel': 'יחידה',
  'spray.unitPrice': 'מחיר ליחידה',
  'spray.unitPricePerLiter': 'מחיר לליטר',
  'spray.unitPricePerKg': 'מחיר לקילו',
  'spray.unitPricePlaceholder': 'מחיר',
  'spray.cost': 'עלות',
  'spray.costPlaceholder': 'סכום',
  'spray.costComputed': 'מחושב אוטומטית, אפשר לשנות',
  'spray.costHint': 'אפשר גם פשוט להקליד את הסכום',
  'spray.skipCost': 'בלי עלות',

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

  // The one field on the expense sheet that became a grid of squares, out of
  // the farm's own history. A question over the grid and not a field label,
  // exactly like the spray and plot walks ask theirs. The empty sentence is the
  // first run: a brand new farm has spent nothing yet, so the grid is empty, and
  // this is what stops it from reading as a broken screen.
  'expense.form.step.name': 'על מה ההוצאה?',
  'expense.form.addName': 'שם חדש',
  'expense.form.emptyNames': 'עדיין לא רשמתם הוצאות. הוסיפו את הראשונה והיא תופיע כאן בפעם הבאה.',
  'expense.form.date': 'תאריך',
  'expense.form.note': 'הערה',
  'expense.form.notePlaceholder': 'הערה קצרה, לא חובה',
  'expense.form.forbidden': 'אין לכם הרשאה ליצור או לערוך הוצאות',
  'expense.form.saveError': 'לא הצלחנו לשמור, נסו שוב',

  // Deleting an expense. Founder's report 2026-09-02: a mistyped expense has to
  // be removable. Same two words the task row already uses, because it is the
  // same button in the same place, and the same confirmation question with the
  // noun swapped.
  'expense.action.delete': 'מחיקה',
  'expense.action.cancel': 'ביטול',
  'expense.deleteConfirmTitle': 'למחוק את ההוצאה?',
  'expense.save': 'שמירה',
  'expense.saving': 'שומר',
  'expense.form.receipt': 'קבלה',
  'expense.form.receiptAdd': 'צרף קבלה',
  'expense.form.receiptAttached': 'קבלה מצורפת',
  'expense.form.receiptReplace': 'החלף קבלה',
  'expense.form.receiptUploading': 'מעלה קבלה',
  'expense.form.receiptError': 'העלאת הקבלה נכשלה',

  // Opening a filed receipt. **The sheet could offer to replace a document it
  // would never show**, and prd.md section 9 is that the document itself is the
  // point: "רואה החשבון צריך את המסמך עצמו, לא רק את המספר".
  'expense.form.receiptView': 'צפייה בקבלה',
  'expense.receipt.title': 'הקבלה',
  'expense.receipt.loading': 'טוען את הקבלה',
  // **Separate from the sentence below, because they are separate facts.** This
  // one means the document may be sitting safely in storage and we could not
  // reach it, so trying again is worth something.
  'expense.receipt.loadError': 'לא הצלחנו להציג את הקבלה',
  // And this one means there is nothing to show. Telling a farmer his receipt is
  // gone when it is not would be worse than any error message.
  'expense.receipt.missing': 'אין קבלה מצורפת להוצאה הזו',
  'expense.receipt.retry': 'נסו שוב',
  'expense.receipt.back': 'חזרה להוצאה',
  // A PDF invoice, which arrives from the web upload and cannot be drawn by an
  // image view. On the phone it opens in the browser, which does know how.
  'expense.receipt.pdf': 'הקבלה שמורה כקובץ PDF',
  'expense.receipt.openFile': 'פתיחת הקובץ',
  'expense.receipt.openTab': 'פתיחה בחלון חדש',
  'expense.receipt.openFailed': 'לא הצלחנו לפתוח את הקובץ',
  // The image reached the device and the device could not draw it — a HEIC out
  // of an iPhone gallery is the realistic case. The file is fine; this viewer is
  // not the thing that can show it.
  'expense.receipt.imageFailed': 'לא הצלחנו להציג את הקובץ הזה כאן',

  // Voice capture, stage 5. **One sentence per next step in VoiceNextStep**
  // (packages/shared/src/voiceClient.ts), not one per reason code the endpoint
  // can send. The farmer does not need to know whether the model answered
  // nonsense or did not answer at all; he needs to know whether to record
  // again, wait, or give up for this month. No error codes and no jargon: this
  // is read at arm's length on a phone in the sun.
  //
  // fixRecording is the only step with two sentences, because "we heard
  // nothing" and "that was too long" send him in opposite directions.
  'voice.error.retryNow': 'לא הצלחנו להתחבר כרגע. נסו שוב עוד רגע.',
  'voice.error.recordAgain': 'לא הבנו את ההקלטה. נסו להקליט שוב, לאט וברור.',
  // "you can keep writing it in by hand" is part of the sentence and not a
  // nicety. Without it, running out of recordings reads as the app being locked
  // until next month, when in fact every manual form still works.
  'voice.error.outOfRecordings': 'נגמרו ההקלטות לחודש הזה. אפשר להמשיך לרשום ידנית.',
  'voice.error.noSound': 'לא שמענו כלום. קרבו את הטלפון לפה ונסו שוב.',
  'voice.error.tooLong': 'ההקלטה ארוכה מדי. נסו שוב, במשפט קצר.',
  'voice.error.signIn': 'צריך להתחבר שוב כדי לרשום בקול.',
  // "it is not your fault" stays in explicitly. A farmer who gets an error
  // right after speaking to the device assumes he did something wrong, and
  // stops using voice at all.
  'voice.error.ourBug': 'משהו אצלנו לא עבד. זו לא אשמתכם, נסו שוב מאוחר יותר.',

  // The recording panel itself, stage 5. Everything above this line is a
  // failure; everything below it is the farmer being told what is happening
  // right now, which is a different job and a different tone. No sentence here
  // is longer than a breath, because they are read while he is holding a button
  // down and about to speak.
  'capture.voice': 'רישום בקול',
  // The instruction, and the only place the press-and-hold gesture is taught.
  // Both halves are needed: a farmer who presses and lets go immediately
  // records nothing, and one who never lets go never sends anything.
  'voice.hold': 'לחצו והחזיקו כדי לדבר, שחררו כשסיימתם',
  'voice.recording': 'מקליט',
  // design.md, Loading State, Voice Processing, word for word.
  'voice.processing': 'מעבד...',
  // The coaching line, design.md, Mic Capture Button. Three fields per kind,
  // said before the sentence rather than corrected after it, because the
  // single-item extraction rule needs him to say one thing with its fields.
  'voice.prompt.expense': 'אמרו: מה, כמה, לאיזו חלקה',
  'voice.prompt.task': 'אמרו: מה צריך לעשות, לאיזו חלקה, מתי',
  'voice.prompt.journal': 'אמרו: מה עשיתי, באיזו חלקה, מתי',
  'voice.heard': 'שמענו',
  'voice.again': 'הקלטה חדשה',
  'voice.back': 'חזרה',
  'voice.permissionAsking': 'מבקשים גישה למיקרופון',
  // The way back for a farmer who said "don't allow" once. Without this the
  // button would be dead forever with no explanation, since the phone will
  // never show him the prompt again.
  'voice.permissionBlocked': 'אין לאפליקציה גישה למיקרופון. אפשר לאשר אותה בהגדרות הטלפון.',
  'voice.openSettings': 'פתיחת ההגדרות',
  // Shown when the two minute cap cut him off. It is not an error, it is an
  // explanation: the recording was sent, and he needs to know why it ended
  // without him letting go.
  'voice.stoppedAtLimit': 'עצרנו את ההקלטה אחרי שתי דקות, ושלחנו מה שהוקלט.',

  // The confirmation checkpoint, stage 5 step 9. design.md, Voice / OCR
  // Confirmation Sheet: prd.md section 3, "always confirm, never guess".
  //
  // **The heading says what the screen is, and it is not "success".** The
  // recording worked; whether the record is right is the question being asked,
  // and a farmer who reads "saved" here will stop reading the fields.
  'voice.confirm.heading': 'זה מה שהבנו',
  // design.md names this button word for word.
  'voice.confirm.confirm': 'אישור',
  'voice.confirm.saving': 'שומר...',
  'voice.confirm.plot': 'חלקה',
  // Two plots normalise to the same spoken name, so the sheet asks instead of
  // picking. prd.md section 8: no guessing which figure belongs to which plot.
  'voice.confirm.plotAsk': 'לא ברור לאיזו חלקה. בחרו אחת:',
  // He named a plot and no plot has that name. Said out loud rather than
  // swallowed, because the alternative is a name that disappears between what
  // he said and what he confirmed.
  'voice.confirm.plotUnknown': 'לא מצאנו חלקה בשם שאמרתם. הרישום יישמר בלי חלקה.',
  // The "there are more expenses" flag, prd.md section 8: one recording, one
  // expense. Shown on the confirmation screen, before he confirms, so the item
  // in front of him is understood to be the first of several and not all of
  // them.
  'voice.confirm.moreItems': 'שמענו עוד הוצאות. רושמים אחת בכל פעם.',
  'voice.confirm.saved': 'נשמר',
  // The one-at-a-time affordance, after the first one is in.
  'voice.confirm.savedMore': 'נשמר. אפשר להקליט עכשיו את ההוצאה הבאה.',
  // **"what you recorded is still here" is the whole point of the sentence.**
  // He has just spent one of ten monthly recordings, and a failed save that
  // reads like a dead end would send him back to the microphone to spend a
  // second one on the same expense.
  'voice.confirm.saveError': 'לא הצלחנו לשמור. מה שהקלטתם נשאר כאן, אפשר לאשר שוב.',
  'voice.confirm.forbidden': 'אין לכם הרשאה לשמור את הרישום הזה.',
  'voice.confirm.dateInvalid': 'יש להזין יום וחודש',
  'voice.confirm.phiInvalid': 'ימי ההמתנה צריכים להיות מספר',
  // A spray with no pest or no material cannot be written at all (see
  // sprayValidationError in logEntries.ts), and the sheet holds a ceiling of
  // two edit boxes, so the way out is to say the missing half again.
  'voice.confirm.sprayPestMissing': 'לא הבנו נגד איזה מזיק ריססתם. הקליטו שוב ואמרו את שם המזיק.',
  'voice.confirm.sprayMaterialMissing': 'לא הבנו באיזה חומר ריססתם. הקליטו שוב ואמרו את שם החומר.',

  // Receipt scanning, stage 5 step 11. **Same rule as the voice block above:
  // one sentence per next step in ReceiptNextStep, not one per reason code.**
  //
  // Two of the seven steps are missing from this list on purpose:
  // RECEIPT_MESSAGE_KEYS points retryNow and ourBug at voice.error.retryNow and
  // voice.error.ourBug, because "we could not connect just now" and "something
  // broke at our end, it is not your fault" say the identical thing whether he
  // spoke or photographed. Every other sentence names either the recording or
  // the camera, so every other sentence is its own.
  'receipt.error.photographAgain': 'לא הצלחנו לקרוא את הקבלה. צלמו שוב, ישר מלמעלה ובאור טוב.',
  // **The only error in the product that is not an error.** Nothing broke:
  // receipts are a paid feature in full (prd.md section 9), and this farm is on
  // the free tier. No upgrade button goes with it, because the plans screen is
  // stage 7 and a button that leads nowhere is worse than a sentence. What is
  // offered instead is the thing that always works and costs nothing.
  'receipt.error.paidPlan': 'סריקת קבלות זמינה במסלול בתשלום. אפשר לרשום את ההוצאה ידנית.',
  'receipt.error.outOfScans': 'נגמרו הסריקות לחודש הזה. אפשר לרשום את ההוצאה ידנית.',
  'receipt.error.noPhoto': 'לא קיבלנו תמונה. נסו לצלם שוב.',
  // **"photograph it instead of picking it" is the actionable half.** The camera
  // path compresses, an original file out of the gallery does not, so this is
  // the one thing he can do that changes the outcome. Client-side compression is
  // the next roadmap item; when it lands, this sentence should be revisited.
  'receipt.error.tooLarge': 'התמונה כבדה מדי לשליחה. נסו לצלם את הקבלה במקום לבחור מהגלריה.',
  // A PDF invoice or an iPhone HEIC. Both are things a farmer really holds and
  // both are stored happily as an attachment; only the scanner cannot read them.
  'receipt.error.unsupportedFile': 'לא הצלחנו לקרוא את הקובץ הזה. צלמו את הקבלה במצלמה ונסו שוב.',
  'receipt.error.signIn': 'צריך להתחבר שוב כדי לסרוק קבלות.',

  // The capture panel. voice.back, voice.openSettings, voice.confirm.saved and
  // expense.form.receiptUploading are reused as they are — they say the same
  // thing on this route and a second Hebrew string with the same meaning is a
  // second string to keep in step.
  'capture.receipt': 'צילום קבלה',
  'receipt.hint': 'צלמו את הקבלה, ואנחנו נמלא את הספק, הסכום והתאריך',
  'receipt.takePhoto': 'צילום קבלה',
  'receipt.fromGallery': 'בחירה מהגלריה',
  // Not the generic "מעבד..." the microphone shows. He is looking at a
  // photograph of a receipt, so saying what is being read to him is both more
  // honest and more reassuring than saying the phone is busy.
  'receipt.reading': 'קורא את הקבלה...',
  'receipt.again': 'צילום חדש',
  'receipt.cameraBlocked': 'אין לאפליקציה גישה למצלמה. אפשר לאשר אותה בהגדרות הטלפון.',
  // The mirror of voice.confirm.saveError, and the same promise: the scan he
  // paid for is still on screen, so a failed save does not send him back to the
  // camera to spend a second one on the same receipt.
  'receipt.confirm.saveError': 'לא הצלחנו לשמור. מה שקראנו מהקבלה נשאר כאן, אפשר לאשר שוב.',
  // **The expense is in and the photograph is not**, which is a real state and
  // not a failure to hide: prd.md section 9 is that the accountant needs the
  // document and not only the number, so a farmer who is told "saved" while the
  // document was dropped has been lied to about the half that matters.
  'receipt.attachFailed': 'ההוצאה נשמרה, אבל תמונת הקבלה לא נשמרה.',
  'receipt.attachRetry': 'צירוף התמונה שוב',
};

// מחזיר את המחרוזת לפי המפתח, ואם אין, מחזיר את המפתח עצמו כדי
// שחוסר יהיה גלוי בפיתוח ולא ייפול בשקט.
export function t(key: string): string {
  return strings[key] ?? key;
}
