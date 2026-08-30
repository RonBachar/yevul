-- מכסת ה-AI החודשית, שלב 5, docs/roadmap.md.
--
-- prd.md סעיף 12, "אכיפת מסלול בשרת ולא בקליינט": מכסת הקול, מגבלת
-- החלקות וחסימת הקבלות במסלול החינמי נאכפות ב-Worker. הטבלה כאן היא
-- המונה שה-Worker קורא וכותב, ו-**הקליינט לעולם אינו כותב אליה**.
--
-- מונה אחד לכל משק לכל חודש, ולא טבלה לפי סוג. prd.md נספח א.5:
-- "שלוש הסכמות נספרות מול אותה מכסה חודשית. קול הוא קול", והרודמאפ
-- מוסיף ש-OCR לקבלות חולק את אותה מכסה בדיוק. שלוש סכמות הקול ועיבוד
-- הקבלות הם צרכן אחד של אותו תקציב, ולכן גם שורה אחת.
--
-- period הוא היום הראשון בחודש ולא חותמת זמן חופשית, כדי שהמפתח
-- הראשי יהיה דטרמיניסטי ולא ייווצרו שתי שורות לאותו חודש.

create table public.ai_usage (
  farm_id uuid not null references public.farms(id),
  period date not null,
  used integer not null default 0 check (used >= 0),
  updated_at timestamptz not null default now(),
  primary key (farm_id, period)
);

comment on table public.ai_usage is
  'מונה שימוש ב-AI לכל משק לכל חודש. נכתב אך ורק על ידי ה-Worker דרך private.consume_ai_quota.';

alter table public.ai_usage enable row level security;

-- **קריאה בלבד, ואין שום מדיניות כתיבה, בכוונה.** ה-Worker ניגש עם
-- service role ועוקף RLS ממילא, ולכן היעדר מדיניות INSERT/UPDATE כאן
-- הוא הדבר שמונע מקליינט לזייף לעצמו מכסה. הקריאה מותרת כדי שהאפליקציה
-- תוכל להציג לחקלאי כמה נשאר לו החודש בלי סבב דרך ה-Worker.
create policy "ai_usage_select" on public.ai_usage
  for select to authenticated
  using (farm_id in (select private.active_member_farm_ids()));

grant select on public.ai_usage to authenticated;

-- ============================================================
-- צריכת מכסה, בדיקה והגדלה בפעולה אטומית אחת.
--
-- **הפרדה בין בדיקה לכתיבה הייתה יוצרת מרוץ**: שתי בקשות מקבילות
-- בקצה המכסה היו שתיהן קוראות "נשאר אחד", שתיהן עוברות, והמשק היה
-- חורג. ה-INSERT ... ON CONFLICT DO UPDATE עם התנאי בתוך ה-WHERE
-- מבצע את שניהם בהצהרה אחת תחת נעילת שורה, ולכן בדיוק אחת מהשתיים
-- מצליחה.
--
-- p_limit הוא null למסלול ללא הגבלה. במקרה כזה השימוש עדיין נספר,
-- כי prd.md סעיף 13 דורש "מעקב אחרי עלות ללקוח" גם כשאין תקרה.
--
-- security definer כדי שה-Worker לא יידרש להרשאות כתיבה ישירות על
-- הטבלה, ו-search_path מקובע מפני חטיפת סכימה.
-- ============================================================

