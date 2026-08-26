-- log_entries.type הוגבל ב-core_schema.sql לשלוש ערכים בלבד
-- (spray/harvest/other), אבל prd.md סעיף 8 ו-design.md, Components:
-- Journal, מגדירים עשרה סוגים: חריש, זריעה, דישון, ריסוס, השקיה, גיזום,
-- דילול, קטיף, תיקון, אחר. זה נתגלה תוך כדי בניית ה-Log Entry Sheet
-- בשלב 3, המשימה הראשונה שבפועל כותבת ליומן מהקליינט. מרחיבים את
-- האילוץ במקום להוסיף עמודה או טבלת דומיין נפרדת, כי מדובר ברשימה
-- קבועה וסגורה ששייכת לישות אחת בלבד, לא ערך משותף כמו currency או
-- area_unit ב-value_domains.sql.

alter table public.log_entries
  drop constraint log_entries_type_check;

alter table public.log_entries
  add constraint log_entries_type_check
  check (type in (
    'till', 'sow', 'fertilize', 'spray', 'irrigate',
    'prune', 'thin', 'harvest', 'repair', 'other'
  ));
