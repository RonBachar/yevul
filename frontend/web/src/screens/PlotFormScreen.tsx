import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AREA_UNITS,
  areaUnitLabelKey,
  createPlot,
  t,
  updatePlot,
  useCurrentFarm,
  useFarmSettings,
  usePlotDetail,
  type AreaUnit,
} from '@yevul/shared';
import { supabase } from '../lib/supabase';
import '../styles/form.css';

type Status = 'idle' | 'saving' | 'nameRequired' | 'cropNameRequired' | 'forbidden' | 'error';

// יצירה ועריכה של חלקה על אותו מסך, כדי לא לשכפל את הטופס, אותה
// גישה כמו בנייד. במצב יצירה מופיע גם שדה שם הגידול, לפי prd.md:
// "חלקה היא שם, שטח, ומה גדל בה, זה כל מה שנדרש כדי להתחיל". יבול
// ומחיר צפויים לא נשאלים כאן בכלל, הם ממתינים לכפתור עדכון צפי במסך
// פרטי החלקה. עונה נקבעת אוטומטית לשנה הנוכחית.
export function PlotFormScreen() {
  const navigate = useNavigate();
  const { plotId } = useParams<{ plotId: string }>();
  const isEdit = Boolean(plotId);

  const { farm } = useCurrentFarm(supabase);
  const detail = usePlotDetail(supabase, plotId ?? null);
  const settings = useFarmSettings(supabase);

  const [name, setName] = useState('');
  const [areaText, setAreaText] = useState('');
  // null עד שידוע מה לבחור, ואז נגזר מהגדרות המשק. קודם ישב כאן 'dunam'
  // קשיח, כך שחקלאי שהגדיר הקטאר בהגדרות קיבל דונם בכל חלקה חדשה,
  // כלומר ההגדרה שהוא בחר במפורש נעקפה בשקט.
  const [areaUnit, setAreaUnit] = useState<AreaUnit | null>(null);
  const [cropName, setCropName] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [prefilled, setPrefilled] = useState(false);

  useEffect(() => {
    if (isEdit && !prefilled && detail.plot) {
      setName(detail.plot.name);
      setAreaText(detail.plot.area != null ? String(detail.plot.area) : '');
      setAreaUnit(detail.plot.areaUnit ?? settings.form?.areaUnit ?? 'dunam');
      setPrefilled(true);
    }
  }, [isEdit, prefilled, detail.plot, settings.form?.areaUnit]);

  // בחלקה חדשה היחידה נגזרת מהגדרות המשק ברגע שהן נטענו, אלא אם
  // המשתמש כבר בחר במפורש (אז areaUnit כבר לא null ולא נדרס).
  const effectiveAreaUnit = areaUnit ?? settings.form?.areaUnit ?? 'dunam';

  const busy = status === 'saving';

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const area = areaText.trim() === '' ? null : Number(areaText.replace(',', '.'));
    setStatus('saving');

    if (isEdit && plotId) {
      const result = await updatePlot(supabase, plotId, {
        name,
        area,
        areaUnit: effectiveAreaUnit,
      });
      if (result.ok) {
        navigate(`/plots/${plotId}`);
        return;
      }
      setStatus(result.reason);
      return;
    }

    if (!farm) {
      setStatus('error');
      return;
    }
    const result = await createPlot(supabase, farm.id, {
      name,
      area,
      areaUnit: effectiveAreaUnit,
      cropName,
    });
    if (result.ok) {
      navigate(`/plots/${result.plotId}`);
      return;
    }
    setStatus(result.reason);
  }

  if (isEdit && (detail.loading || detail.failed || !prefilled)) {
    return (
      <div className="screen">
        <h1 className="screen__title">{t('plots.form.titleEdit')}</h1>
        {detail.failed ? (
          <p className="form__message form__message--bad" role="alert">
            {t('plots.detail.loadError')}
          </p>
        ) : (
          <p className="screen__note">{t('common.loading')}</p>
        )}
      </div>
    );
  }

  return (
    <div className="screen">
      <h1 className="screen__title">
        {isEdit ? t('plots.form.titleEdit') : t('plots.form.titleNew')}
      </h1>

      <form className="form" onSubmit={onSubmit} noValidate>
        <div className="form__row">
          <label className="form__label" htmlFor="plot-name">
            {t('plots.form.name')}
          </label>
          <input
            id="plot-name"
            className="form__input"
            type="text"
            value={name}
            placeholder={t('plots.form.namePlaceholder')}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
          />
        </div>

        <div className="form__row">
          <label className="form__label" htmlFor="plot-area">
            {t('plots.form.area')}
          </label>
          <input
            id="plot-area"
            className="form__input"
            type="number"
            step="any"
            placeholder={t('plots.form.areaPlaceholder')}
            value={areaText}
            onChange={(e) => setAreaText(e.target.value)}
            disabled={busy}
          />
        </div>

        <div className="form__row">
          <label className="form__label" htmlFor="plot-area-unit">
            {t('settings.areaUnit')}
          </label>
          <select
            id="plot-area-unit"
            className="form__input"
            value={effectiveAreaUnit}
            onChange={(e) => setAreaUnit(e.target.value as AreaUnit)}
            disabled={busy}
          >
            {AREA_UNITS.map((option) => (
              <option key={option} value={option}>
                {t(areaUnitLabelKey(option))}
              </option>
            ))}
          </select>
        </div>

        {!isEdit && (
          <div className="form__row">
            <label className="form__label" htmlFor="crop-name">
              {t('plots.form.cropName')}
            </label>
            <input
              id="crop-name"
              className="form__input"
              type="text"
              value={cropName}
              placeholder={t('plots.form.cropNamePlaceholder')}
              onChange={(e) => setCropName(e.target.value)}
              disabled={busy}
            />
          </div>
        )}

        <div className="form__actions">
          <button type="submit" className="form__submit" disabled={busy}>
            {busy ? t('plots.saving') : t('plots.save')}
          </button>

          {status === 'nameRequired' && (
            <p className="form__message form__message--bad" role="alert">
              {t('plots.form.nameRequired')}
            </p>
          )}
          {status === 'cropNameRequired' && (
            <p className="form__message form__message--bad" role="alert">
              {t('plots.form.cropNameRequired')}
            </p>
          )}
          {status === 'forbidden' && (
            <p className="form__message form__message--bad" role="alert">
              {t('plots.form.forbidden')}
            </p>
          )}
          {status === 'error' && (
            <p className="form__message form__message--bad" role="alert">
              {t('plots.form.saveError')}
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
