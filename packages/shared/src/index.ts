export const SHARED_PACKAGE_VERSION = '0.0.1';

export { safeHarvestDate } from './safeHarvestDate';
export { t } from './i18n';
export { useAuthSession, type AuthState } from './auth';
export { colors } from './colors';
export { spacing, radius, fontSize, fontWeight, touchTarget, shadowFloat } from './tokens';
export {
  CURRENCIES,
  AREA_UNITS,
  LOCALES,
  currencyLabelKey,
  areaUnitLabelKey,
  localeLabelKey,
  type Currency,
  type AreaUnit,
  type Locale,
  type FarmSettings,
} from './settings';
export {
  useFarmSettings,
  type FarmSettingsForm,
  type FarmSettingsState,
  type SaveResult,
} from './useFarmSettings';
