import { useEffect, useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  computeEntryCost,
  createLogEntry,
  entryCostEdited,
  formatLocalDateOnly,
  formatSprayUnitPrice,
  initialLogEntryType,
  logEntryTypeLabelKey,
  LOG_ENTRY_TYPES,
  parseSprayAmountInput,
  safeHarvestDate,
  sprayMaterialChoices,
  sprayPriceMemory,
  sprayUnitLabelKey,
  SPRAY_UNITS,
  t,
  updateLogEntry,
  useFarmSettings,
  usePlots,
  useSprayPrices,
  useSpraySuggestions,
  type Currency,
  type LogEntry,
  type LogEntryType,
  type SprayMaterialChoice,
  type SprayUnit,
} from '@yevul/shared';
import { DateField } from './DateField';
import { Modal } from './Modal';
import { TilePicker } from './TilePicker';
import './LogEntrySheet.css';

// The browser's calendar day, never the UTC one. toISOString() is wrong from
// local midnight until 02:00 or 03:00, and here that default becomes a spray
// date, which is what safeHarvestDate computes the regulatory answer from.
function today(): string {
  return formatLocalDateOnly(new Date());
}

// The second line on a material tile: what a unit of it costs, or that the
// pricelist has nothing on it yet. "בלי מחיר" and not "0", the same distinction
// the waiting period draws between "none" and "not known".
function materialCaption(choice: SprayMaterialChoice, currency: Currency): string {
  if (choice.unitPrice === null || choice.unit === null) return t('spray.materialNoPrice');
  return formatSprayUnitPrice(choice.unitPrice, choice.unit, currency);
}

