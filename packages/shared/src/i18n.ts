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
};

// מחזיר את המחרוזת לפי המפתח, ואם אין, מחזיר את המפתח עצמו כדי
// שחוסר יהיה גלוי בפיתוח ולא ייפול בשקט.
export function t(key: string): string {
  return strings[key] ?? key;
}
