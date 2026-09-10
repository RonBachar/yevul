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
// שם התצוגה של המשתמש, נשמר ב-user_metadata של Supabase Auth בלי
// טבלה ובלי מיגרציה. הקריאה נופלת מ-display_name ל-full_name ל-name,
// והכתיבה מטפלת ב-error שחוזר בלי לזרוק, כמו שאר הכתיבות בחבילה.
export { resolveDisplayName, updateDisplayName } from './displayName';
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
  // דומיין יחידת חומר הריסוס. חי כאן ליד שאר דומייני הערכים, אחרי
  // שהעברתו מ-sprayEntry שברה ייבוא מעגלי שהתריע עליו Metro על המכשיר.
  SPRAY_UNITS,
  sprayUnitLabelKey,
  isSprayUnit,
  type SprayUnit,
} from './settings';
export { useFarmSettings, type FarmSettingsForm } from './useFarmSettings';
// Farm sharing, stage 6. Reading the roster, inviting by email, changing a
// role and removing a member. The schema and RLS carry the enforcement (owner
// only, worker blocked from money); this is the shared read/write layer and
// the pure email rules that must match the DB's own lower()-based matching.
// See the header of members.ts.
export {
  useMembers,
  useMyRole,
  inviteMember,
  updateMemberRole,
  removeMember,
  normalizeInviteEmail,
  isValidInviteEmail,
  memberRoleLabelKey,
  canManageMembers,
  memberInitials,
  avatarUrl,
  uploadAvatar,
  assignableMembers,
  membersByUserId,
  currentMember,
  taskAssignee,
  workerModeShell,
  ASSIGNABLE_ROLES,
  type MemberRole,
  type MemberStatus,
  type AssignableRole,
  type FarmRole,
  type FarmMember,
  type Member,
  type MembersState,
  type MyRoleState,
  type InviteResult,
  type TaskAssignee,
  type CaptureKind,
  type PlotDetailTab,
  type WorkerModeShell,
} from './members';
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
  formatSprayUnitPrice,
  scaledAmountFontSize,
  currencySymbol,
  yieldRateUnitLabel,
  priceUnitLabel,
  formatSignedAmount,
  profitTone,
  type ProfitTone,
} from './format';
// The three units a yield and a price can be stated in, the conversion between
// them, the rule that a counted crop is priced by the count, and the plain
// sentence that shows a farmer the arithmetic he just typed. **The safety net
// for the whole forecast**: a total alone cannot be checked, while "8 דונם × 3
// טון לדונם = 24 טון. במחיר 4 ₪ לקילו ← צפי הכנסה 96,000 ₪" catches a farmer who
// meant 4 per kilo and typed 4000 per ton. Pure and tested; see yieldUnits.ts.
export {
  forecastSentence,
  forecastUnits,
  isYieldUnit,
  parseYieldUnit,
  reconcileYieldUnits,
  yieldUnitFactor,
  yieldUnitLabel,
  yieldUnitLabelKey,
  yieldUnitText,
  KG_PER_TON,
  YIELD_UNITS,
  type ForecastSentenceInput,
  type ForecastUnits,
  type YieldUnit,
} from './yieldUnits';
export {
  usePlots,
  usePlotDetail,
  useCropSuggestions,
  plotSummaryLine,
  expectedYieldDisplay,
  expectedPriceDisplay,
  expectedIncomeFor,
  plotProfitForecast,
  staleForecastSince,
  type PlotProfitForecast,
  createPlot,
  updatePlot,
  setPlotCrop,
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
// Shrinking a receipt photograph before it is uploaded, stage 5, the last item
// on the stage. **Nothing here resizes anything** — that is a native module on
// the phone and a canvas in the browser. What is here is the box a photograph is
// scaled into, the decision not to touch one that is already small, and the rule
// that a resize which threw costs the farmer waiting and never the receipt. Both
// clients call it; neither has a test runner. See the header of receiptImage.ts
// for where 1600 and 0.7 come from.
export {
  compressedOrOriginal,
  receiptResizeTarget,
  RECEIPT_COMPRESSED_MIME_TYPE,
  RECEIPT_JPEG_QUALITY,
  RECEIPT_MAX_EDGE_PIXELS,
  type ReceiptResizeTarget,
} from './receiptImage';
// The same job for a profile picture, and deliberately NOT the same rule. An
// avatar is always re-encoded, because the receipt compressor skips anything
// already under 1600px and a flat PNG under that ceiling can still blow the
// bucket's 8MB limit. See the header of avatarImage.ts.
export {
  avatarResizeTarget,
  AVATAR_COMPRESSED_MIME_TYPE,
  AVATAR_JPEG_QUALITY,
  AVATAR_MAX_EDGE_PIXELS,
  type AvatarResizeTarget,
} from './avatarImage';
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
  applySprayQuantity,
  applySprayUnit,
  applySprayUnitPrice,
  applySprayCost,
  sprayEntryBlocker,
  sprayEntryInput,
  parseSprayPhiDaysInput,
  parseSprayAmountInput,
  normalizeSprayMaterial,
  sprayPriceMemory,
  sprayMaterialChoices,
  sprayPricelistRows,
  computeSprayCost,
  SPRAY_STEPS,
  SPRAY_TILE_LIMIT,
  SPRAY_PHI_TILE_LIMIT,
  SPRAY_PHI_PRESET_DAYS,
  SPRAY_BLOCKER_MESSAGE_KEYS,
  type SprayStep,
  type SprayDraft,
  type SprayHistoryRow,
  type SprayMaterialMemory,
  type SprayPriceRow,
  type SprayPriceMemory,
  type SprayMaterialChoice,
  type SprayPlotOption,
  type SprayDateOption,
  type SprayEntryBlocker,
} from './sprayEntry';
// Work hours on a journal entry, and what an entry cost. The labour twin of the
// material pricelist: the cost is frozen at write time, a typed total always beats
// the computed one, and the farm's hourly rate in settings is only a default that
// pre-fills the next entry. computeEntryCost adds the two halves into the one
// number an entry costs, which since 2026-09-10 is the amount of the one expense
// the entry writes. Pure policy, here rather than in a component because neither
// client has a test runner. See the header of workEntry.ts.
export {
  computeWorkCost,
  computeEntryCost,
  entryCostEdited,
  recomputedEntryCost,
  workLogTotals,
  parseWorkAmountInput,
  // The kind-of-work grid: what it offers and how many squares it is. Free text
  // with a shortcut, never a list -- `type` is the closed domain and this is
  // deliberately not. See 20260910130000_work_kind.sql.
  workKindOptions,
  WORK_KIND_TILE_LIMIT,
  type WorkLogRow,
  type WorkLogTotals,
} from './workEntry';
export {
  useLogEntries,
  useSpraySuggestions,
  useWorkKindSuggestions,
  useSprayPrices,
  createLogEntry,
  updateLogEntry,
  deleteLogEntry,
  rememberSprayMaterialPrice,
  saveSprayPrice,
  logEntryTypeLabelKey,
  initialLogEntryType,
  LOG_ENTRY_TYPES,
  type LogEntryType,
  type LogEntrySource,
  type LogEntry,
  type LogEntriesListState,
  type LogEntryInput,
  type LogEntryWriteResult,
  type SprayPriceInput,
  type SprayPriceWriteResult,
  type SpraySuggestions,
  type WorkKindSuggestions,
} from './logEntries';
