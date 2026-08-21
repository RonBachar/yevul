// שכבת תרגום מחרוזות, זרע מינימלי. אחת משבע ההחלטות שאסור להתפשר
// עליהן: כל מחרוזת בממשק עוברת דרך t(), גם כשההשקה בעברית בלבד, כדי
// שהוספת שפה בעתיד תהיה עבודה של שבועות ולא של חודשים.
//
// בכוונה מינימלי בשלב הזה: מילון שטוח לפי מפתח, בלי אינטרפולציה,
// בלי ריבוי (plural), ובלי החלפת שפה בזמן ריצה. אלה נוספים בשלב 8
// כשנעבור על כל המחרוזות במפרט. קוד טהור בלי תלות בסביבה, כדי שיעבוד
// זהה בנייד, בווב, וב-Worker.

export type Locale = 'he';

const strings: Record<Locale, Record<string, string>> = {
  he: {
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
  },
};

let current: Locale = 'he';

export function setLocale(locale: Locale): void {
  current = locale;
}

export function getLocale(): Locale {
  return current;
}

// מחזיר את המחרוזת לפי המפתח, ואם אין, מחזיר את המפתח עצמו כדי
// שחוסר יהיה גלוי בפיתוח ולא ייפול בשקט.
export function t(key: string): string {
  return strings[current]?.[key] ?? key;
}
