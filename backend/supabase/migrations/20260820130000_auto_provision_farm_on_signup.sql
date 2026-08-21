-- חקלאי רווחי, יצירת משק אוטומטית בהתחברות ראשונה, שלב 2
-- קורא מחדש: docs/roadmap.md שלב 2, ו-docs/prd.md נספח א.4.
--
-- ההחלטה: יצירת Farm + FarmMember(owner) בהתחברות ראשונה היא לוגיקת
-- עסק, ולכן היא חיה בשרת בלבד ולא בשום לקוח. הדרך הנכונה ב-Supabase
-- היא טריגר על auth.users, כך שברגע שנוצר משתמש חדש הוא מקבל משק
-- אוטומטית, אטומי, ובלי שאף לקוח יכול לעקוף או לשכפל את זה.
--
-- כדי לא לשכפל את לוגיקת ה"הקם משק" בין הטריגר לבין create_farm() שכבר
-- קיים, מחלצים כאן פונקציית עזר יחידה, private.provision_farm(), והיא
-- מקור האמת היחיד לפעולה. הטריגר קורא לה עם new.id, ו-create_farm()
-- קורא לה עם auth.uid().

-- ====================================================================
-- מקור אמת יחיד ל"הקם משק". security definer כדי לעקוף RLS בזמן
-- ההקמה (רשומת ה-owner הראשונה לא יכולה לעבור את מדיניות ה-INSERT על
-- farm_members, שדורשת כבר להיות owner/manager באותו משק).
-- מקבל user_id מפורש ולא מסתמך על auth.uid(), כי בהקשר של טריגר על
-- auth.users אין עדיין סשן מאומת ו-auth.uid() הוא null.
-- ====================================================================

create or replace function private.provision_farm(
  p_user_id uuid,
  p_name text,
  p_currency text default 'ILS',
  p_area_unit text default 'dunam',
  p_locale text default 'he'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_farm_id uuid;
begin
  if p_user_id is null then
    raise exception 'provision_farm requires a user id';
  end if;

  insert into public.farms (name) values (p_name) returning id into v_farm_id;
  insert into public.farm_members (farm_id, user_id, role, status)
    values (v_farm_id, p_user_id, 'owner', 'active');
  insert into public.settings (farm_id, currency, area_unit, locale)
    values (v_farm_id, p_currency, p_area_unit, p_locale);
  insert into public.subscriptions (farm_id) values (v_farm_id);

  return v_farm_id;
end;
$$;

-- לקוחות לא קוראים לה ישירות, רק דרך הטריגר או create_farm(). הפונקציות
-- הקוראות הן security definer בבעלות postgres, ולכן יכולות להריץ אותה
-- בלי grant ל-authenticated.
revoke all on function private.provision_farm(uuid, text, text, text, text) from public;

-- ====================================================================
-- create_farm() מתעדכן להאציל לפונקציית העזר, כדי שלוגיקת ההקמה תחיה
-- במקום אחד בלבד. תפקידו מעתה: יצירת משק *נוסף* על ידי משתמש מאומת,
-- ושימוש ב-fixtures של בדיקות. המשק הראשון נוצר אוטומטית דרך הטריגר.
-- ====================================================================

create or replace function public.create_farm(
  p_name text,
  p_currency text default 'ILS',
  p_area_unit text default 'dunam',
  p_locale text default 'he'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  return private.provision_farm(auth.uid(), p_name, p_currency, p_area_unit, p_locale);
end;
$$;

-- ====================================================================
-- הטריגר. יוצר משק ברירת מחדל בשם "המשק שלי", הניתן לשינוי מיד במסך
-- ההגדרות. ההשקה בעברית בלבד ולכן שם ברירת המחדל בעברית, ה-locale
-- ברירת מחדל 'he'. השם אינו עובר את שכבת התרגום כי הוא ערך ברירת מחדל
-- שנקבע בשרת ברגע שעדיין לא ידוע ה-locale של המשתמש.
--
-- שמירה מפני יצירה כפולה: אם למשתמש כבר יש חברות פעילה כלשהי, הטריגר
-- לא יוצר משק נוסף. בהכנסה אמיתית של משתמש חדש זה אף פעם לא מתקיים,
-- זו רשת ביטחון בלבד מפני הפעלה חוזרת.
-- ====================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.farm_members
    where user_id = new.id and deleted_at is null
  ) then
    return new;
  end if;

  perform private.provision_farm(new.id, 'המשק שלי', 'ILS', 'dunam', 'he');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
