import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
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
import { colors, fonts, fontSize, spacing } from '../theme/tokens';
import { formStyles } from '../theme/formStyles';
import { FormScreen } from '../components/FormScreen';
import { DateField } from '../components/DateField';
import type { PlotsStackParamList } from '../navigation/PlotsStack';

// Adding and editing a plot, one screen, every field visible at once. The
// mobile half of frontend/web/src/screens/PlotFormScreen.tsx.
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
//
// Still goes through FormScreen, unchanged: docs/open-items.md's rule that
// every full-screen form needs the KeyboardAvoidingView/ScrollView pairing
// applies here just as much with six fields as it did with three steps.

type Nav = NativeStackNavigationProp<PlotsStackParamList, 'PlotForm'>;
type Route = RouteProp<PlotsStackParamList, 'PlotForm'>;

type Status =
  | 'idle'
  | 'saving'
  | 'nameRequired'
  | 'cropNameRequired'
  | 'forbidden'
  | 'error';

export function PlotFormScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const plotId = route.params?.plotId;
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

  // Loads the existing plot's values once, when the edit mode is ready. Without
  // the prefilled latch any refresh would overwrite what the farmer has already
  // typed.
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
  // null while the farm settings are still in flight. plotAreaUnit resolves it
  // at render rather than at mount, so a farmer who set hectares does not get a
  // dunam plot just because his settings arrived a moment late.
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

      navigation.goBack();
      return;
    }

    if (!farm) {
      setStatus('error');
      return;
    }
    const result = await createPlot(supabase, farm.id, plotCreateInput(nextDraft, farmAreaUnit));
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

  return (
    <FormScreen
      header={
        <View style={styles.header}>
          <Pressable
            onPress={() => navigation.goBack()}
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
      <View style={formStyles.field}>
        <Text style={formStyles.label}>{t('plots.form.name')}</Text>
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
      </View>

      <View style={formStyles.field}>
        <Text style={formStyles.label}>
          {t('plots.form.area')}
          <Text style={styles.hint}> · {t(areaUnitLabelKey(areaUnit))}</Text>
        </Text>
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
        />
        {areaInvalid ? <Text style={formStyles.bad}>{t('plots.form.areaInvalid')}</Text> : null}
      </View>

      <View style={formStyles.field}>
        <Text style={formStyles.label}>{t('plots.form.cropName')}</Text>
        <TextInput
          style={formStyles.input}
          value={draft.cropName}
          onChangeText={(cropName) => setDraft({ ...draft, cropName })}
          editable={!busy}
          placeholder={t('plots.form.cropNamePlaceholder')}
          placeholderTextColor={colors.slate600}
          textAlign="right"
        />
      </View>

      <View style={formStyles.field}>
        <Text style={formStyles.label}>{t('plots.forecast.yield')}</Text>
        <TextInput
          style={formStyles.input}
          value={yieldText}
          onChangeText={(next) => {
            setYieldText(next);
            setYieldInvalid(false);
          }}
          editable={!busy}
          keyboardType="decimal-pad"
          placeholder={t('common.numberPlaceholder')}
          placeholderTextColor={colors.slate600}
          textAlign="right"
          importantForAutofill="no"
        />
        {yieldInvalid ? <Text style={formStyles.bad}>{t('plots.form.numberInvalid')}</Text> : null}
      </View>

      <View style={formStyles.field}>
        <Text style={formStyles.label}>{t('plots.forecast.price')}</Text>
        <TextInput
          style={formStyles.input}
          value={priceText}
          onChangeText={(next) => {
            setPriceText(next);
            setPriceInvalid(false);
          }}
          editable={!busy}
          keyboardType="decimal-pad"
          placeholder={t('common.numberPlaceholder')}
          placeholderTextColor={colors.slate600}
          textAlign="right"
          importantForAutofill="no"
        />
        {priceInvalid ? <Text style={formStyles.bad}>{t('plots.form.numberInvalid')}</Text> : null}
      </View>

      <DateField
        label={t('plots.forecast.harvestDate')}
        value={draft.expectedHarvestDate}
        onChange={(value) => setDraft({ ...draft, expectedHarvestDate: value })}
        direction="future"
        shortcuts={false}
        clearLabel={t('plots.forecast.harvestDateClear')}
        disabled={busy}
      />

      <Pressable
        style={[formStyles.save, busy && formStyles.saveDisabled]}
        onPress={onSave}
        disabled={busy}
        accessibilityRole="button"
      >
        <Text style={formStyles.saveText}>{busy ? t('plots.saving') : t('plots.save')}</Text>
      </Pressable>

      {status === 'nameRequired' || status === 'cropNameRequired' ? (
        <Text style={formStyles.bad}>{t(PLOT_BLOCKER_MESSAGE_KEYS[status])}</Text>
      ) : null}
      {status === 'forbidden' ? <Text style={formStyles.bad}>{t('plots.form.forbidden')}</Text> : null}
      {status === 'error' ? <Text style={formStyles.bad}>{t('plots.form.saveError')}</Text> : null}
    </FormScreen>
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
  hint: {
    fontFamily: fonts.regular,
    fontSize: fontSize.caption,
    color: colors.slate600,
  },
});
