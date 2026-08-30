export const SHARED_PACKAGE_VERSION = '0.0.1';

export { safeHarvestDate, openSafeHarvestDate, isCalendarDate } from './safeHarvestDate';
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
} from './settings';
export { useFarmSettings, type FarmSettingsForm } from './useFarmSettings';
export {
  currentFarmQuery,
  useCurrentFarm,
  type CurrentFarm,
  type CurrentFarmState,
} from './currentFarm';
export { writeOutcome, type WriteOutcome } from './postgrest';
export {
  formatNumber,
  formatArea,
  formatMonthName,
  formatAmount,
  scaledAmountFontSize,
  currencySymbol,
  yieldRateUnitLabel,
  priceUnitLabel,
  formatSignedAmount,
  profitTone,
  type ProfitTone,
} from './format';
export {
  usePlots,
  usePlotDetail,
  plotSummaryLine,
  expectedYieldDisplay,
  expectedPriceDisplay,
  YIELD_UNIT_PRESET_KEYS,
  yieldUnitPresets,
  isCustomYieldUnit,
  expectedIncomeFor,
  plotProfitForecast,
  staleForecastSince,
  type PlotProfitForecast,
  createPlot,
  updatePlot,
  updateCropCycle,
  updateForecast,
  type Plot,
  type CropCycle,
  type PlotWithCropCycle,
  type PlotsListState,
  type PlotDetailState,
  type CreatePlotInput,
  type CreatePlotResult,
  type UpdatePlotInput,
  type UpdatePlotResult,
  type UpdateCropCycleInput,
  type UpdateCropCycleResult,
  type UpdateForecastInput,
  type UpdateForecastResult,
} from './plots';
export {
  useTasks,
  createTask,
  updateTask,
  completeTask,
  snoozeTask,
  archiveTask,
  deleteTask,
  taskCostMemory,
  rememberTaskCost,
  normalizeTaskTitle,
  taskDueDisplay,
  groupTasksByUrgency,
  shouldAutoArchive,
  type Task,
  type TasksListState,
  type TaskInput,
  type TaskWriteResult,
  type DueTone,
  type DueDisplay,
  type UrgencyGroupKey,
  type UrgencyGroup,
} from './tasks';
export {
  useExpenses,
  createExpense,
  updateExpense,
  attachReceipt,
  type Expense,
  type ExpenseSource,
  type ExpenseInput,
  type ExpenseWriteResult,
  type ExpensesListState,
} from './expenses';
export {
  parseVoiceExpense,
  parseVoiceTask,
  parseVoiceJournal,
  parseVoiceResult,
  resolvePlotName,
  voiceJsonSchema,
  VOICE_KINDS,
  VOICE_EXPENSE_JSON_SCHEMA,
  VOICE_TASK_JSON_SCHEMA,
  VOICE_JOURNAL_JSON_SCHEMA,
  type VoiceKind,
  type VoiceExpense,
  type VoiceTask,
  type VoiceJournal,
  type VoiceParsed,
  type VoiceParseResult,
  type PlotMatch,
} from './voice';
export { profitabilityCsv, expensesCsv, journalCsv, type CsvReport } from './reports';
export {
  useFarmProfit,
  usePlotExpensesTotal,
  type FarmProfitForecast,
  type PlotProfitRow,
} from './profit';
export {
  confirmJournalFromTask,
  confirmExpenseFromTask,
  completionPromptVisibility,
  type CompletionPromptVisibility,
} from './completionPrompts';
export {
  useLogEntries,
  useSpraySuggestions,
  createLogEntry,
  updateLogEntry,
  logEntryTypeLabelKey,
  LOG_ENTRY_TYPES,
  type LogEntryType,
  type LogEntrySource,
  type LogEntry,
  type LogEntriesListState,
  type LogEntryInput,
  type LogEntryWriteResult,
  type SpraySuggestions,
} from './logEntries';
