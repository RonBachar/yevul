import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  areaUnitLabelKey,
  createPlot,
  newPlotDraft,
  parsePlotAreaInput,
  plotAreaInputText,
  plotAreaUnit,
  plotCreateInput,
  plotDraftFromPlot,
  plotForecastChanged,
  plotFormBlocker,
  plotUpdateInput,
  setPlotCrop,
  PLOT_BLOCKER_MESSAGE_KEYS,
  t,
  updateForecast,
  updatePlot,
  useCurrentFarm,
  useFarmSettings,
  usePlotDetail,
  type PlotDraft,
} from '@yevul/shared';
import { supabase } from '../lib/supabase';
import { DateField } from '../components/DateField';
import '../styles/form.css';

// Adding and editing a plot, one screen, every field visible at once. The
// browser half of frontend/mobile/src/screens/PlotFormScreen.tsx.
//
// **This replaced a five-step tile walk.** Spec item 4 of
// docs/spec-money-and-tasks.md section 4: "טופס החלקה הופך למסך פרופיל אחד",
// stepper gone, no "בדקו ושמרו" review screen. Create and edit share this one
// screen, exactly as the walk did, but there is no longer a walk to share.
//
// The crop field is free text -- spec item 4 refuses a tile grid or a closed
// list outright -- and the three forecast fields (יבול צפוי, מחיר משוער,
// מועד קטיף משוער) are new here, previously reachable only from the "עדכון
// צפי" tab on the plot detail screen. See plotForm.ts for what a draft holds
// and what the save writes.

type Status =
  | 'idle'
  | 'saving'
  | 'nameRequired'
  | 'cropNameRequired'
  | 'forbidden'
  | 'error';

