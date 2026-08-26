import { useEffect, useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createLogEntry,
  logEntryTypeLabelKey,
  LOG_ENTRY_TYPES,
  safeHarvestDate,
  t,
  updateLogEntry,
  usePlots,
  useSpraySuggestions,
  type LogEntry,
  type LogEntryType,
} from '@yevul/shared';
import { Modal } from './Modal';
import './LogEntrySheet.css';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// גיליון יצירה/עריכה של רשומת יומן בווב, design.md "Log Entry Sheet",
// כדיאלוג ממורכז (Modal) במקום גיליון תחתון, אותה הפרדה שכבר קיימת
// בין הלקוחות ל-TaskSheet. שדה סוג הוא תפריט נפתח כאן, שורת צ'יפים
// בנייד, ותאריך הוא שדה date טבעי כי אין כאן את המגבלה של בורר native
// בלי תלות שדחתה את זה בנייד.
export function LogEntrySheet({
  supabase,
  open,
  onClose,
  entry,
  defaultPlotId,
  farmId,
  onSaved,
}: {
  supabase: SupabaseClient;
  open: boolean;
  onClose: () => void;
  entry: LogEntry | null;
  defaultPlotId: string | null;
  farmId: string | null;
  onSaved: () => void;
}) {
  const plotsState = usePlots(supabase);
  const suggestions = useSpraySuggestions(supabase, farmId);

  const [type, setType] = useState<LogEntryType>('other');
  const [plotId, setPlotId] = useState<string | null>(null);
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const [sprayPest, setSprayPest] = useState('');
  const [sprayMaterial, setSprayMaterial] = useState('');
  const [sprayDose, setSprayDose] = useState('');
  const [sprayPhiDays, setSprayPhiDays] = useState('');
  const [harvestQty, setHarvestQty] = useState('');
  const [harvestUnit, setHarvestUnit] = useState('');
  const [status, setStatus] = useState<
    'idle' | 'saving' | 'pestRequired' | 'materialRequired' | 'forbidden' | 'error'
  >('idle');
  const busy = status === 'saving';

  useEffect(() => {
    if (!open) return;
    if (entry) {
      setType(entry.type);
      setPlotId(entry.plotId);
      setDate(entry.date);
      setNote(entry.note ?? '');
      setSprayPest(entry.sprayPest ?? '');
      setSprayMaterial(entry.sprayMaterial ?? '');
      setSprayDose(entry.sprayDose ?? '');
      setSprayPhiDays(entry.sprayPhiDays != null ? String(entry.sprayPhiDays) : '');
      setHarvestQty(entry.harvestQty != null ? String(entry.harvestQty) : '');
      setHarvestUnit(entry.harvestUnit ?? '');
    } else {
      setType('other');
      setPlotId(defaultPlotId);
      setDate(today());
      setNote('');
      setSprayPest('');
      setSprayMaterial('');
      setSprayDose('');
      setSprayPhiDays('');
      setHarvestQty('');
      setHarvestUnit('');
    }
    setStatus('idle');
  }, [open, entry, defaultPlotId]);

  const phiDaysNumber = sprayPhiDays.trim() ? Number(sprayPhiDays) : null;
  const safeHarvest =
    type === 'spray' && date && phiDaysNumber != null && Number.isFinite(phiDaysNumber)
      ? safeHarvestDate(date, phiDaysNumber)
      : null;

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
            <div className="form__row">
              <label className="form__label" htmlFor="log-spray-material">
                {t('log.form.sprayMaterial')}
              </label>
              <input
                id="log-spray-material"
                className="form__input"
                type="text"
                list="log-spray-material-options"
                value={sprayMaterial}
                placeholder={t('log.form.sprayMaterialPlaceholder')}
                onChange={(e) => setSprayMaterial(e.target.value)}
                disabled={busy}
              />
              <datalist id="log-spray-material-options">
                {suggestions.materials.map((value) => (
                  <option key={value} value={value} />
                ))}
              </datalist>
            </div>
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

        <div className="form__row">
          <label className="form__label" htmlFor="log-date">
            {t('log.form.date')}
          </label>
          <input
            id="log-date"
            className="form__input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={busy}
          />
        </div>

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
