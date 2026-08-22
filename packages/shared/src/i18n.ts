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
  'common.loading': 'טוען',
  'shell.signedInAs': 'מחוברים בתור',
  'shell.signOut': 'התנתקות',
  'shell.placeholder': 'המשק שלכם מוכן. המסכים ייבנו בשלבים הבאים.',

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

  'screen.home': 'בית',
  'screen.plots': 'חלקות',
  'screen.money': 'כסף',
  'screen.more': 'עוד',
  'screen.comingSoon': 'המסך הזה ייבנה בשלב הבא לפי הרודמאפ.',
};

// מחזיר את המחרוזת לפי המפתח, ואם אין, מחזיר את המפתח עצמו כדי
// שחוסר יהיה גלוי בפיתוח ולא ייפול בשקט.
export function t(key: string): string {
  return strings[key] ?? key;
}
