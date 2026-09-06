import { useMemo, useState, type FormEvent } from 'react';
import {
  formatSprayUnitPrice,
  normalizeSprayMaterial,
  parseSprayAmountInput,
  saveSprayPrice,
  sprayPricelistRows,
  sprayUnitLabelKey,
  SPRAY_UNITS,
  t,
  useCurrentFarm,
  useFarmSettings,
  useSprayPrices,
  type SprayPriceRow,
  type SprayUnit,
} from '@yevul/shared';
import { supabase } from '../lib/supabase';
import { TilePicker, type TileOption } from '../components/TilePicker';
import '../styles/form.css';
import './PricelistScreen.css';

// המחירון. עידו, 6.9.2026: "לכל גידול יש את אותם חומרים חוזרים שנה
// אחרי שנה, הדברה, דישון, קוטל עשבים. במקום להקליד שמות ומחירים כל
// פעם, תנו לי מחירון שבו אני מזין את המחירים פעם אחת, ואז ביומן
// הריסוס שדה החומר פותח רשימה, אני בוחר חומר, מקליד כמות, והכסף כבר
// מחושב".
//
// **The price is always the farmer's own number.** He said it in the same
// breath: the same material is seven shekels dearer one month and four cheaper
// the next, so the app never guesses a price and never fetches one. This screen
// is nothing but his own memory, written down once.
//
// **And it never re-values a spray that was already written.** A spray freezes
// its quantity, unit, unit price and total onto its own row at write time (see
// 20260904130000_spray_pricelist.sql); the rows here only pre-fill the next
// entry. Updating a price today leaves every past record exactly as it was,
// which is the whole reason the two are separate.
//
// The grid of materials is a TilePicker like every other choice in this app,
// and picking one opens it for editing. Adding is the dashed square, exactly as
// on the plot form's crop step.

type Status =
  'idle' | 'saving' | 'saved' | 'materialRequired' | 'priceRequired' | 'forbidden' | 'error';

const STATUS_MESSAGE_KEYS: Record<string, string> = {
  materialRequired: 'pricelist.materialRequired',
  priceRequired: 'pricelist.priceRequired',
  forbidden: 'pricelist.forbidden',
  error: 'pricelist.saveError',
};

