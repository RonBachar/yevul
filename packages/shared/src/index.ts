export const SHARED_PACKAGE_VERSION = '0.0.1';

export {
  safeHarvestDate,
  openSafeHarvestDate,
  isCalendarDate,
  formatLocalDateOnly,
} from './safeHarvestDate';
export { t } from './i18n';
// A month of days as a grid, and the rules for moving around it. The founder,
// on every date field in the app: "it is very uncomfortable to set a day and a
// month. I want a calendar to open!" Pure policy -- which days a month contains,
// which column each one falls in, what the arrows do at a year boundary, and
// which days a given field is allowed to accept. Both clients have no test
// runner, so only touch and paint stay in the components. See the header of
// calendar.ts.
export {
  calendarBounds,
  calendarMonthLabel,
  calendarMonthOfDate,
  calendarMonthStartOffset,
  calendarViewMonth,
  calendarWeekdayKeys,
  calendarWeeks,
  canShiftCalendarMonth,
  daysInCalendarMonth,
  formatCalendarDate,
  isSelectableDate,
  recentDateOptions,
  sameCalendarMonth,
  shiftCalendarMonth,
  CALENDAR_NO_BOUNDS,
  CALENDAR_WEEKDAY_LABEL_KEYS,
  CALENDAR_WEEK_START,
  type CalendarBounds,
  type CalendarCell,
  type CalendarDay,
  type CalendarDirection,
  type CalendarMonth,
  type CalendarWeek,
  type RecentDateOption,
} from './calendar';
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
// Dragging a bottom sheet closed. Here for the same reason the pull rule above
// is: the mobile app has no test runner, so the distances, the velocity and the
// fade are decided away from React Native and only the PanResponder wiring
// stays on the device. See the header of sheetDrag.ts.
export {
  sheetDragOffset,
  sheetDismissDistance,
  sheetDismissDuration,
  sheetExitOffset,
  sheetScrimFade,
  shouldDismissSheet,
  SHEET_DISMISS_DISTANCE,
  SHEET_DISMISS_MAX_MS,
  SHEET_DISMISS_MIN_MS,
  SHEET_DISMISS_VELOCITY,
  SHEET_FLICK_DISTANCE,
  SHEET_SCRIM_MIN_OPACITY,
} from './sheetDrag';
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
  useCropSuggestions,
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
  type CropSuggestions,
} from './plots';
// Adding and editing a plot as a walk through tiles, the second screen on the
// pattern the founder approved on a device. Pure policy: which crops the grid
// offers and where they come from, which steps are asked at all, which unit a
// plot ends up carrying, what stops the save, and what the picked values become
// for createPlot and updatePlot. Here rather than in the two screens because
// neither client has a test runner. See the header of plotForm.ts, which also
// records, field by field, what became a tile and what stayed typed.
export {
  plotCropOptions,
  plotStepTitleKey,
  plotStepFieldKey,
  plotStepRequired,
  plotAreaUnit,
  newPlotDraft,
  plotDraftFromPlot,
  plotVisibleSteps,
  nextPlotStep,
  previousPlotStep,
  plotStepPosition,
  parsePlotAreaInput,
  plotAreaInputText,
  plotFormBlocker,
  plotCreateInput,
  plotUpdateInput,
  PLOT_STEPS,
  PLOT_CROP_TILE_LIMIT,
  PLOT_AREA_UNIT_FALLBACK,
  PLOT_BLOCKER_MESSAGE_KEYS,
  type PlotStep,
  type PlotDraft,
  type PlotFormMode,
  type PlotFormBlocker,
} from './plotForm';
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
  useExpenseSuggestions,
  createExpense,
  updateExpense,
  deleteExpense,
  attachReceipt,
  type Expense,
  type ExpenseSource,
  type ReceiptSource,
  type ExpenseInput,
  type ExpenseWriteResult,
  type ExpensesListState,
  type ExpenseSuggestions,
} from './expenses';
// Writing an expense, the third screen on the tile pattern and the first that is
// deliberately not a walk: an expense is the highest-frequency action in the
// product, and the taps were counted before the shape was chosen. Pure policy:
// what the name grid offers and where it comes from, what the amount box will
// accept, and what the four fields become for createExpense and updateExpense.
// Here rather than in the two sheets because neither client has a test runner.
// See the header of expenseForm.ts, which carries the tap counts and records,
// field by field, what became a square and what stayed typed.
export {
  expenseNameOptions,
  newExpenseDraft,
  expenseDraftFromExpense,
  parseExpenseAmountInput,
  expenseWriteInput,
  EXPENSE_NAME_TILE_LIMIT,
  type ExpenseDraft,
} from './expenseForm';
// Opening a receipt that is already filed. **The half of the attachment feature
// that was missing**: the bucket is private, so the only way to the bytes is a
// signed URL, and nothing in either client could produce one. See the header of
// receiptView.ts for the expiry and for why "no receipt" and "we could not fetch
// it" are two different answers.
export {
  loadReceiptDocument,
  pickLiveReceipt,
  receiptKind,
  RECEIPT_SIGNED_URL_SECONDS,
  type ReceiptDocument,
  type ReceiptKind,
  type ReceiptRow,
  type ReceiptViewResult,
} from './receiptView';
// Whether the farm is on a paid plan, stage 5 step 11. **Courtesy and never
// enforcement** — gate.ts refuses an unentitled scan with 403 whatever this
// says, and `entitled` is null when we do not know. See entitlement.ts.
export {
  farmEntitled,
  useFarmEntitlement,
  type SubscriptionRow,
  type FarmEntitlementState,
} from './entitlement';
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
// The client side of POST /ai/receipt, stage 5 step 11. voiceClient's sibling:
// transport only, no camera, no environment. **The one thing it does that
// voiceClient does not is tell the endpoint's two 403s apart** — a paid feature
// the farm has not bought, versus something broken it cannot fix. See the header
// of receiptClient.ts.
export {
  requestReceiptExtraction,
  RECEIPT_MESSAGE_KEYS,
  RECEIPT_PAID_PLAN_REASON,
  type ReceiptExtractionInput,
  type ReceiptFetch,
  type ReceiptFetchInit,
  type ReceiptFetchResponse,
  type ReceiptNextStep,
  type ReceiptSuccess,
  type ReceiptFailure,
  type ReceiptClientResult,
} from './receiptClient';
// The rules the microphone is steered by, stage 5. Pure policy, no audio and no
// endpoint: the native recorder lives in the mobile app, which has no test
// runner, so everything about it that can be decided without a device is
// decided here. See the header of voiceRecording.ts.
export {
  microphoneDecision,
  cameraPermissionDecision,
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
  VOICE_CONFIRM_ORIGIN_KEYS,
  type VoiceConfirmOrigin,
  type VoiceConfirmOriginKeys,
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
// Writing a spray as a walk through tiles, one question per screen. The
// founder's standing instruction for every data-entry screen in this app --
// "it should always be squares, big tappable squares" -- and the retirement of
// the horizontal chip strips he called unusable. Pure policy: which tiles each
// step offers, which steps get asked at all, and what the picked values become
// for createLogEntry. Here rather than in the component for the reason the rest
// of the mobile policy is: frontend/mobile has no test runner. See the header
// of sprayEntry.ts.
export {
  recentValues,
  sprayPestOptions,
  sprayMaterialOptions,
  sprayDoseOptions,
  sprayPhiOptions,
  sprayMaterialMemory,
  sprayPlotOptions,
  sprayDateOptions,
  sprayStepTitleKey,
  sprayStepFieldKey,
  sprayStepRequired,
  sprayVisibleSteps,
  sprayStepPosition,
  nextSprayStep,
  previousSprayStep,
  newSprayDraft,
  sprayDraftFromEntry,
  applySprayMaterial,
  sprayEntryBlocker,
  sprayEntryInput,
  parseSprayPhiDaysInput,
  SPRAY_STEPS,
  SPRAY_TILE_LIMIT,
  SPRAY_PHI_TILE_LIMIT,
  SPRAY_PHI_PRESET_DAYS,
  SPRAY_BLOCKER_MESSAGE_KEYS,
  type SprayStep,
  type SprayDraft,
  type SprayHistoryRow,
  type SprayMaterialMemory,
  type SprayPlotOption,
  type SprayDateOption,
  type SprayEntryBlocker,
} from './sprayEntry';
export {
  useLogEntries,
  useSpraySuggestions,
  createLogEntry,
  updateLogEntry,
  logEntryTypeLabelKey,
  initialLogEntryType,
  LOG_ENTRY_TYPES,
  type LogEntryType,
  type LogEntrySource,
  type LogEntry,
  type LogEntriesListState,
  type LogEntryInput,
  type LogEntryWriteResult,
  type SpraySuggestions,
} from './logEntries';
