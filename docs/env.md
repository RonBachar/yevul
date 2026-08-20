# משתני סביבה, ומדריך יצירת פרויקט Supabase

מסמך זה מסביר איזה משתנה סביבה שייך לאיזו אפליקציה, ואיך יוצרים את פרויקט ה-Supabase שכל שלושת הלקוחות מתחברים אליו. שום קובץ `.env` לא נכנס ל-git, רק קבצי `.env.example` נכנסים כתבנית.

## איך יוצרים פרויקט Supabase חדש

1. נרשמים ב-supabase.com עם חשבון גוגל או אימייל, בחינם.
2. לוחצים "New project", בוחרים שם, סיסמת מסד נתונים חזקה (שומרים אותה במקום בטוח, לא בצ'אט ולא ב-git), ואזור קרוב, בדרך כלל אירופה.
3. אחרי שהפרויקט נוצר, בתפריט Settings, יש שני מפתחות חשובים תחת API, ה-Project URL, וה-anon public key. אלה לא סודיים לחלוטין, אבל גם לא נכנסים בגלוי לקוד, תמיד דרך משתני סביבה.
4. יש גם service_role key, זה סודי לגמרי, משמש רק את ה-Worker בצד שרת, אף פעם לא בקליינט של הנייד או הווב.
5. מתקינים את Supabase CLI במחשב, כדי לנהל מיגרציות סכמה ולהריץ מסד מקומי לפיתוח. ההתקנה משתנה לפי מערכת הפעלה, יש הוראות מפורטות באתר של Supabase.
6. מריצים `supabase link` מתוך תיקיית השורש של הפרויקט כדי לחבר את `backend/supabase/migrations` הקיים בריפו לפרויקט האמיתי שנוצר.

אחרי שיש לך Project URL, anon key, ו-service_role key, תעביר אותם ואני אמלא את קבצי ה-`.env` המקומיים בהתאם, הם לא נשמרים ב-git בשום מקרה.

## אילו משתנים שייכים לאיזו אפליקציה

**`frontend/mobile/.env`**

`EXPO_PUBLIC_SUPABASE_URL`, כתובת הפרויקט.

`EXPO_PUBLIC_SUPABASE_ANON_KEY`, המפתח הציבורי, מותר להיות בקליינט כי RLS מגן על הנתונים בפועל.

`EXPO_PUBLIC_WORKER_URL`, כתובת ה-Cloudflare Worker, לקריאות קול, חילוץ, ו-OCR.

**`frontend/web/.env`**

אותם שלושה משתנים כמו בנייד, עם קידומת `VITE_` במקום `EXPO_PUBLIC_`, כי כך Vite חושף משתני סביבה ללקוח.

`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_WORKER_URL`.

**`backend/worker/.env` (מקומי לפיתוח), ובפרודקשן דרך `wrangler secret put`**

`SUPABASE_URL`, כתובת הפרויקט.

`SUPABASE_SERVICE_ROLE_KEY`, המפתח הסודי, אף פעם לא נחשף ללקוח, רק ל-Worker.

`OPENROUTER_API_KEY`, מפתח לקריאות תמלול, חילוץ JSON, ו-OCR מול OpenRouter.

`REVENUECAT_WEBHOOK_SECRET`, לאימות שהקריאה שמעדכנת entitlement במסד באמת הגיעה מ-RevenueCat.

## עקרון כללי

מפתח סודי אמיתי, service role, מפתחות AI, סודות webhook, יושב אך ורק ב-Worker, אף פעם לא בקליינט של נייד או ווב, גם לא כמשתנה סביבה מקומי לבדיקות ארוכות טווח. מפתח שמותר בקליינט, anon key, מוגן על ידי RLS ולא על ידי הסתרתו.