create or replace function private.consume_ai_quota(p_farm_id uuid, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  -- **at time zone 'UTC' ולא now() גולמי.** date_trunc על timestamptz
  -- נגזר לפי אזור הזמן של הסשן, ולכן אותה בקשה הייתה נופלת לחודש אחר
  -- תלוי בהגדרת החיבור. החודש חייב להיות אותו חודש לכל קורא.
  v_period date := date_trunc('month', now() at time zone 'UTC')::date;
  v_used integer;
begin
  -- מכסה אפס או שלילית חוסמת עוד לפני הכתיבה. בלי הבדיקה הזו ההכנסה
  -- הראשונה בחודש הייתה עוברת תמיד, כי ה-WHERE שבהמשך חל רק על ענף
  -- ה-ON CONFLICT ולא על INSERT שאין לו התנגשות.
  if p_limit is not null and p_limit <= 0 then
    return false;
  end if;

  insert into public.ai_usage (farm_id, period, used, updated_at)
  values (p_farm_id, v_period, 1, now())
  on conflict (farm_id, period) do update
    set used = public.ai_usage.used + 1,
        updated_at = now()
    where p_limit is null or public.ai_usage.used < p_limit
  returning used into v_used;

  -- אפס שורות חזרו פירושו שה-WHERE חסם את העדכון, כלומר המכסה מוצתה.
  return v_used is not null;
end;
$$;

-- אין לקליינט מה לקרוא לזה. ה-Worker ניגש עם service role.
revoke all on function private.consume_ai_quota(uuid, integer) from public;
grant execute on function private.consume_ai_quota(uuid, integer) to service_role;

comment on function private.consume_ai_quota(uuid, integer) is
  'בודק ומגדיל מכסת AI חודשית בפעולה אטומית אחת. מחזיר false כשהמכסה מוצתה. p_limit null = ללא הגבלה, אבל עדיין נספר.';

-- ============================================================
-- עטיפה ציבורית, כדי ש-PostgREST יוכל להגיע לפונקציה.
--
-- PostgREST חושף רק סכימות מוגדרות (public כברירת מחדל), ולכן
-- פונקציה ב-private אינה ניתנת לקריאה כ-RPC כלל. הלוגיקה נשארת
-- ב-private לפי המוסכמה בפרויקט, וכאן יושבת רק הדלת.
--
-- **ההרשאה היא ל-service_role בלבד.** authenticated ו-anon אינם
-- מקבלים execute, ולכן חקלאי שינסה לקרוא ל-RPC הזה ישירות מהאפליקציה
-- כדי לנפח לעצמו מכסה יקבל שגיאת הרשאה. זה הצד השני של אותו מטבע
-- שבו לטבלה אין מדיניות כתיבה.
-- ============================================================

create or replace function public.consume_ai_quota(p_farm_id uuid, p_limit integer)
returns boolean
language sql
security definer
set search_path = public
as $$
  select private.consume_ai_quota(p_farm_id, p_limit);
$$;

revoke all on function public.consume_ai_quota(uuid, integer) from public;
revoke all on function public.consume_ai_quota(uuid, integer) from authenticated;
revoke all on function public.consume_ai_quota(uuid, integer) from anon;
grant execute on function public.consume_ai_quota(uuid, integer) to service_role;

-- ============================================================
-- הרשאות ה-Worker, מינימום הכרחי.
--
-- **התגלה בבדיקה מקצה לקצה מול Supabase המקומי**: לכל המיגרציות עד
-- כאן היו grants ל-authenticated בלבד, ול-service_role לא ניתנה שום
-- הרשאה על הטבלאות. התוצאה הייתה ש-service_role קיבל 42501 על
-- farm_members, ה-Worker לא הצליח לזהות את המשק של המשתמש, וכל בקשה
-- מאומתת נדחתה כ"אין משק פעיל".
--
-- SELECT בלבד, ורק על שתי הטבלאות שהשומר באמת קורא. ה-Worker אינו
-- כותב לשום טבלה ישירות, הכתיבה היחידה שלו היא דרך consume_ai_quota
-- שהיא security definer, ולכן אין כאן שום INSERT או UPDATE.
-- ============================================================

grant select on public.farm_members to service_role;
grant select on public.subscriptions to service_role;
-- קריאת המונה נדרשת ל"מעקב אחרי עלות ללקוח", prd.md סעיף 13. הכתיבה
-- נשארת אך ורק דרך consume_ai_quota, גם ל-service_role.
grant select on public.ai_usage to service_role;
