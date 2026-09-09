import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  areaUnitLabelKey,
  createPlot,
  formatArea,
  newPlotDraft,
  nextPlotStep,
  parsePlotAreaInput,
  plotAreaInputText,
  plotAreaUnit,
  plotCreateInput,
  plotDraftFromPlot,
  plotFormBlocker,
  plotStepFieldKey,
  plotStepPosition,
  plotStepTitleKey,
  plotUpdateInput,
  previousPlotStep,
  PLOT_BLOCKER_MESSAGE_KEYS,
  t,
  updatePlot,
  useCropSuggestions,
  useCurrentFarm,
  useFarmSettings,
  usePlotDetail,
  type AreaUnit,
  type PlotDraft,
  type PlotStep,
} from '@yevul/shared';
import { supabase } from '../lib/supabase';
import { TilePicker, type TileAction, type TileOption } from '../components/TilePicker';
import '../styles/form.css';

// Adding and editing a plot, one question per screen, every answer a square.
// The browser half of frontend/mobile/src/screens/PlotFormScreen.tsx.
//
// **Both clients get the pattern in the same change.** docs/open-items.md
// recorded that the tiles existed on mobile only, and on exactly one spray
// screen there; the plot form is the first screen where the web is converted
// alongside the phone rather than left behind. Every decision the walk makes --
// which fields are tiles, which steps are skipped, what stops the save -- is
// read out of packages/shared/src/plotForm.ts, so the two clients cannot
// disagree about the flow, only about the tags they draw it with.
//
// **What was here before was one page of four boxes**: a name, a number, a
// <select> of area units and a crop name. The name and the number are still
// typed, for the reasons written out in plotForm.ts; the <select> became a grid
// that is never asked because the unit is a farm setting; and the crop name
// became a grid fed by the farm's own crop_cycles.
//
// The taps, counted, are in the mobile file's header. In the browser the count
// is the same, with clicks in place of taps.

type Status = 'idle' | 'saving' | 'nameRequired' | 'cropNameRequired' | 'forbidden' | 'error';

