import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import {
  AREA_UNITS,
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
import { colors, fonts, fontSize, spacing } from '../theme/tokens';
import { formStyles } from '../theme/formStyles';
import { FormScreen } from '../components/FormScreen';
import { TilePicker, type TileAction, type TileOption } from '../components/TilePicker';
import type { PlotsStackParamList } from '../navigation/PlotsStack';

// Adding and editing a plot, one question per screen, every answer a square.
//
// **The second screen on the tile pattern, and a rollout rather than a
// redesign.** SprayEntrySheet was built as a template and approved on a device;
// this is the same walk applied to the plot form. Which field became a tile and
// which stayed a keyboard, and why the answer differs per field, is written out
// in packages/shared/src/plotForm.ts. The short version: the crop became a grid
// fed by the farm's own crop_cycles, the area unit became a grid that is never
// asked because it is a farm setting, and the name and the area stayed typed on
// purpose.
//
// ---- The taps, counted, because "too many clicks" is a standing complaint ----
//
// **Before**, adding a plot from the plots tab: press "new plot", tap the name
// box and type it, tap the area box and type it, tap the crop box and type it,
// press save. **Five taps and three keyboard fields**, on a form where the crop
// box was the one that used to disappear under the keyboard.
//
// **After**, on a farm that has grown this crop before: press "new plot", type
// the name into a box that is already focused and press continue, type the area
// and press continue, tap the crop, press save. **Five taps and two keyboard
// fields**, plus a review screen that did not exist. The walk is not longer; the
// third keyboard turned into one square.
//
// **After, on the very first plot of a brand new farm**: the crop grid has
// nothing in it, so it shows a sentence saying it will fill up and a dashed
// "new crop" square, which opens one box. **Six taps and three keyboard
// fields** -- one tap more than before, once, and from the second plot onwards
// it is the five above. That is the trade this pattern makes everywhere: the
// grid pays for itself out of the farm's own history.
//
// **Editing** opens straight on the review, because the review already is the
// summary of every field with a way into each one. Changing a name costs one
// tap more than the old form did (tile, edit, continue, save instead of box,
// edit, save) and that extra tap is the screen that shows what is about to be
// written.
//
// ---- The keyboard ----
//
// docs/open-items.md: every full-screen form on mobile must go through
// FormScreen, because that is where the KeyboardAvoidingView, the flexed
// ScrollView and keyboardShouldPersistTaps live, and a screen that skips it
// brings back the bug where the bottom field was cut off. **This screen still
// goes through it**, unchanged. It matters more here than it looks: two of the
// five steps put a text box and a "continue" button under a question, and
// keyboardShouldPersistTaps="handled" is what stops the first press on that
// button from being swallowed just to dismiss the keyboard.

type Nav = NativeStackNavigationProp<PlotsStackParamList, 'PlotForm'>;
type Route = RouteProp<PlotsStackParamList, 'PlotForm'>;

type Status = 'idle' | 'saving' | 'nameRequired' | 'cropNameRequired' | 'forbidden' | 'error';

export function PlotFormScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const plotId = route.params?.plotId;
  const isEdit = Boolean(plotId);

  const { farm } = useCurrentFarm(supabase);
  const detail = usePlotDetail(supabase, plotId ?? null);
  const settings = useFarmSettings(supabase);
  // The crop grid, out of this farm's own crop_cycles. Empty on a new account,
  // which is a real state and is answered below with a sentence and an add tile.
  const crops = useCropSuggestions(supabase, farm?.id ?? null);

  const [draft, setDraft] = useState<PlotDraft>(() => newPlotDraft());
  // An existing plot opens on the review: it already has every answer, and the
  // review is the only screen that shows them all at once.
  const [step, setStep] = useState<PlotStep>(isEdit ? 'review' : 'name');
  // Set when a tile on the review was tapped, so that answering the step it
  // jumped to comes straight back rather than walking the rest of the flow
  // again. Checking one value should cost two taps, not four.
  const [returnToReview, setReturnToReview] = useState(false);
  // The area is a number on the draft and a string in the box. They are
  // separate because "40," and "" are both states a box can be in and neither
  // is a number.
  const [areaText, setAreaText] = useState('');
  const [areaInvalid, setAreaInvalid] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addText, setAddText] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [prefilled, setPrefilled] = useState(false);

  // Loads the existing plot's values once, when the edit mode is ready. Without
  // the prefilled latch any refresh would overwrite what the farmer has already
  // typed -- the same guard the form has carried since it was one page.
  useEffect(() => {
    if (!isEdit || prefilled || !detail.plot) return;
    setDraft(plotDraftFromPlot(detail.plot));
    setAreaText(plotAreaInputText(detail.plot.area));
    setPrefilled(true);
  }, [isEdit, prefilled, detail.plot]);

  const busy = status === 'saving';
  // null while the farm settings are still in flight. plotAreaUnit resolves it
  // at render rather than at mount, so a farmer who set hectares does not get a
  // dunam plot just because his settings arrived a moment late.
  const farmAreaUnit = settings.form?.areaUnit ?? null;
  const areaUnit = plotAreaUnit(draft, farmAreaUnit);

  // One place decides where a tap lands, so the skip rule and the
  // came-from-review rule cannot disagree with each other.
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

  // **One back control, not two.** The chevron walks the flow backwards and
  // leaves the screen only when there is nothing left to walk back to. A screen
  // header with a "back" that leaves and a second "back" that steps is two
  // identical-looking exits with different meanings.
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
    if (previous) {
      setStep(previous);
      return;
    }
    navigation.goBack();
  }

  const position = plotStepPosition(step, draft);
  // **The counter is only shown while he is actually walking.** Coming back to
  // one value from the review is not step two of four, and saying so would be
  // telling him he is somewhere he is not.
  const subtitle = returnToReview
    ? undefined
    : `${position.index} ${t('common.stepOf')} ${position.total}`;

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
        navigation.goBack();
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
      navigation.goBack();
      return;
    }
    setStatus(result.reason);
  }

  if (isEdit && (detail.loading || detail.failed || !prefilled)) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <View style={styles.center}>
          <Text style={detail.failed ? formStyles.bad : styles.note}>
            {detail.failed ? t('plots.detail.loadError') : t('common.loading')}
          </Text>
        </View>
      </SafeAreaView>
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
    <FormScreen
      header={
        <View style={styles.header}>
          <Pressable
            onPress={goBack}
            accessibilityRole="button"
            accessibilityLabel={t('plots.detail.back')}
            hitSlop={12}
          >
            <ChevronRight size={28} strokeWidth={2} color={colors.ink900} />
          </Pressable>
          <Text style={styles.title}>
            {isEdit ? t('plots.form.titleEdit') : t('plots.form.titleNew')}
          </Text>
        </View>
      }
    >
      {step === 'name' ? (
        <TypedStep title={t(plotStepTitleKey('name'))} subtitle={subtitle} disabled={busy}>
          <TextInput
            style={formStyles.input}
            value={draft.name}
            onChangeText={(name) => setDraft({ ...draft, name })}
            editable={!busy}
            placeholder={t('plots.form.namePlaceholder')}
            placeholderTextColor={colors.slate600}
            textAlign="right"
            autoFocus
          />
          <ConfirmButton label={t('common.continue')} onPress={commitName} disabled={busy} />
        </TypedStep>
      ) : null}

      {step === 'area' ? (
        <TypedStep
          title={t(plotStepTitleKey('area'))}
          subtitle={subtitle}
          disabled={busy}
          // plots.area is nullable and always was. Without this square, a farmer
          // who does not know the size of a plot has an empty box and no way
          // past it that does not look like a mistake.
          actions={[skipArea]}
        >
          <TextInput
            style={formStyles.input}
            value={areaText}
            onChangeText={(next) => {
              setAreaText(next);
              setAreaInvalid(false);
            }}
            editable={!busy}
            keyboardType="decimal-pad"
            placeholder={t('plots.form.areaPlaceholder')}
            placeholderTextColor={colors.slate600}
            textAlign="right"
            importantForAutofill="no"
            autoFocus
          />
          {/* The unit the number will be stored in. It is not asked as a step,
              so this is where the farmer sees which one is being applied. */}
          <Text style={styles.hint}>{t(areaUnitLabelKey(areaUnit))}</Text>
          <ConfirmButton label={t('common.continue')} onPress={commitArea} disabled={busy} />
          {areaInvalid ? <Text style={formStyles.bad}>{t('plots.form.areaInvalid')}</Text> : null}
        </TypedStep>
      ) : null}

      {step === 'areaUnit' ? (
        // Reached only from the review, because the farm setting already
        // answered it. A closed set of three, so every value is a square and
        // there is no "add".
        <TilePicker
          title={t(plotStepTitleKey('areaUnit'))}
          subtitle={subtitle}
          options={AREA_UNITS.map((value) => ({ value, label: t(areaUnitLabelKey(value)) }))}
          selectedValue={areaUnit}
          onSelect={(value) => answered('areaUnit', { ...draft, areaUnit: value as AreaUnit })}
          disabled={busy}
        />
      ) : null}

      {step === 'crop' ? (
        <TilePicker
          title={t(plotStepTitleKey('crop'))}
          subtitle={subtitle}
          options={crops.crops.map((value) => ({ value, label: value }))}
          selectedValue={draft.cropName === '' ? null : draft.cropName}
          onSelect={(value) => answered('crop', { ...draft, cropName: value })}
          actions={[{ key: 'add', label: t('plots.form.addCrop'), onPress: () => setAdding(true) }]}
          // The first plot on a new account lands here with an empty grid. The
          // sentence plus the dashed square is what keeps that from reading as
          // a broken screen, and it is the single most important path in the
          // app for a new user.
          emptyHint={t('plots.form.emptyCrops')}
          disabled={busy}
          footer={
            adding ? (
              <View style={styles.answer}>
                <TextInput
                  style={formStyles.input}
                  value={addText}
                  onChangeText={setAddText}
                  editable={!busy}
                  placeholder={t('plots.form.cropNamePlaceholder')}
                  placeholderTextColor={colors.slate600}
                  textAlign="right"
                  autoFocus
                />
                <ConfirmButton
                  label={t('common.confirm')}
                  onPress={() => {
                    const cropName = addText.trim();
                    if (cropName) answered('crop', { ...draft, cropName });
                  }}
                  disabled={busy}
                />
              </View>
            ) : null
          }
        />
      ) : null}

      {step === 'review' ? (
        <TilePicker
          title={t(plotStepTitleKey('review'))}
          subtitle={subtitle}
          // The tiles are the answers, each captioned with the field it belongs
          // to, and each one a way back into the screen that set it. This is
          // what pays for skipping the unit question.
          options={reviewTiles(draft, areaUnit)}
          selectedValue={null}
          onSelect={(value) => jumpFromReview(value as PlotStep)}
          disabled={busy}
          footer={
            <View style={styles.answer}>
              <Pressable
                style={[formStyles.save, busy && formStyles.saveDisabled]}
                onPress={onSave}
                disabled={busy}
                accessibilityRole="button"
              >
                <Text style={formStyles.saveText}>
                  {busy ? t('plots.saving') : t('plots.save')}
                </Text>
              </Pressable>
            </View>
          }
        />
      ) : null}

      {status === 'nameRequired' || status === 'cropNameRequired' ? (
        <Text style={formStyles.bad}>{t(PLOT_BLOCKER_MESSAGE_KEYS[status])}</Text>
      ) : null}
      {status === 'forbidden' ? (
        <Text style={formStyles.bad}>{t('plots.form.forbidden')}</Text>
      ) : null}
      {status === 'error' ? <Text style={formStyles.bad}>{t('plots.form.saveError')}</Text> : null}
    </FormScreen>
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
    {
      value: 'areaUnit',
      label: t(areaUnitLabelKey(areaUnit)),
      caption: t(plotStepFieldKey('areaUnit')),
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
// the box sits in the footer, so the question, the step counter, the type sizes
// and the spacing are literally the same component on every screen of the walk
// rather than a second heading that has to be kept in step with the first. The
// component's own adoption guide shows this shape: a footer holding the input a
// grid cannot answer.
const NO_TILES: readonly TileOption[] = [];

function ignoreSelect() {
  // Unreachable: a grid with no tiles has nothing to select.
}

function TypedStep({
  title,
  subtitle,
  actions,
  disabled,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: readonly TileAction[];
  disabled: boolean;
  children: ReactNode;
}) {
  return (
    <TilePicker
      title={title}
      subtitle={subtitle}
      options={NO_TILES}
      selectedValue={null}
      onSelect={ignoreSelect}
      actions={actions}
      disabled={disabled}
      footer={<View style={styles.answer}>{children}</View>}
    />
  );
}

function ConfirmButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <Pressable
      style={[formStyles.save, disabled && formStyles.saveDisabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
    >
      <Text style={formStyles.saveText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s16,
    paddingHorizontal: spacing.s24,
    paddingTop: spacing.s16,
    paddingBottom: spacing.s8,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: fontSize.headingSm,
    color: colors.ink900,
    writingDirection: 'rtl',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: {
    fontFamily: fonts.regular,
    fontSize: fontSize.bodySm,
    color: colors.slate600,
    writingDirection: 'rtl',
  },
  // The box, its unit and the button that accepts them, as one block under the
  // question. Same gap the tile grid uses, so a typed step and a picked step
  // are the same distance apart.
  answer: {
    gap: spacing.s12,
    marginTop: spacing.s4,
  },
  hint: {
    fontFamily: fonts.regular,
    fontSize: fontSize.caption,
    color: colors.slate600,
    writingDirection: 'rtl',
    textAlign: 'right',
  },
});