export function PricelistScreen() {
  const { farm, loading } = useCurrentFarm(supabase);
  const settings = useFarmSettings(supabase);
  const currency = settings.form?.currency ?? 'ILS';
  const prices = useSprayPrices(supabase, farm?.id ?? null);

  // מה שנשמר מאז שהמסך נפתח. useSprayPrices טוען פעם אחת ואין לו
  // ריענון משלו, ולסבב רשת נוסף רק כדי להזיז שורה אחת אין הצדקה,
  // ולכן השמירה מוצגת מיד ונשטפת בטעינה הבאה. ראה sprayPricelistRows.
  const [pending, setPending] = useState<SprayPriceRow[]>([]);
  const rows = useMemo(() => sprayPricelistRows(prices, pending), [prices, pending]);

  const [editorOpen, setEditorOpen] = useState(false);
  const [material, setMaterial] = useState('');
  // עריכה של שורה קיימת נועלת את השם: הוא המפתח שהשורה נשמרת עליו,
  // ושינוי שלו הוא חומר אחר ולא שינוי מחיר. שינוי שם נעשה בהוספה.
  const [nameLocked, setNameLocked] = useState(false);
  const [priceText, setPriceText] = useState('');
  const [unit, setUnit] = useState<SprayUnit>('liter');
  const [status, setStatus] = useState<Status>('idle');

  const busy = status === 'saving';

  function startAdd() {
    setEditorOpen(true);
    setNameLocked(false);
    setMaterial('');
    setPriceText('');
    setUnit('liter');
    setStatus('idle');
  }

  function startEdit(materialNormalized: string) {
    const row = rows.find((candidate) => candidate.materialNormalized === materialNormalized);
    if (!row) return;
    setEditorOpen(true);
    setNameLocked(true);
    setMaterial(row.materialNormalized);
    setPriceText(String(row.unitPrice));
    setUnit(row.unit);
    setStatus('idle');
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!farm) {
      setStatus('error');
      return;
    }

    // undefined הוא "מה שבתיבה אינו מספר", null הוא תיבה ריקה. השמירה
    // המשותפת פוסלת את שניהם ממילא, והבדיקה כאן רק חוסכת סבב רשת.
    const unitPrice = parseSprayAmountInput(priceText);
    if (unitPrice === undefined || unitPrice === null) {
      setStatus('priceRequired');
      return;
    }

    setStatus('saving');
    const result = await saveSprayPrice(supabase, farm.id, { material, unitPrice, unit });
    if (!result.ok) {
      setStatus(result.reason);
      return;
    }

    setPending((saved) => [
      ...saved,
      { materialNormalized: normalizeSprayMaterial(material), unitPrice, unit },
    ]);
    setEditorOpen(false);
    setStatus('saved');
  }

  const materialTiles: TileOption[] = rows.map((row) => ({
    value: row.materialNormalized,
    label: row.materialNormalized,
    caption: formatSprayUnitPrice(row.unitPrice, row.unit, currency),
  }));

  return (
    <div className="screen">
      <h1 className="screen__title">{t('pricelist.title')}</h1>
      <p className="screen__note pricelist__intro">{t('pricelist.intro')}</p>

      {loading && <p className="screen__note">{t('common.loading')}</p>}

      {!loading && (
        <TilePicker
          id="pricelist-materials"
          title={t('pricelist.materialsTitle')}
          options={materialTiles}
          // רק עריכה מסמנת משבצת. בהוספה השם עדיין לא שייך לאף שורה.
          selectedValue={editorOpen && nameLocked ? normalizeSprayMaterial(material) : null}
          onSelect={startEdit}
          actions={[{ key: 'add', label: t('pricelist.add'), onPress: startAdd }]}
          // המשק הראשון נוחת כאן על רשת ריקה, וזו השורה שמסבירה למה
          // המסך קיים במקום להיראות שבור.
          emptyHint={t('pricelist.empty')}
          disabled={busy}
        />
      )}

      {status === 'saved' && !editorOpen && (
        <p className="form__message form__message--good pricelist__saved" role="status">
          {t('pricelist.saved')}
        </p>
      )}

      {editorOpen && (
        <form className="form pricelist__editor" onSubmit={onSubmit} noValidate>
          <h2 className="pricelist__editor-title">
            {nameLocked ? t('pricelist.editTitle') : t('pricelist.newTitle')}
          </h2>

          <div className="form__row">
            <label className="form__label" htmlFor="pricelist-material">
              {t('pricelist.material')}
            </label>
            <input
              id="pricelist-material"
              className="form__input"
              type="text"
              value={material}
              placeholder={t('pricelist.materialPlaceholder')}
              onChange={(e) => setMaterial(e.target.value)}
              disabled={busy || nameLocked}
              autoFocus={!nameLocked}
            />
          </div>

          <div className="form__row">
            <label className="form__label" htmlFor="pricelist-price">
              {unit === 'kg' ? t('spray.unitPricePerKg') : t('spray.unitPricePerLiter')}
            </label>
            <input
              id="pricelist-price"
              className="form__input"
              type="number"
              step="any"
              min="0"
              value={priceText}
              placeholder={t('spray.unitPricePlaceholder')}
              onChange={(e) => setPriceText(e.target.value)}
              disabled={busy}
              autoFocus={nameLocked}
            />
            <p className="form__hint">{t('pricelist.priceHint')}</p>
          </div>

          <TilePicker
            id="pricelist-unit"
            title={t('pricelist.unitTitle')}
            options={SPRAY_UNITS.map((option) => ({
              value: option,
              label: t(sprayUnitLabelKey(option)),
            }))}
            selectedValue={unit}
            onSelect={(value) => setUnit(value as SprayUnit)}
            disabled={busy}
          />

          <div className="form__actions">
            <button type="submit" className="form__submit" disabled={busy}>
              {busy ? t('pricelist.saving') : t('pricelist.save')}
            </button>
            <button
              type="button"
              className="form__cancel"
              onClick={() => {
                setEditorOpen(false);
                setStatus('idle');
              }}
              disabled={busy}
            >
              {t('plots.detail.back')}
            </button>
          </div>

          {STATUS_MESSAGE_KEYS[status] && (
            <p className="form__message form__message--bad" role="alert">
              {t(STATUS_MESSAGE_KEYS[status] ?? '')}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