export function PlotFormScreen() {
  const navigate = useNavigate();
  const { plotId } = useParams<{ plotId: string }>();
  const isEdit = Boolean(plotId);

  const { farm } = useCurrentFarm(supabase);
  const detail = usePlotDetail(supabase, plotId ?? null);
  const settings = useFarmSettings(supabase);
  const crops = useCropSuggestions(supabase, farm?.id ?? null);

  const [draft, setDraft] = useState<PlotDraft>(() => newPlotDraft());
  // An existing plot opens on the review: it already has every answer, and the
  // review is the only screen that shows them all at once.
  const [step, setStep] = useState<PlotStep>(isEdit ? 'review' : 'name');
  const [returnToReview, setReturnToReview] = useState(false);
  const [areaText, setAreaText] = useState('');
  const [areaInvalid, setAreaInvalid] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addText, setAddText] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [prefilled, setPrefilled] = useState(false);

  useEffect(() => {
    if (!isEdit || prefilled || !detail.plot) return;
    // שם הגידול מגיע ממחזור הגידול ולא מהחלקה, כי הגידול נכנס לטופס
    // החלקה אחרי שמסך "עריכת גידול" הנפרד בוטל.
    setDraft(plotDraftFromPlot(detail.plot, detail.cropCycle?.name ?? null));
    setAreaText(plotAreaInputText(detail.plot.area));
    setPrefilled(true);
  }, [isEdit, prefilled, detail.plot, detail.cropCycle]);

  const busy = status === 'saving';
  const farmAreaUnit = settings.form?.areaUnit ?? null;
  const areaUnit = plotAreaUnit(draft, farmAreaUnit);

  function answered(current: PlotStep, next: PlotDraft) {
    setDraft(next);
    setAdding(false);
    setAddText('');
    setAreaInvalid(false);
    setStatus('idle');
    setStep(returnToReview ? 'review' : nextPlotStep(current, next));
    setReturnToReview(false);
  }

  function jumpFromReview(target: PlotStep) {
    setReturnToReview(true);
    setAdding(false);
    setAddText('');
    setStatus('idle');
    setStep(target);
  }

  function goBack() {
    if (adding) {
      setAdding(false);
      return;
    }
    if (returnToReview) {
      setReturnToReview(false);
      setStep('review');
      return;
    }
    const previous = previousPlotStep(step, draft);
    if (previous) setStep(previous);
  }

  const position = plotStepPosition(step, draft);
  const subtitle = returnToReview
    ? undefined
    : `${position.index} ${t('common.stepOf')} ${position.total}`;
  const canGoBack = adding || returnToReview || previousPlotStep(step, draft) !== null;

  function commitName() {
    if (!draft.name.trim()) {
      setStatus('nameRequired');
      return;
    }
    answered('name', draft);
  }

  function commitArea() {
    const area = parsePlotAreaInput(areaText);
    // undefined is "what is in the box is not a number", which must not quietly
    // become a plot with no area. See parsePlotAreaInput.
    if (area === undefined) {
      setAreaInvalid(true);
      return;
    }
    answered('area', { ...draft, area });
  }

  async function onSave() {
    const blocker = plotFormBlocker(draft);
    if (blocker) {
      setStatus(blocker);
      return;
    }

    setStatus('saving');

    if (isEdit && plotId) {
      const result = await updatePlot(supabase, plotId, plotUpdateInput(draft, farmAreaUnit));
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
    const result = await createPlot(supabase, farm.id, plotCreateInput(draft, farmAreaUnit));
    if (result.ok) {
      navigate(`/plots/${result.plotId}`);
      return;
    }
    setStatus(result.reason);
  }

  // **The form still submits, and it submits the step rather than the record.**
  // Enter inside the name box moves on; Enter on the review saves. A single
  // onSubmit wired to the save would have made the return key write a plot from
  // the first screen of the walk.
  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (step === 'name') {
      commitName();
      return;
    }
    if (step === 'area') {
      commitArea();
      return;
    }
    if (step === 'review') void onSave();
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

  const skipArea: TileAction = {
    key: 'skip',
    label: t('plots.form.skipArea'),
    onPress: () => {
      setAreaText('');
      answered('area', { ...draft, area: null });
    },
  };

  return (
    <div className="screen">
      <h1 className="screen__title">
        {isEdit ? t('plots.form.titleEdit') : t('plots.form.titleNew')}
      </h1>

      <form className="form" onSubmit={onSubmit} noValidate>
        {canGoBack && (
          <div className="form__actions">
            <button type="button" className="form__cancel" onClick={goBack} disabled={busy}>
              {t('plots.detail.back')}
            </button>
          </div>
        )}

        {step === 'name' && (
          <TypedStep
            id="plot-step-name"
            title={t(plotStepTitleKey('name'))}
            subtitle={subtitle}
            disabled={busy}
          >
            <input
              id="plot-name"
              className="form__input"
              type="text"
              value={draft.name}
              placeholder={t('plots.form.namePlaceholder')}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              disabled={busy}
              aria-labelledby="plot-step-name"
              autoFocus
            />
            <button type="submit" className="form__submit" disabled={busy}>
              {t('common.continue')}
            </button>
          </TypedStep>
        )}

        {step === 'area' && (
          <TypedStep
            id="plot-step-area"
            title={t(plotStepTitleKey('area'))}
            subtitle={subtitle}
            disabled={busy}
            // plots.area is nullable and always was. Without this square, a
            // farmer who does not know the size of a plot has an empty box and
            // no way past it that does not look like a mistake.
            actions={[skipArea]}
          >
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
              aria-labelledby="plot-step-area"
              autoFocus
            />
            {/* The unit the number will be stored in. It is not asked as a
                step, so this is where the farmer sees which one is applied. */}
            <span className="tile-picker__hint">{t(areaUnitLabelKey(areaUnit))}</span>
            <button type="submit" className="form__submit" disabled={busy}>
              {t('common.continue')}
            </button>
            {areaInvalid && (
              <p className="form__message form__message--bad" role="alert">
                {t('plots.form.areaInvalid')}
              </p>
            )}
          </TypedStep>
        )}

        {step === 'crop' && (
          <TilePicker
            id="plot-step-crop"
            title={t(plotStepTitleKey('crop'))}
            subtitle={subtitle}
            options={crops.crops.map((value) => ({ value, label: value }))}
            selectedValue={draft.cropName === '' ? null : draft.cropName}
            onSelect={(value) => answered('crop', { ...draft, cropName: value })}
            actions={[
              { key: 'add', label: t('plots.form.addCrop'), onPress: () => setAdding(true) },
            ]}
            // The first plot on a new account lands here with an empty grid.
            // The sentence plus the dashed square is what keeps that from
            // reading as a broken screen, and it is the single most important
            // path in the app for a new user.
            emptyHint={t('plots.form.emptyCrops')}
            disabled={busy}
            footer={
              adding ? (
                <div className="tile-picker__footer">
                  <input
                    id="crop-name"
                    className="form__input"
                    type="text"
                    value={addText}
                    placeholder={t('plots.form.cropNamePlaceholder')}
                    onChange={(e) => setAddText(e.target.value)}
                    disabled={busy}
                    aria-labelledby="plot-step-crop"
                    autoFocus
                  />
                  <button
                    type="button"
                    className="form__submit"
                    disabled={busy}
                    onClick={() => {
                      const cropName = addText.trim();
                      if (cropName) answered('crop', { ...draft, cropName });
                    }}
                  >
                    {t('common.confirm')}
                  </button>
                </div>
              ) : null
            }
          />
        )}

        {step === 'review' && (
          <TilePicker
            id="plot-step-review"
            title={t(plotStepTitleKey('review'))}
            subtitle={subtitle}
            // The tiles are the answers, each captioned with the field it
            // belongs to, and each one a way back into the screen that set it.
            // This is what pays for skipping the unit question.
            options={reviewTiles(draft, areaUnit)}
            selectedValue={null}
            onSelect={(value) => jumpFromReview(value as PlotStep)}
            disabled={busy}
            footer={
              <div className="tile-picker__footer">
                <button type="submit" className="form__submit" disabled={busy}>
                  {busy ? t('plots.saving') : t('plots.save')}
                </button>
              </div>
            }
          />
        )}

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
      </form>
    </div>
  );
}