export function PlotFormScreen() {
  const navigate = useNavigate();
  const { plotId } = useParams<{ plotId: string }>();
  const isEdit = Boolean(plotId);

  const { farm } = useCurrentFarm(supabase);
  const detail = usePlotDetail(supabase, plotId ?? null);
  const settings = useFarmSettings(supabase);

  const [draft, setDraft] = useState<PlotDraft>(() => newPlotDraft());
  const [areaText, setAreaText] = useState('');
  const [areaInvalid, setAreaInvalid] = useState(false);
  const [yieldText, setYieldText] = useState('');
  const [yieldInvalid, setYieldInvalid] = useState(false);
  const [priceText, setPriceText] = useState('');
  const [priceInvalid, setPriceInvalid] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [prefilled, setPrefilled] = useState(false);

  useEffect(() => {
    if (!isEdit || prefilled || !detail.plot) return;
    // שם הגידול והתחזית מגיעים ממחזור הגידול ולא מהחלקה, כי שניהם
    // נכתבים על crop_cycles ולא על plots.
    const next = plotDraftFromPlot(detail.plot, detail.cropCycle?.name ?? null, detail.cropCycle);
    setDraft(next);
    setAreaText(plotAreaInputText(detail.plot.area));
    setYieldText(plotAreaInputText(next.expectedYieldPerArea));
    setPriceText(plotAreaInputText(next.expectedPricePerUnit));
    setPrefilled(true);
  }, [isEdit, prefilled, detail.plot, detail.cropCycle]);

  const busy = status === 'saving';
  const farmAreaUnit = settings.form?.areaUnit ?? null;
  const areaUnit = plotAreaUnit(draft, farmAreaUnit);

  async function onSave() {
    const area = parsePlotAreaInput(areaText);
    const expectedYieldPerArea = parsePlotAreaInput(yieldText);
    const expectedPricePerUnit = parsePlotAreaInput(priceText);
    // undefined is "what is in the box is not a number", for any of the three --
    // see parsePlotAreaInput. All three are flagged before the guard below, so
    // a farmer who mistyped two fields sees both at once rather than one at a
    // time across two submits; the guard itself checks the same three
    // variables so TypeScript narrows all of them past this point.
    setAreaInvalid(area === undefined);
    setYieldInvalid(expectedYieldPerArea === undefined);
    setPriceInvalid(expectedPricePerUnit === undefined);
    if (area === undefined || expectedYieldPerArea === undefined || expectedPricePerUnit === undefined) {
      return;
    }

    const nextDraft: PlotDraft = { ...draft, area, expectedYieldPerArea, expectedPricePerUnit };

    const blocker = plotFormBlocker(nextDraft);
    if (blocker) {
      setStatus(blocker);
      return;
    }

    setDraft(nextDraft);
    setStatus('saving');

    if (isEdit && plotId) {
      const updateInput = plotUpdateInput(nextDraft, farmAreaUnit);
      const result = await updatePlot(supabase, plotId, updateInput);
      if (!result.ok) {
        setStatus(result.reason);
        return;
      }

      // **The crop name is a second write, because it is not a column on the
      // plot.** It lives on the plot's current crop_cycle, and updateInput
      // cannot carry it there -- UpdatePlotInput is the shape of the `plots`
      // row. setPlotCrop creates the cycle if there is none, exactly like
      // createPlot does.
      const cropResult = await setPlotCrop(
        supabase,
        // Only reachable with a farm loaded: this screen is behind the plot list,
        // which does not render without one.
        farm?.id ?? '',
        plotId,
        detail.cropCycle?.id ?? null,
        nextDraft.cropName,
      );
      if (!cropResult.ok) {
        setStatus(cropResult.reason === 'nameRequired' ? 'cropNameRequired' : cropResult.reason);
        return;
      }

      // **The forecast is a third write, and only when a forecast value
      // actually moved.** A plot with no crop_cycle at all is the same edge
      // case the detail screen's own forecast tab already lives with -- it is
      // only reachable once a cycle exists. The equality check is not an
      // optimisation: updateForecast resets forecast_updated_at, which is the
      // staleness clock behind the "still right?" nudge, and firing it on
      // every rename would retire that nudge for good. See plotForecastChanged.
      const cropCycle = detail.cropCycle;
      if (cropCycle && plotForecastChanged(cropCycle, updateInput)) {
        const forecastResult = await updateForecast(supabase, cropCycle.id, {
          expectedYieldPerArea: updateInput.expectedYieldPerArea,
          expectedPricePerUnit: updateInput.expectedPricePerUnit,
          expectedHarvestDate: updateInput.expectedHarvestDate,
        });
        if (!forecastResult.ok) {
          setStatus(forecastResult.reason);
          return;
        }
      }

      navigate(`/plots/${plotId}`);
      return;
    }

    if (!farm) {
      setStatus('error');
      return;
    }
    const result = await createPlot(supabase, farm.id, plotCreateInput(nextDraft, farmAreaUnit));
    if (result.ok) {
      navigate(`/plots/${result.plotId}`);
      return;
    }
    setStatus(result.reason);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void onSave();
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
            value={draft.name}
            placeholder={t('plots.form.namePlaceholder')}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            disabled={busy}
            autoFocus
          />
        </div>

        <div className="form__row">
          <label className="form__label" htmlFor="plot-area">
            {t('plots.form.area')}
            <span className="form__label-unit"> · {t(areaUnitLabelKey(areaUnit))}</span>
          </label>
          <input
            id="plot-area"
            className="form__input"
            type="number"
            step="any"
            min="0"
            value={areaText}
            placeholder={t('plots.form.areaPlaceholder')}
            onChange={(e) => {
              setAreaText(e.target.value);
              setAreaInvalid(false);
            }}
            disabled={busy}
          />
          {areaInvalid && (
            <p className="form__message form__message--bad" role="alert">
              {t('plots.form.areaInvalid')}
            </p>
          )}
        </div>

        <div className="form__row">
          <label className="form__label" htmlFor="plot-crop">
            {t('plots.form.cropName')}
          </label>
          <input
            id="plot-crop"
            className="form__input"
            type="text"
            value={draft.cropName}
            placeholder={t('plots.form.cropNamePlaceholder')}
            onChange={(e) => setDraft({ ...draft, cropName: e.target.value })}
            disabled={busy}
          />
        </div>

        <div className="form__row">
          <label className="form__label" htmlFor="plot-yield">
            {t('plots.forecast.yield')}
          </label>
          <input
            id="plot-yield"
            className="form__input"
            type="number"
            step="any"
            min="0"
            value={yieldText}
            placeholder={t('common.numberPlaceholder')}
            onChange={(e) => {
              setYieldText(e.target.value);
              setYieldInvalid(false);
            }}
            disabled={busy}
          />
          {yieldInvalid && (
            <p className="form__message form__message--bad" role="alert">
              {t('plots.form.numberInvalid')}
            </p>
          )}
        </div>

        <div className="form__row">
          <label className="form__label" htmlFor="plot-price">
            {t('plots.forecast.price')}
          </label>
          <input
            id="plot-price"
            className="form__input"
            type="number"
            step="any"
            min="0"
            value={priceText}
            placeholder={t('common.numberPlaceholder')}
            onChange={(e) => {
              setPriceText(e.target.value);
              setPriceInvalid(false);
            }}
            disabled={busy}
          />
          {priceInvalid && (
            <p className="form__message form__message--bad" role="alert">
              {t('plots.form.numberInvalid')}
            </p>
          )}
        </div>

        <DateField
          id="plot-harvest-date"
          label={t('plots.forecast.harvestDate')}
          value={draft.expectedHarvestDate}
          onChange={(value) => setDraft({ ...draft, expectedHarvestDate: value })}
          direction="future"
          shortcuts={false}
          clearLabel={t('plots.forecast.harvestDateClear')}
          disabled={busy}
        />

        <div className="form__actions">
          <button type="submit" className="form__submit" disabled={busy}>
            {busy ? t('plots.saving') : t('plots.save')}
          </button>
          <button type="button" className="form__cancel" onClick={() => navigate(-1)} disabled={busy}>
            {t('plots.detail.back')}
          </button>
          {(status === 'nameRequired' || status === 'cropNameRequired') && (
            <p className="form__message form__message--bad" role="alert">
              {t(PLOT_BLOCKER_MESSAGE_KEYS[status])}
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