// גיליון יצירה/עריכה של רשומת יומן בווב, design.md "Log Entry Sheet",
// כדיאלוג ממורכז (Modal) במקום גיליון תחתון, אותה הפרדה שכבר קיימת
// בין הלקוחות ל-TaskSheet. שדה סוג הוא תפריט נפתח כאן, שורת צ'יפים
// בנייד.
//
// **The date is no longer a native `<input type="date">`.** The line that used
// to be here said the browser could have one because the constraint that ruled
// a native picker out on mobile did not apply -- true, and beside the point once
// the founder asked for a calendar everywhere. The two clients now share one,
// written in packages/shared/src/calendar.ts. See DateField.
// defaultType is the sibling of defaultPlotId: what the opening screen wants a
// *new* entry to start on. See initialLogEntryType in the shared package for
// why an entry being edited ignores it.
export function LogEntrySheet({
  supabase,
  open,
  onClose,
  entry,
  defaultPlotId,
  defaultType,
  farmId,
  onSaved,
}: {
  supabase: SupabaseClient;
  open: boolean;
  onClose: () => void;
  entry: LogEntry | null;
  defaultPlotId: string | null;
  defaultType?: LogEntryType;
  farmId: string | null;
  onSaved: () => void;
}) {
  const plotsState = usePlots(supabase);
  const suggestions = useSpraySuggestions(supabase, farmId);
  const prices = useSprayPrices(supabase, farmId);
  // רק בשביל המטבע שמתחת לשם החומר במשבצת. מחיר בלי סימן מטבע הוא
  // מספר, לא כסף, ואת הכלל הזה קובע formatAmount ולא המסך.
  const settings = useFarmSettings(supabase);
  const currency = settings.form?.currency ?? 'ILS';

  const [type, setType] = useState<LogEntryType>(initialLogEntryType(entry, defaultType));
  const [plotId, setPlotId] = useState<string | null>(null);
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const [sprayPest, setSprayPest] = useState('');
  const [sprayMaterial, setSprayMaterial] = useState('');
  const [sprayDose, setSprayDose] = useState('');
  const [sprayPhiDays, setSprayPhiDays] = useState('');
  // The material half of the one cost box below. Quantity is typed per spray;
  // the unit and unit price are remembered per material and pre-filled from the
  // pricelist. Founder's decision 2026-09-04, extended 2026-09-10: there is no
  // longer a spray-only total here, only a contribution to the single combined
  // cost box further down.
  const [sprayQuantity, setSprayQuantity] = useState('');
  const [sprayQuantityUnit, setSprayQuantityUnit] = useState<SprayUnit | ''>('');
  const [sprayUnitPrice, setSprayUnitPrice] = useState('');
  // Work hours, Ido 2026-09-06: "let me enter how many hours the job took and
  // the cost per work hour". **On every type, not only a spray** -- his own
  // example is a spray that also took him three hours, and a repair takes hours
  // just the same. The rate pre-fills from the farm's pricelist rate.
  const [workHours, setWorkHours] = useState('');
  const [workHourlyRate, setWorkHourlyRate] = useState('');
  // **The one cost box.** Founder's decision 2026-09-10: an entry writes a
  // single expense, so there is a single amount for it, not a spray total and a
  // work total the farmer had to add up himself. It is suggested from quantity x
  // unit price plus hours x rate (computeEntryCost) while the farmer has not
  // typed a number himself, and left strictly alone the moment he has
  // (`costEdited`, via entryCostEdited on load and by hand below) -- manual entry
  // always wins, with no material, no quantity, no hours and no rate required.
  const [cost, setCost] = useState('');
  const [costEdited, setCostEdited] = useState(false);
  // כתיבת חומר שעדיין לא ברשת. המשבצת המקווקוות פותחת תיבה, והאישור
  // בוחר את מה שהוקלד בדיוק כאילו הייתה שם משבצת, כולל פתיחת המחיר
  // הזכור אם במקרה כן יש כזה.
  const [addingMaterial, setAddingMaterial] = useState(false);
  const [newMaterial, setNewMaterial] = useState('');
  const [harvestQty, setHarvestQty] = useState('');
  const [harvestUnit, setHarvestUnit] = useState('');
  const [status, setStatus] = useState<
    'idle' | 'saving' | 'pestRequired' | 'materialRequired' | 'forbidden' | 'error'
  >('idle');
  const busy = status === 'saving';

  useEffect(() => {
    if (!open) return;
    // Outside the branch on purpose: one line owns the starting type in both
    // cases, so a reopen after an edit cannot leave the previous entry's type
    // on screen for a new record.
    setType(initialLogEntryType(entry, defaultType));
    if (entry) {
      setPlotId(entry.plotId);
      setDate(entry.date);
      setNote(entry.note ?? '');
      setSprayPest(entry.sprayPest ?? '');
      setSprayMaterial(entry.sprayMaterial ?? '');
      setSprayDose(entry.sprayDose ?? '');
      setSprayPhiDays(entry.sprayPhiDays != null ? String(entry.sprayPhiDays) : '');
      setSprayQuantity(entry.sprayQuantity != null ? String(entry.sprayQuantity) : '');
      setSprayQuantityUnit(entry.sprayQuantityUnit ?? '');
      setSprayUnitPrice(entry.sprayUnitPrice != null ? String(entry.sprayUnitPrice) : '');
      setWorkHours(entry.workHours != null ? String(entry.workHours) : '');
      setWorkHourlyRate(entry.workHourlyRate != null ? String(entry.workHourlyRate) : '');
      setCost(entry.cost != null ? String(entry.cost) : '');
      // A saved cost that does not match quantity x price plus hours x rate was
      // typed by hand and must be kept as-is; one that matches was computed and
      // may recompute freely the moment quantity, price, hours or rate change.
      setCostEdited(
        entryCostEdited(
          entry.cost,
          entry.sprayQuantity,
          entry.sprayUnitPrice,
          entry.workHours,
          entry.workHourlyRate,
        ),
      );
      setHarvestQty(entry.harvestQty != null ? String(entry.harvestQty) : '');
      setHarvestUnit(entry.harvestUnit ?? '');
    } else {
      setPlotId(defaultPlotId);
      setDate(today());
      setNote('');
      setSprayPest('');
      setSprayMaterial('');
      setSprayDose('');
      setSprayPhiDays('');
      setSprayQuantity('');
      setSprayQuantityUnit('');
      setSprayUnitPrice('');
      setWorkHours('');
      // Left empty here rather than filled from the farm's rate: the settings
      // may not have arrived yet when the sheet opens. The effect below fills it
      // the moment they do, and only while the box is still empty.
      setWorkHourlyRate('');
      setCost('');
      setCostEdited(false);
      setHarvestQty('');
      setHarvestUnit('');
    }
    // מחוץ לענף: תיבת "חומר חדש" נסגרת בכל פתיחה, גם בעריכה, כדי
    // שגיליון שנפתח מחדש לא יציג תיבה פתוחה משימוש קודם.
    setAddingMaterial(false);
    setNewMaterial('');
    setStatus('idle');
  }, [open, entry, defaultPlotId, defaultType]);

  const phiDaysNumber = sprayPhiDays.trim() ? Number(sprayPhiDays) : null;
  const safeHarvest =
    type === 'spray' && date && phiDaysNumber != null && Number.isFinite(phiDaysNumber)
      ? safeHarvestDate(date, phiDaysNumber)
      : null;

  // A typed number, or null for an empty or unreadable box. parseSprayAmountInput
  // returns undefined for "unreadable"; a cost is optional, so that collapses to
  // null rather than blocking the save.
  const amountOrNull = (text: string): number | null => {
    const value = parseSprayAmountInput(text);
    return typeof value === 'number' ? value : null;
  };

  // **The farm's hourly rate pre-fills the box, it does not own it.** It arrives
  // after the sheet has opened (useFarmSettings loads asynchronously), which is
  // why this is an effect and not a starting value. Two things it deliberately
  // never does: overwrite a rate the farmer has already typed, and overwrite the
  // rate frozen on a record being edited -- that one is what the job was priced
  // at, and today's rate must not be written over it. See
  // 20260906120000_work_hours.sql.
  const farmHourlyRate = settings.form?.workHourlyRate ?? null;
  useEffect(() => {
    if (!open) return;
    if (entry?.workHourlyRate != null) return;
    if (farmHourlyRate === null) return;
    setWorkHourlyRate((current) => (current === '' ? String(farmHourlyRate) : current));
  }, [open, entry, farmHourlyRate]);

  // The one cost box's suggestion: quantity x unit price plus hours x rate,
  // recomputed on every change to any of the four while the farmer has not
  // typed a total himself, and left strictly alone the moment he has. This is
  // the whole of "manual entry always wins" for this box: an entry with no
  // material, no quantity, no hours and no rate can still carry a typed cost,
  // because this effect never runs while costEdited is true.
  useEffect(() => {
    if (costEdited) return;
    const computed = computeEntryCost(
      amountOrNull(sprayQuantity),
      amountOrNull(sprayUnitPrice),
      amountOrNull(workHours),
      amountOrNull(workHourlyRate),
    );
    setCost(computed === null ? '' : String(computed));
    // Only the four inputs and the edited flag drive the recompute; amountOrNull
    // is a pure local helper with no state of its own.
  }, [sprayQuantity, sprayUnitPrice, workHours, workHourlyRate, costEdited]);

  // Picking a material re-decides its unit and price from the pricelist, like
  // the tile walk does, and returns the cost to auto so it recomputes. The
  // farmer can still overwrite either field afterwards.
  function onMaterialChange(value: string) {
    setSprayMaterial(value);
    const memory = sprayPriceMemory(prices, value);
    setSprayUnitPrice(memory.unitPrice != null ? String(memory.unitPrice) : '');
    setSprayQuantityUnit(memory.unit ?? '');
    setCostEdited(false);
  }

  // The tiles: the pricelist first, then materials sprayed before that are not
  // on it, then whatever this record already carries. The last of the three is
  // what keeps an edit of an old spray, or a material just typed by hand, from
  // being a value with no tile of its own.
  const materialChoices = sprayMaterialChoices(prices, suggestions.materials, sprayMaterial);

  // A material that is not on any list yet. It is treated exactly like a picked
  // tile -- the pricelist is asked about it too, because a material can be
  // priced without ever having been sprayed.
  function confirmNewMaterial() {
    const value = newMaterial.trim();
    if (!value) return;
    onMaterialChange(value);
    setAddingMaterial(false);
  }

  const unitPriceLabel =
    sprayQuantityUnit === 'kg'
      ? t('spray.unitPricePerKg')
      : sprayQuantityUnit === 'liter'
        ? t('spray.unitPricePerLiter')
        : t('spray.unitPrice');

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!farmId || !date) return;

    setStatus('saving');
    const input = {
      plotId,
      date,
      type,
      note: note.trim() ? note.trim() : null,
      sprayPest: sprayPest.trim() ? sprayPest.trim() : null,
      sprayMaterial: sprayMaterial.trim() ? sprayMaterial.trim() : null,
      sprayDose: sprayDose.trim() ? sprayDose.trim() : null,
      sprayPhiDays: Number.isFinite(phiDaysNumber) ? phiDaysNumber : null,
      sprayQuantity: amountOrNull(sprayQuantity),
      sprayQuantityUnit: sprayQuantityUnit === '' ? null : sprayQuantityUnit,
      sprayUnitPrice: amountOrNull(sprayUnitPrice),
      // Frozen as they stand: the rate the job was worked at, not today's rate
      // from the pricelist. See 20260906120000_work_hours.sql.
      workHours: amountOrNull(workHours),
      workHourlyRate: amountOrNull(workHourlyRate),
      // The one cost, written to `expenses` via createLogEntry/updateLogEntry.
      // See the money header in logEntries.ts.
      cost: amountOrNull(cost),
      harvestQty:
        harvestQty.trim() && Number.isFinite(Number(harvestQty)) ? Number(harvestQty) : null,
      harvestUnit: harvestUnit.trim() ? harvestUnit.trim() : null,
    };
    const result = entry
      ? await updateLogEntry(supabase, entry.id, input)
      : await createLogEntry(supabase, farmId, input);
    if (result.ok) {
      onSaved();
      return;
    }
    setStatus(result.reason);
  }

  return (
    <Modal open={open} onClose={onClose}>
      <h2 className="screen__title">{entry ? t('log.form.titleEdit') : t('log.form.titleNew')}</h2>
      <form className="form" onSubmit={onSubmit} noValidate>
        <div className="form__row">
          <label className="form__label" htmlFor="log-type">
            {t('log.form.type')}
          </label>
          <select
            id="log-type"
            className="form__input"
            value={type}
            onChange={(e) => setType(e.target.value as LogEntryType)}
            disabled={busy}
          >
            {LOG_ENTRY_TYPES.map((option) => (
              <option key={option} value={option}>
                {t(logEntryTypeLabelKey(option))}
              </option>
            ))}
          </select>
        </div>

        {type === 'spray' && (
          <>
            <div className="form__row">
              <label className="form__label" htmlFor="log-spray-pest">
                {t('log.form.sprayPest')}
              </label>
              <input
                id="log-spray-pest"
                className="form__input"
                type="text"
                list="log-spray-pest-options"
                value={sprayPest}
                placeholder={t('log.form.sprayPestPlaceholder')}
                onChange={(e) => setSprayPest(e.target.value)}
                disabled={busy}
              />
              <datalist id="log-spray-pest-options">
                {suggestions.pests.map((value) => (
                  <option key={value} value={value} />
                ))}
              </datalist>
            </div>
            {/* **החומר הוא רשת משבצות ולא תיבת טקסט.** עידו, 6.9.2026:
                "שדה החומר פותח רשימה, אני בוחר חומר, מקליד כמות, והכסף
                כבר מחושב". המשבצות הן קודם כל המחירון שלו, כל אחת עם
                המחיר שלה מתחתיה, ואחריהן מה שריסס לאחרונה ועדיין אין
                לו מחיר. בחירה ממלאת יחידה ומחיר לפי המחירון, ומשם
                הכמות מכפילה. חומר שאינו ברשת מוקלד במשבצת המקווקוות,
                כי מחירון סגור היה כלוב. */}
            <TilePicker
              id="log-spray-material"
              title={t('log.form.sprayMaterial')}
              options={materialChoices.map((choice) => ({
                value: choice.material,
                label: choice.material,
                caption: materialCaption(choice, currency),
              }))}
              selectedValue={sprayMaterial.trim() === '' ? null : sprayMaterial.trim()}
              onSelect={(value) => {
                setAddingMaterial(false);
                onMaterialChange(value);
              }}
              actions={[
                {
                  key: 'add',
                  label: t('spray.addMaterial'),
                  onPress: () => {
                    setNewMaterial('');
                    setAddingMaterial(true);
                  },
                },
              ]}
              emptyHint={t('spray.emptyMaterials')}
              disabled={busy}
              footer={
                addingMaterial ? (
                  <div className="tile-picker__footer">
                    <input
                      id="log-spray-material-new"
                      className="form__input"
                      type="text"
                      value={newMaterial}
                      placeholder={t('log.form.sprayMaterialPlaceholder')}
                      onChange={(e) => setNewMaterial(e.target.value)}
                      disabled={busy}
                      aria-labelledby="log-spray-material"
                      autoFocus
                    />
                    <button
                      type="button"
                      className="form__submit"
                      disabled={busy}
                      onClick={confirmNewMaterial}
                    >
                      {t('spray.confirm')}
                    </button>
                  </div>
                ) : null
              }
            />
            <div className="form__row">
              <label className="form__label" htmlFor="log-spray-dose">
                {t('log.form.sprayDose')} · {t('common.optional')}
              </label>
              <input
                id="log-spray-dose"
                className="form__input"
                type="text"
                value={sprayDose}
                onChange={(e) => setSprayDose(e.target.value)}
                disabled={busy}
              />
            </div>
            <div className="form__row">
              <label className="form__label" htmlFor="log-spray-phi">
                {t('log.form.sprayPhiDays')} · {t('common.optional')}
              </label>
              <input
                id="log-spray-phi"
                className="form__input"
                type="number"
                min="0"
                value={sprayPhiDays}
                onChange={(e) => setSprayPhiDays(e.target.value)}
                disabled={busy}
              />
            </div>
            <div className="form__row">
              <label className="form__label" htmlFor="log-spray-quantity">
                {t('spray.quantity')} · {t('common.optional')}
              </label>
              <input
                id="log-spray-quantity"
                className="form__input"
                type="number"
                step="any"
                min="0"
                placeholder={t('spray.quantityPlaceholder')}
                value={sprayQuantity}
                onChange={(e) => setSprayQuantity(e.target.value)}
                disabled={busy}
              />
            </div>
            <div className="form__row">
              <label className="form__label" htmlFor="log-spray-unit">
                {t('spray.unitLabel')} · {t('common.optional')}
              </label>
              <select
                id="log-spray-unit"
                className="form__input"
                value={sprayQuantityUnit}
                onChange={(e) => setSprayQuantityUnit(e.target.value as SprayUnit | '')}
                disabled={busy}
              >
                <option value="">{t('spray.notSet')}</option>
                {SPRAY_UNITS.map((unit) => (
                  <option key={unit} value={unit}>
                    {t(sprayUnitLabelKey(unit))}
                  </option>
                ))}
              </select>
            </div>
            <div className="form__row">
              <label className="form__label" htmlFor="log-spray-unit-price">
                {unitPriceLabel} · {t('common.optional')}
              </label>
              <input
                id="log-spray-unit-price"
                className="form__input"
                type="number"
                step="any"
                min="0"
                placeholder={t('spray.unitPricePlaceholder')}
                value={sprayUnitPrice}
                onChange={(e) => setSprayUnitPrice(e.target.value)}
                disabled={busy}
              />
            </div>
            {safeHarvest && (
              <p className="form__message log-entry-sheet__safe-harvest">
                {t('log.form.safeHarvestPrefix')}{' '}
                {new Date(safeHarvest).toLocaleDateString('he-IL', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                })}
              </p>
            )}
          </>
        )}

        {type === 'harvest' && (
          <>
            <div className="form__row">
              <label className="form__label" htmlFor="log-harvest-qty">
                {t('log.form.harvestQty')}
              </label>
              <input
                id="log-harvest-qty"
                className="form__input"
                type="number"
                step="any"
                placeholder={t('common.numberPlaceholder')}
                value={harvestQty}
                onChange={(e) => setHarvestQty(e.target.value)}
                disabled={busy}
              />
            </div>
            <div className="form__row">
              <label className="form__label" htmlFor="log-harvest-unit">
                {t('log.form.harvestUnit')}
              </label>
              <input
                id="log-harvest-unit"
                className="form__input"
                type="text"
                placeholder={t('log.form.harvestUnitPlaceholder')}
                value={harvestUnit}
                onChange={(e) => setHarvestUnit(e.target.value)}
                disabled={busy}
              />
            </div>
          </>
        )}

        {/* שעות העבודה. **מחוץ לכל תנאי סוג, במכוון**: עידו, 6.9.2026,
            "שעות עבודה פלוס חומרים", והדוגמה שלו היא ריסוס שגם לקח לו
            שלוש שעות. גם תיקון וגם גיזום לוקחים שעות, ולכן שלושת
            השדות פתוחים לכל סוג רישום. התעריף מגיע מהמחירון, העלות
            מחושבת, וכל אחד משלושתם ניתן להקלדה ידנית. */}
        <h3 className="log-entry-sheet__section">{t('work.hours')}</h3>
        <div className="form__row">
          <label className="form__label" htmlFor="log-work-hours">
            {t('work.hours')} · {t('common.optional')}
          </label>
          <input
            id="log-work-hours"
            className="form__input"
            type="number"
            step="any"
            min="0"
            placeholder={t('work.hoursPlaceholder')}
            value={workHours}
            onChange={(e) => setWorkHours(e.target.value)}
            disabled={busy}
          />
        </div>
        <div className="form__row">
          <label className="form__label" htmlFor="log-work-rate">
            {t('work.hourlyRate')} · {t('common.optional')}
          </label>
          <input
            id="log-work-rate"
            className="form__input"
            type="number"
            step="any"
            min="0"
            placeholder={t('work.hourlyRatePlaceholder')}
            value={workHourlyRate}
            onChange={(e) => setWorkHourlyRate(e.target.value)}
            disabled={busy}
          />
        </div>
        {/* **תיבת העלות היחידה.** החלטת היזם 2026-09-10: רשומה אחת יוצרת
            הוצאה אחת, אז יש לה סכום אחד, לא סכום ריסוס וסכום עבודה שהחקלאי
            צריך לחבר בעצמו. ההצעה היא כמות כפול מחיר ליחידה ועוד שעות כפול
            תעריף, וכמו כל תיבת עלות באפליקציה הזו הקלדה ידנית תמיד מנצחת:
            אפשר להקליד סכום גם בלי חומר, בלי כמות, בלי שעות ובלי תעריף. */}
        <div className="form__row">
          <label className="form__label" htmlFor="log-cost">
            {t('log.form.cost')} · {t('common.optional')}
          </label>
          <input
            id="log-cost"
            className="form__input"
            type="number"
            step="any"
            min="0"
            placeholder={t('spray.costPlaceholder')}
            value={cost}
            onChange={(e) => {
              const text = e.target.value;
              setCost(text);
              // An empty box returns the cost to auto; anything typed wins.
              setCostEdited(text.trim() !== '');
            }}
            disabled={busy}
          />
          <p className="form__hint">
            {!costEdited && cost ? t('spray.costComputed') : t('spray.costHint')}
          </p>
        </div>

        <div className="form__row">
          <label className="form__label" htmlFor="log-plot">
            {t('plots.form.name')}
          </label>
          <select
            id="log-plot"
            className="form__input"
            value={plotId ?? ''}
            onChange={(e) => setPlotId(e.target.value === '' ? null : e.target.value)}
            disabled={busy || plotsState.loading}
          >
            <option value="">{t('tasks.plotGeneral')}</option>
            {plotsState.plots.map((plot) => (
              <option key={plot.id} value={plot.id}>
                {plot.name}
              </option>
            ))}
          </select>
        </div>

        {/* A journal entry records something that has already happened,
            whatever its type, so the calendar stops at today. The three
            shortcuts are the ones the spray walk already offers: a record is
            written the evening it happened or the morning after. */}
        <DateField
          id="log-date"
          label={t('log.form.date')}
          value={date}
          onChange={(next) => setDate(next ?? today())}
          direction="past"
          disabled={busy}
        />

        <div className="form__row">
          <label className="form__label" htmlFor="log-note">
            {t('log.form.note')} · {t('common.optional')}
          </label>
          <input
            id="log-note"
            className="form__input"
            type="text"
            placeholder={t('log.form.notePlaceholder')}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={busy}
          />
        </div>

        <div className="form__actions">
          <button type="submit" className="form__submit" disabled={busy}>
            {busy ? t('log.saving') : t('log.save')}
          </button>
          <button type="button" className="form__cancel" onClick={onClose} disabled={busy}>
            {t('plots.detail.back')}
          </button>
          {status === 'pestRequired' && (
            <p className="form__message form__message--bad" role="alert">
              {t('log.form.pestRequired')}
            </p>
          )}
          {status === 'materialRequired' && (
            <p className="form__message form__message--bad" role="alert">
              {t('log.form.materialRequired')}
            </p>
          )}
          {status === 'forbidden' && (
            <p className="form__message form__message--bad" role="alert">
              {t('log.form.forbidden')}
            </p>
          )}
          {status === 'error' && (
            <p className="form__message form__message--bad" role="alert">
              {t('log.form.saveError')}
            </p>
          )}
        </div>
      </form>
    </Modal>
  );
}