// The review grid. `value` is the step to jump to rather than the answer, which
// is what lets TilePicker be reused here unchanged -- it hands back whatever
// identity it was given.
function reviewTiles(draft: PlotDraft, areaUnit: AreaUnit): TileOption[] {
  const tiles: TileOption[] = [
    {
      value: 'name',
      label: draft.name.trim() || t('plots.form.notSet'),
      caption: t(plotStepFieldKey('name')),
    },
    {
      value: 'area',
      // The number with its unit, never the bare number. "40" is not an area
      // and the profit forecast multiplies by it.
      label: draft.area === null ? t('plots.form.notSet') : formatArea(draft.area, areaUnit),
      caption: t(plotStepFieldKey('area')),
    },
  ];

  // An edit does not carry a crop: it belongs to the CropCycle, updatePlot does
  // not touch it, and the old form hid its box on an edit for the same reason.
  if (draft.mode === 'create') {
    tiles.push({
      value: 'crop',
      label: draft.cropName.trim() || t('plots.form.notSet'),
      caption: t(plotStepFieldKey('crop')),
    });
  }

  return tiles;
}

// **A step whose answer is typed is still a TilePicker.** The grid is empty and
// the box sits in the footer, so the question, the step counter and the spacing
// are literally the same component on every screen of the walk rather than a
// second heading that has to be kept in step with the first.
const NO_TILES: readonly TileOption[] = [];

function ignoreSelect() {
  // Unreachable: a grid with no tiles has nothing to select.
}

function TypedStep({
  id,
  title,
  subtitle,
  actions,
  disabled,
  children,
}: {
  id: string;
  title: string;
  subtitle?: string;
  actions?: readonly TileAction[];
  disabled: boolean;
  children: ReactNode;
}) {
  return (
    <TilePicker
      id={id}
      title={title}
      subtitle={subtitle}
      options={NO_TILES}
      selectedValue={null}
      onSelect={ignoreSelect}
      actions={actions}
      disabled={disabled}
      footer={<div className="tile-picker__footer">{children}</div>}
    />
  );
}
