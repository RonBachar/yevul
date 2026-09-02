export const SHARED_PACKAGE_VERSION = '0.0.1';

export {
  safeHarvestDate,
  openSafeHarvestDate,
  isCalendarDate,
  formatLocalDateOnly,
} from './safeHarvestDate';
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
// Pull-to-refresh. The rule lives here, away from React, because the mobile
// app has no test runner; only the wiring stays on the device. useLoadCount is
// not exported: it is how the list hooks in this package feed the rule, not
// something a screen calls.
export { pullSpinnerVisible, type RefreshSource } from './refresh';
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
// חילוץ מקול, שלב 5. **מוקפא בהחלטת היזם 2026-08-30**, ראה
// docs/roadmap.md. קוד טהור בלי תלויות ובלי צרכן, שממתין ליום שבו
// הקול ייבנה, ומשרת גם את OCR הקבלות.
export {
  parseVoiceExpense,
  parseVoiceTask,
  parseVoiceJournal,
  parseVoiceResult,
  resolvePlotName,
  resolvePlotCandidates,
  normalizePlotName,
  voiceJsonSchema,
  voiceWireJsonSchema,
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
// Receipt OCR, stage 5. **Two of its three parts are the expense schema above,
// on purpose**: a receipt produces the same record, confirmed on the same sheet
// and written to the same columns. Only the JSON schema the model is given is
// receipt-specific. See the header of receipt.ts.
export {
  parseReceipt,
  receiptWireJsonSchema,
  RECEIPT_JSON_SCHEMA,
  type ReceiptParsed,
} from './receipt';
// The client side of POST /ai/voice, stage 5. Transport only: it takes audio
// bytes and returns a typed outcome, it records nothing, and it reads no
// environment. See the header of voiceClient.ts.
export {
  requestVoiceExtraction,
  deviceToday,
  VOICE_AUDIO_FORMATS,
  VOICE_MESSAGE_KEYS,
  type VoiceAudioFormat,
  type VoiceExtractionInput,
  type VoiceFetch,
  type VoiceFetchInit,
  type VoiceFetchResponse,
  type VoiceNextStep,
  type VoiceSuccess,
  type VoiceFailure,
  type VoiceClientResult,
} from './voiceClient';
// The rules the microphone is steered by, stage 5. Pure policy, no audio and no
// endpoint: the native recorder lives in the mobile app, which has no test
// runner, so everything about it that can be decided without a device is
// decided here. See the header of voiceRecording.ts.
export {
  microphoneDecision,
  recordingReachedLimit,
  recordingTooShort,
  formatRecordingElapsed,
  voicePromptKey,
  VOICE_MAX_RECORDING_MILLIS,
  VOICE_MIN_RECORDING_MILLIS,
  type MicrophoneDecision,
  type MicrophonePermissionState,
} from './voiceRecording';
// The confirmation checkpoint, stage 5 step 9. Which fields a farmer may edit,
// what a spoken plot name resolves to, what stops a record from being written,
// and how a parsed record becomes the arguments of a create call. Pure policy,
// no Supabase and no rendering. See the header of voiceConfirm.ts.
export {
  voiceEditableFields,
  voicePlotStep,
  voicePlotStepId,
  voiceRecordBlocker,
  voiceHasMoreItems,
  voiceDateParts,
  voicePastDateFromParts,
  voiceFutureDateFromParts,
  parseVoiceAmountInput,
  parseVoicePhiDaysInput,
  voiceExpenseInput,
  voiceTaskInput,
  voiceJournalInput,
  VOICE_BLOCKER_MESSAGE_KEYS,
  VOICE_CONFIRM_MAX_EDITABLE_FIELDS,
  type VoiceEditableField,
  type VoicePlotOption,
  type VoicePlotStep,
  type VoiceRecordBlocker,
  type VoiceDateParts,
  type VoiceExpenseEdits,
  type VoiceTaskEdits,
  type VoiceJournalEdits,
} from './voiceConfirm';
export { profitabilityCsv, expensesCsv, journalCsv, type CsvReport } from './reports';
export {
  useFarmProfit,
  usePlotExpensesTotal,
  type FarmProfitForecast,
  type FarmProfitState,
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
